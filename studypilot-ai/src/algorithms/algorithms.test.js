import { describe, it, expect } from 'vitest';
import {
  PriorityQueue,
  createStudyProblem,
  createSearch,
  runSearch,
  STATUS,
} from './index.js';

function makeProblem({ topics, nDays, cap, perTopic = 2, weights }) {
  const units = [];
  topics.forEach((t, ti) => {
    for (let k = 0; k < t.units; k++) {
      units.push({
        id: `${ti}-${k}`,
        topicId: `t${ti}`,
        topicName: `Topic ${ti}`,
        subjectName: `Subj ${t.subject ?? 0}`,
        importance: t.importance,
        difficulty: t.difficulty,
        examDay: t.exam,
      });
    }
  });
  return createStudyProblem({
    units,
    days: Array.from({ length: nDays }, () => ({ capacity: cap })),
    maxPerTopicPerDay: perTopic,
    weights,
  });
}

const tiny = () =>
  makeProblem({
    topics: [
      { units: 2, importance: 5, difficulty: 4, exam: 4 },
      { units: 2, importance: 3, difficulty: 3, exam: 5 },
      { units: 2, importance: 2, difficulty: 2, exam: 5 },
    ],
    nDays: 5,
    cap: 2,
  });

/** Independent hard-constraint check of a complete day assignment. */
function checkHard(problem, days) {
  const used = new Map();
  const topicDay = new Map();
  problem.units.forEach((u, i) => {
    const d = days[i];
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThan(u.examDay); // H1
    used.set(d, (used.get(d) || 0) + 1);
    const k = `${u.topicId}|${d}`;
    topicDay.set(k, (topicDay.get(k) || 0) + 1);
  });
  for (const [d, n] of used) expect(n).toBeLessThanOrEqual(problem.days[d].capacity); // H2
  for (const n of topicDay.values()) expect(n).toBeLessThanOrEqual(problem.maxPerTopicPerDay); // H3
}

/** Exhaustive enumeration of the true optimum (tiny problems only). */
function bruteForceOptimum(problem) {
  let best = Infinity;
  const recurse = (state, g) => {
    if (g >= best) return;
    if (problem.isGoal(state)) {
      best = g;
      return;
    }
    for (const a of problem.actions(state).actions) {
      recurse(problem.result(state, a), g + problem.stepCost(state, a));
    }
  };
  recurse(problem.initialState(), 0);
  return best;
}

/** True cost-to-go h*(state) for every reachable state, by memoised exhaustive search. */
function trueCostToGo(problem) {
  const memo = new Map();
  const solve = (state) => {
    if (problem.isGoal(state)) return 0;
    const key = problem.key(state);
    if (memo.has(key)) return memo.get(key);
    let best = Infinity;
    for (const a of problem.actions(state).actions) {
      best = Math.min(best, problem.stepCost(state, a) + solve(problem.result(state, a)));
    }
    memo.set(key, best);
    return best;
  };
  return solve;
}

describe('PriorityQueue', () => {
  it('pops in priority order and is FIFO among ties', () => {
    const q = new PriorityQueue((a, b) => a.p - b.p);
    [{ p: 3, n: 'c' }, { p: 1, n: 'a1' }, { p: 2, n: 'b' }, { p: 1, n: 'a2' }].forEach((x) => q.push(x));
    expect(q.topK(2).map((x) => x.n)).toEqual(['a1', 'a2']);
    expect([q.pop(), q.pop(), q.pop(), q.pop()].map((x) => x.n)).toEqual(['a1', 'a2', 'b', 'c']);
    expect(q.pop()).toBeUndefined();
  });
});

