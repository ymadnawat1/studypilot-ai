import { PriorityQueue } from './priorityQueue.js';

/**
 * ============================================================================
 *  BFS, DFS and A* — implemented from scratch over a generic problem interface
 * ============================================================================
 *
 * Every algorithm is a GENERATOR. It yields one event per node expansion and
 * returns the final result object. This gives two ways to run exactly the same
 * code:
 *   - runSearch(...)        : drive the generator to the end (benchmarks, planner, tests)
 *   - createSearch(...)     : the Search Visualizer calls .next() one step at a time
 *
 * Problem interface (see studyProblem.js):
 *   initialState(), isGoal(s), actions(s) -> {actions, pruned}, result(s,a),
 *   stepCost(s,a), key(s), heuristic(s), rootFeasibility()
 */

export const STATUS = Object.freeze({
  GOAL: 'goal',
  INFEASIBLE: 'infeasible',
  LIMIT: 'limit_reached',
});

export const ALGORITHMS = Object.freeze({
  bfs: { id: 'bfs', name: 'Breadth-First Search', short: 'BFS', frontier: 'FIFO queue' },
  dfs: { id: 'dfs', name: 'Depth-First Search', short: 'DFS', frontier: 'LIFO stack (backtracking)' },
  astar: { id: 'astar', name: 'A* Search', short: 'A*', frontier: 'Priority queue ordered by f = g + h' },
});

export const DEFAULT_LIMITS = Object.freeze({
  maxExpansions: 20000,
  maxMillis: 4000,
  maxFrontier: 400000,
});

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function makeContext(algorithm, problem, options) {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
  const trace = !!options.trace;
  const stats = {
    expanded: 0,
    generated: 0,
    duplicates: 0,
    pruned: 0,
    deadEnds: 0,
    reopened: 0,
    backtracks: 0,
    maxFrontier: 0,
    frontierSize: 0,
    maxDepth: 0,
  };
  const started = now();
  let nextId = 0;
  let best = null; // deepest, then cheapest node seen (for partial results)

  const ctx = {
    algorithm,
    problem,
    limits,
    trace,
    stats,
    started,
    makeNode(parent, state, action, g, h) {
      const node = {
        id: nextId++,
        parent,
        state,
        action,
        g,
        h,
        f: g + h,
        depth: state.depth,
      };
      if (node.depth > stats.maxDepth) stats.maxDepth = node.depth;
      if (!best || node.depth > best.depth || (node.depth === best.depth && node.g < best.g)) best = node;
      return node;
    },
    track(frontierSize) {
      stats.frontierSize = frontierSize;
      if (frontierSize > stats.maxFrontier) stats.maxFrontier = frontierSize;
    },
    limitHit(frontierSize) {
      if (stats.expanded >= limits.maxExpansions) return 'expansions';
      if (now() - started > limits.maxMillis) return 'time';
      if (frontierSize > limits.maxFrontier) return 'frontier';
      return null;
    },
    view(node, status) {
      return {
        id: node.id,
        parentId: node.parent ? node.parent.id : null,
        depth: node.depth,
        g: node.g,
        h: node.h,
        f: node.f,
        action: node.action ? { unit: node.action.unit, day: node.action.day, slot: node.action.slot } : null,
        status,
      };
    },
    pathTo(node) {
      const actions = [];
      for (let n = node; n && n.action; n = n.parent) actions.push(n.action);
      return actions.reverse();
    },
    finish(status, goalNode, extra = {}) {
      const runtimeMs = now() - started;
      let schedule = null;
      let cost = null;
      if (goalNode) {
        schedule = Array.from(goalNode.state.days);
        cost = goalNode.g;
      }
      const partialNode = goalNode || best;
      const info = optimalityInfo(algorithm, problem, status, extra.limit);
      return {
        algorithm,
        status,
        optimal: info.optimal,
        optimalityNote: info.note,
        cost,
        schedule,
        path: goalNode ? ctx.pathTo(goalNode) : [],
        goalNodeId: goalNode ? goalNode.id : null,
        bestPartial: partialNode
          ? { depth: partialNode.depth, days: Array.from(partialNode.state.days), g: partialNode.g }
          : { depth: 0, days: [], g: 0 },
        limit: extra.limit || null,
        message: extra.message || '',
        stats: { ...stats, runtimeMs },
        totalUnits: problem.totalUnits,
      };
    },
  };
  return ctx;
}