describe('state-space model', () => {
  it('only generates actions that respect the hard constraints', () => {
    const p = tiny();
    let state = p.initialState();
    const { actions } = p.actions(state);
    expect(actions.length).toBeGreaterThan(0);
    // unit 0 belongs to the topic with exam on day 4: usable days are 0..3
    for (const a of actions) expect(a.day).toBeLessThan(4);
    state = p.result(state, actions[0]);
    expect(p.initialState().depth).toBe(0); // transition does not mutate the input
    expect(state.depth).toBe(1);
  });

  it('never exceeds per-topic or per-day limits', () => {
    const p = makeProblem({ topics: [{ units: 3, importance: 3, difficulty: 3, exam: 3 }], nDays: 3, cap: 3, perTopic: 2 });
    const r = runSearch('astar', p);
    expect(r.status).toBe(STATUS.GOAL);
    checkHard(p, r.schedule);
  });

  it('assigns equal keys to states that differ only by swapping units of the same topic', () => {
    const p = makeProblem({ topics: [{ units: 2, importance: 3, difficulty: 3, exam: 5 }], nDays: 5, cap: 2 });
    const s0 = p.initialState();
    const a = (s, day) => ({ unit: s.depth, day, slot: s.used[day] });
    const s1 = p.result(p.result(s0, a(s0, 1)), a(p.result(s0, a(s0, 1)), 3));
    const t1 = p.result(s0, a(s0, 3));
    const s2 = p.result(t1, a(t1, 1));
    expect(p.key(s1)).toBe(p.key(s2));
  });

  it('has non-negative step costs on every reachable edge', () => {
    const p = tiny();
    const stack = [p.initialState()];
    let edges = 0;
    while (stack.length && edges < 3000) {
      const s = stack.pop();
      for (const a of p.actions(s).actions) {
        expect(p.stepCost(s, a)).toBeGreaterThanOrEqual(0);
        edges++;
        stack.push(p.result(s, a));
      }
    }
    expect(edges).toBeGreaterThan(50);
  });

  it('rejects negative cost weights', () => {
    expect(() => makeProblem({ topics: [{ units: 1, importance: 1, difficulty: 1, exam: 2 }], nDays: 2, cap: 1, weights: { delay: -1 } })).toThrow();
  });
});

describe('heuristic properties (checked against exhaustive search)', () => {
  const problems = {
    tiny: tiny(),
    'tight deadlines': makeProblem({
      topics: [
        { units: 2, importance: 1, difficulty: 1, exam: 2 },
        { units: 2, importance: 5, difficulty: 5, exam: 5 },
        { units: 1, importance: 3, difficulty: 2, exam: 4 },
      ],
      nDays: 5,
      cap: 2,
    }),
    'zero load weight': makeProblem({
      topics: [
        { units: 3, importance: 4, difficulty: 3, exam: 4 },
        { units: 2, importance: 2, difficulty: 5, exam: 4 },
      ],
      nDays: 4,
      cap: 2,
      weights: { load: 0 },
    }),
  };
  for (const [name, p] of Object.entries(problems)) {
    it(`is admissible and consistent: ${name}`, () => {
      const hStar = trueCostToGo(p);
      const seen = new Set();
      const stack = [p.initialState()];
      let checked = 0;
      while (stack.length) {
        const s = stack.pop();
        const k = p.key(s);
        if (seen.has(k)) continue;
        seen.add(k);
        const h = p.heuristic(s);
        const star = hStar(s);
        if (star !== Infinity) expect(h).toBeLessThanOrEqual(star); // admissible
        for (const a of p.actions(s).actions) {
          const s2 = p.result(s, a);
          expect(h).toBeLessThanOrEqual(p.stepCost(s, a) + p.heuristic(s2)); // consistent
          stack.push(s2);
        }
        checked++;
      }
      expect(checked).toBeGreaterThan(10);
      expect(p.heuristic(p.initialState())).toBeLessThanOrEqual(bruteForceOptimum(p));
    });
  }
});