/** The only place that decides whether a result may be called "optimal". */
function optimalityInfo(algorithm, problem, status, limit) {
  if (status !== STATUS.GOAL) return { optimal: false, note: 'No complete schedule was returned.' };
  if (algorithm === 'bfs') {
    return {
      optimal: false,
      note:
        'BFS returns the shallowest goal. Every complete schedule has the same depth (one action per unit), ' +
        'so BFS gives no guarantee about schedule cost.',
    };
  }
  if (algorithm === 'dfs') {
    return { optimal: false, note: 'DFS returns the first complete schedule it reaches; its cost is not minimised.' };
  }
  const h = problem.heuristicInfo || {};
  const nonNegative = problem.costsNonNegative === true && problem.minStepCost >= 0;
  if (!limit && h.admissible && nonNegative) {
    return {
      optimal: true,
      note:
        `Optimal: all step costs are >= 0, the heuristic is admissible${h.consistent ? ' and consistent' : ''}, ` +
        'and the goal was selected for expansion (not merely generated) before any search limit was hit.',
    };
  }
  return {
    optimal: false,
    note: 'Optimality is not claimed: the heuristic is not certified admissible or a search limit interfered.',
  };
}

function infeasibleResult(ctx, feas) {
  const detail = feas.diagnostics && feas.diagnostics.length ? ` ${feas.diagnostics[0].message}` : '';
  return ctx.finish(STATUS.INFEASIBLE, null, {
    message: `No schedule can satisfy the hard constraints: ${feas.shortfall} of ${feas.required} session(s) cannot be placed.${detail}`,
  });
}

function frontierEvent(ctx, type, extra) {
  return { type, algorithm: ctx.algorithm, stats: { ...ctx.stats }, ...extra };
}

function limitMessage(limit, stats) {
  const what = { expansions: 'expansion', time: 'time', frontier: 'frontier-size' }[limit] || limit;
  return `Search stopped: ${what} limit reached after ${stats.expanded} expansions without finding a complete schedule.`;
}

/* -------------------------------------------------------------------------- */
/*  Breadth-First Search — FIFO queue, goal test when a node is generated      */
/* -------------------------------------------------------------------------- */
export function* bfsSearch(problem, options = {}) {
  const ctx = makeContext('bfs', problem, options);
  const feas = problem.rootFeasibility ? problem.rootFeasibility() : { feasible: true };
  const root = ctx.makeNode(null, problem.initialState(), null, 0, problem.heuristic(problem.initialState()));
  yield frontierEvent(ctx, 'init', { node: ctx.view(root, 'frontier'), frontier: [] });
  if (!feas.feasible) return infeasibleResult(ctx, feas);
  if (problem.isGoal(root.state)) return ctx.finish(STATUS.GOAL, root);

  const queue = [root];
  let head = 0;
  const seen = new Set([problem.key(root.state)]);
  ctx.track(1);

  while (head < queue.length) {
    const limit = ctx.limitHit(queue.length - head);
    if (limit) return ctx.finish(STATUS.LIMIT, null, { limit, message: limitMessage(limit, ctx.stats) });

    const node = queue[head++];
    ctx.stats.expanded++;
    const { actions, pruned } = problem.actions(node.state);
    ctx.stats.pruned += pruned;
    const children = [];
    let goal = null;
    for (const action of actions) {
      const state = problem.result(node.state, action);
      const g = node.g + problem.stepCost(node.state, action);
      const key = problem.key(state);
      ctx.stats.generated++;
      const child = ctx.makeNode(node, state, action, g, problem.heuristic(state));
      if (seen.has(key)) {
        ctx.stats.duplicates++;
        if (ctx.trace) children.push(ctx.view(child, 'duplicate'));
        continue;
      }
      seen.add(key);
      if (problem.isGoal(state)) {
        goal = child;
        if (ctx.trace) children.push(ctx.view(child, 'goal'));
        break;
      }
      queue.push(child);
      if (ctx.trace) children.push(ctx.view(child, 'frontier'));
    }
    if (actions.length === 0) ctx.stats.deadEnds++;
    if (head > 50000 && head * 2 > queue.length) {
      queue.splice(0, head); // reclaim memory of dequeued nodes
      head = 0;
    }
    ctx.track(queue.length - head);
    yield frontierEvent(ctx, 'expand', {
      node: ctx.view(node, 'expanded'),
      children,
      prunedChildren: pruned,
      frontier: ctx.trace ? queue.slice(head, head + 6).map((n) => ctx.view(n, 'frontier')) : [],
    });
    if (goal) return ctx.finish(STATUS.GOAL, goal);
  }
  return ctx.finish(STATUS.INFEASIBLE, null, {
    message: 'The whole reachable state space was explored and no complete schedule satisfies the hard constraints.',
  });
}