describe('BFS, DFS and A*', () => {
  it('all three find valid complete schedules on the same input', () => {
    const p = tiny();
    for (const algo of ['bfs', 'dfs', 'astar']) {
      const r = runSearch(algo, p);
      expect(r.status).toBe(STATUS.GOAL);
      expect(r.schedule).toHaveLength(p.totalUnits);
      checkHard(p, r.schedule);
      // the reported cost equals an independent re-evaluation of the schedule
      expect(r.cost).toBe(p.evaluateAssignment(r.schedule).cost);
    }
  });

  it('A* returns the true optimum and is the only one flagged optimal', () => {
    const p = tiny();
    const optimum = bruteForceOptimum(p);
    const a = runSearch('astar', p);
    const b = runSearch('bfs', p);
    const d = runSearch('dfs', p);
    expect(a.cost).toBe(optimum);
    expect(a.optimal).toBe(true);
    expect(b.cost).toBeGreaterThanOrEqual(optimum);
    expect(d.cost).toBeGreaterThanOrEqual(optimum);
    expect(b.optimal).toBe(false);
    expect(d.optimal).toBe(false);
  });

  it('A* expands far fewer states than BFS', () => {
    const p = tiny();
    expect(runSearch('astar', p).stats.expanded).toBeLessThan(runSearch('bfs', p).stats.expanded);
  });

  it('detects duplicate states when interchangeable units exist', () => {
    const r = runSearch('bfs', tiny());
    expect(r.stats.duplicates).toBeGreaterThan(0);
  });

  it('reports infeasible problems and never claims a schedule', () => {
    const p = makeProblem({ topics: [{ units: 5, importance: 3, difficulty: 3, exam: 2 }], nDays: 2, cap: 2 });
    for (const algo of ['bfs', 'dfs', 'astar']) {
      const r = runSearch(algo, p);
      expect(r.status).toBe(STATUS.INFEASIBLE);
      expect(r.schedule).toBeNull();
      expect(r.optimal).toBe(false);
      expect(r.message).toMatch(/cannot be placed/);
    }
    expect(p.rootFeasibility().diagnostics.length).toBeGreaterThan(0);
  });

  it('respects search limits and never claims optimality when stopped', () => {
    const p = makeProblem({
      topics: Array.from({ length: 6 }, (_, i) => ({ units: 3, importance: 1 + (i % 5), difficulty: 1 + ((i * 2) % 5), exam: 12 })),
      nDays: 12,
      cap: 3,
    });
    const r = runSearch('bfs', p, { limits: { maxExpansions: 50 } });
    expect(r.status).toBe(STATUS.LIMIT);
    expect(r.limit).toBe('expansions');
    expect(r.stats.expanded).toBe(50);
    expect(r.schedule).toBeNull();
    expect(r.optimal).toBe(false);
  });

  it('an empty problem is trivially solved', () => {
    const p = createStudyProblem({ units: [], days: [{ capacity: 2 }] });
    const r = runSearch('astar', p);
    expect(r.status).toBe(STATUS.GOAL);
    expect(r.cost).toBe(0);
  });

  it('DFS backtracks out of dead ends instead of failing', () => {
    // second topic must take day 0 but a naive early pick can block it
    const p = makeProblem({
      topics: [
        { units: 1, importance: 5, difficulty: 5, exam: 3 },
        { units: 2, importance: 1, difficulty: 1, exam: 1 },
      ],
      nDays: 3,
      cap: 2,
      perTopic: 2,
    });
    const r = runSearch('dfs', p);
    expect(r.status).toBe(STATUS.GOAL);
    checkHard(p, r.schedule);
  });
});

describe('visualisation reflects real execution', () => {
  it('stepping the generator yields the same statistics as a full run', () => {
    const p = tiny();
    for (const algo of ['bfs', 'dfs', 'astar']) {
      const gen = createSearch(algo, p, { trace: true });
      let step = gen.next();
      let lastExpand = null;
      let expandEvents = 0;
      while (!step.done) {
        if (step.value.type === 'expand') {
          expandEvents++;
          lastExpand = step.value;
        }
        step = gen.next();
      }
      const full = runSearch(algo, p);
      expect(step.value.cost).toBe(full.cost);
      expect(step.value.stats.expanded).toBe(full.stats.expanded);
      expect(step.value.stats.generated).toBe(full.stats.generated);
      expect(expandEvents).toBe(full.stats.expanded);
      expect(lastExpand.stats.expanded).toBe(full.stats.expanded);
    }
  });

  it('trace events carry node, children and frontier preview', () => {
    const gen = createSearch('astar', tiny(), { trace: true });
    gen.next(); // init
    const ev = gen.next().value;
    expect(ev.type).toBe('expand');
    expect(ev.node.depth).toBe(0);
    expect(ev.children.length).toBeGreaterThan(0);
    expect(ev.children[0]).toHaveProperty('f');
    expect(ev.frontier.length).toBeGreaterThan(0);
  });
});