/* -------------------------------------------------------------------------- */
/*  Depth-First Search — explicit stack with backtracking                      */
/* -------------------------------------------------------------------------- */
export function* dfsSearch(problem, options = {}) {
  const ctx = makeContext('dfs', problem, options);
  const guided = options.ordering === 'heuristic';
  const feas = problem.rootFeasibility ? problem.rootFeasibility() : { feasible: true };
  const root = ctx.makeNode(null, problem.initialState(), null, 0, problem.heuristic(problem.initialState()));
  yield frontierEvent(ctx, 'init', { node: ctx.view(root, 'frontier'), frontier: [] });
  if (!feas.feasible) return infeasibleResult(ctx, feas);
  if (problem.isGoal(root.state)) return ctx.finish(STATUS.GOAL, root);

  const stack = [root];
  const seen = new Set([problem.key(root.state)]);
  ctx.track(1);
  let previous = null;

  while (stack.length > 0) {
    const limit = ctx.limitHit(stack.length);
    if (limit) return ctx.finish(STATUS.LIMIT, null, { limit, message: limitMessage(limit, ctx.stats) });

    const node = stack.pop();
    ctx.stats.expanded++;
    const backtracked = previous !== null && node.parent !== previous;
    if (backtracked) ctx.stats.backtracks++;
    previous = node;

    const { actions, pruned } = problem.actions(node.state);
    ctx.stats.pruned += pruned;
    const fresh = [];
    let goal = null;
    const children = [];
    for (const action of actions) {
      const state = problem.result(node.state, action);
      const g = node.g + problem.stepCost(node.state, action);
      const key = problem.key(state);
      ctx.stats.generated++;
      const child = ctx.makeNode(node, state, action, g, problem.heuristic(state));
      if (seen.has(key)) {
        ctx.stats.duplicates++;
        if (ctx.trace) children.push(ctx.view(child, 'duplicate'));
        continue;
      }
      seen.add(key);
      if (problem.isGoal(state)) {
        goal = child;
        if (ctx.trace) children.push(ctx.view(child, 'goal'));
        break;
      }
      fresh.push(child);
      if (ctx.trace) children.push(ctx.view(child, 'frontier'));
    }
    if (actions.length === 0) ctx.stats.deadEnds++;
    if (!goal) {
      // Push so that the preferred child is popped first.
      if (guided) fresh.sort((a, b) => a.f - b.f || a.h - b.h || a.id - b.id);
      for (let i = fresh.length - 1; i >= 0; i--) stack.push(fresh[i]);
    }
    ctx.track(stack.length);
    yield frontierEvent(ctx, 'expand', {
      node: ctx.view(node, 'expanded'),
      children,
      backtracked,
      prunedChildren: pruned,
      frontier: ctx.trace ? stack.slice(-6).reverse().map((n) => ctx.view(n, 'frontier')) : [],
    });
    if (goal) return ctx.finish(STATUS.GOAL, goal);
  }
  return ctx.finish(STATUS.INFEASIBLE, null, {
    message: 'The whole reachable state space was explored and no complete schedule satisfies the hard constraints.',
  });
}

/* -------------------------------------------------------------------------- */
/*  A* — priority queue on f = g + h, goal test when a node is EXPANDED        */
/* -------------------------------------------------------------------------- */
export function* astarSearch(problem, options = {}) {
  const ctx = makeContext('astar', problem, options);
  const feas = problem.rootFeasibility ? problem.rootFeasibility() : { feasible: true };
  const rootState = problem.initialState();
  const root = ctx.makeNode(null, rootState, null, 0, problem.heuristic(rootState));
  yield frontierEvent(ctx, 'init', { node: ctx.view(root, 'frontier'), frontier: [] });
  if (!feas.feasible) return infeasibleResult(ctx, feas);

  // lowest f first; on ties prefer the smaller h (deeper node), then FIFO
  const open = new PriorityQueue((a, b) => a.f - b.f || a.h - b.h);
  const bestG = new Map();
  const closed = new Set();
  const rootKey = problem.key(rootState);
  bestG.set(rootKey, 0);
  open.push(root);
  ctx.track(1);

  while (!open.isEmpty()) {
    const limit = ctx.limitHit(open.size);
    if (limit) return ctx.finish(STATUS.LIMIT, null, { limit, message: limitMessage(limit, ctx.stats) });

    const node = open.pop();
    const key = problem.key(node.state);
    if (closed.has(key) || node.g > bestG.get(key)) continue; // stale queue entry

    if (problem.isGoal(node.state)) {
      yield frontierEvent(ctx, 'goal', { node: ctx.view(node, 'goal'), frontier: [] });
      return ctx.finish(STATUS.GOAL, node);
    }

    closed.add(key);
    ctx.stats.expanded++;
    const { actions, pruned } = problem.actions(node.state);
    ctx.stats.pruned += pruned;
    const children = [];
    for (const action of actions) {
      const state = problem.result(node.state, action);
      const g = node.g + problem.stepCost(node.state, action);
      const k = problem.key(state);
      ctx.stats.generated++;
      const child = ctx.makeNode(node, state, action, g, problem.heuristic(state));
      const prior = bestG.get(k);
      if (prior !== undefined && prior <= g) {
        ctx.stats.duplicates++;
        if (ctx.trace) children.push(ctx.view(child, 'duplicate'));
        continue;
      }
      if (prior !== undefined) {
        // cheaper route to a known state (only possible with an inconsistent heuristic): reopen it
        ctx.stats.reopened++;
        closed.delete(k);
      }
      bestG.set(k, g);
      open.push(child);
      if (ctx.trace) children.push(ctx.view(child, 'frontier'));
    }
    if (actions.length === 0) ctx.stats.deadEnds++;
    ctx.track(open.size);
    yield frontierEvent(ctx, 'expand', {
      node: ctx.view(node, 'expanded'),
      children,
      prunedChildren: pruned,
      frontier: ctx.trace ? open.topK(6).map((n) => ctx.view(n, 'frontier')) : [],
    });
  }
  return ctx.finish(STATUS.INFEASIBLE, null, {
    message: 'The open list became empty: no complete schedule satisfies the hard constraints.',
  });
}

const GENERATORS = { bfs: bfsSearch, dfs: dfsSearch, astar: astarSearch };

/** Creates a step-able search (generator) — used by the visualizer. */
export function createSearch(algorithm, problem, options = {}) {
  const gen = GENERATORS[algorithm];
  if (!gen) throw new Error(`Unknown algorithm "${algorithm}". Use one of: ${Object.keys(GENERATORS).join(', ')}`);
  return gen(problem, options);
}

/** Runs a search to completion and returns the result object. */
export function runSearch(algorithm, problem, options = {}) {
  const search = createSearch(algorithm, problem, options);
  let step = search.next();
  while (!step.done) step = search.next();
  return step.value;
}
