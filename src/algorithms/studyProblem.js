import { maxFlow } from './maxFlow.js';

/**
 * ============================================================================
 *  Shared state-space model for the study-scheduling problem
 *  (used unchanged by BFS, DFS and A*)
 * ============================================================================
 *
 *  Study UNIT  : one session-length block of a topic (a topic of 150 min with
 *                60-min sessions has 3 units). Units of one topic are
 *                interchangeable.
 *  DAY         : a calendar day with a capacity (number of session slots).
 *
 *  Units are put in a FIXED order (highest priority first). A search state is
 *  the set of assignments made so far for the first `depth` units.
 *
 *  INITIAL STATE : empty schedule (depth 0, nothing assigned).
 *  ACTION        : assign the next unit to a compatible day. It takes the
 *                  earliest free slot of that day (slots inside one day are
 *                  interchangeable for the cost model, so this symmetry
 *                  breaking keeps the search complete and optimality-preserving).
 *  TRANSITION    : result(state, action) = state + that assignment.
 *  GOAL          : every required unit is assigned (depth === number of units).
 *  HARD CONSTRAINTS (an action violating any of them is never generated):
 *     H1  a unit may only be studied on a day strictly BEFORE its exam day
 *     H2  a day holds at most `capacity` sessions (availability + workload limit)
 *     H3  at most `maxPerTopicPerDay` units of the same topic on one day
 *     H4  dead-end pruning: if the remaining units can no longer fit before
 *         their deadlines (Hall's condition on nested deadlines) the child is
 *         discarded. This is a *sound* necessary condition: it never removes a
 *         state that can still reach a goal.
 *  COST (both terms are integers >= 0), step cost of assigning unit u to day d:
 *     delay   = wDelay * importance * difficulty * d   (study hard / important topics earlier)
 *     load    = wLoad  * j     j = sessions already on day d (convex daily load, so work is
 *                                                            spread across days)
 *  STATE KEY     : per topic, the sorted multiset of assigned days. Two states
 *                  that differ only by swapping interchangeable units of one
 *                  topic share a key and are detected as duplicates.
 *
 *  HEURISTIC h(n)  (see docs/AI_ALGORITHMS.md for the full argument)
 *     Relax the problem: drop the per-topic cap (H3) and the per-unit deadline (H1),
 *     keeping only the COUNT form of the deadlines ("at least k units must be placed before day L"). Remaining
 *     units are matched heaviest-first to the earliest chosen days (rearrangement
 *     inequality), and the best number of units per day is found exactly by DP:
 *       h(n) = min over per-day counts of  sum(weight * day) + sum(in-day slot index * wLoad)
 *     h is the exact optimum of a relaxation, so h <= true cost-to-go
 *     (admissible). Every real action is also an edge of the relaxation with the
 *     same step cost, hence h(n) <= c(n,a,n') + h(n') (consistent).
 */

export const DEFAULT_WEIGHTS = Object.freeze({ delay: 1, load: 6 });

export const HEURISTIC_INFO = Object.freeze({
  name: 'Relaxed-assignment lower bound (exact DP)',
  admissible: true,
  consistent: true,
  description:
    'Minimum possible priority-weighted delay plus daily-load cost for the remaining units, found by dynamic ' +
    'programming over days. It ignores per-topic daily caps and keeps deadlines only as "at least k units ' +
    'before day L" counts.',
});

export function normalizeWeights(weights = {}) {
  const out = { ...DEFAULT_WEIGHTS };
  for (const key of Object.keys(DEFAULT_WEIGHTS)) {
    if (weights[key] === undefined || weights[key] === null) continue;
    const v = Number(weights[key]);
    if (!Number.isFinite(v) || v < 0) {
      throw new RangeError(`Cost weight "${key}" must be a non-negative number (got ${weights[key]}).`);
    }
    out[key] = Math.round(v);
  }
  return out;
}

/**
 * @param {object} input
 * @param {Array<{id:string, topicId:string, subjectId?:string, label?:string, topicName?:string,
 *   subjectName?:string, importance:number, difficulty:number, examDay:number}>} input.units
 * @param {Array<{index?:number, date?:string, capacity:number}>} input.days
 * @param {number} [input.maxPerTopicPerDay=2]
 * @param {object} [input.weights]
 */
export function createStudyProblem(input) {
  const W = normalizeWeights(input.weights);
  const maxPerTopicPerDay = Math.max(1, Math.floor(input.maxPerTopicPerDay ?? 2));
  const days = input.days.map((d, index) => ({
    ...d,
    index,
    capacity: Math.max(0, Math.floor(d.capacity)),
  }));
  const D = days.length;
  const cap = Int32Array.from(days.map((d) => d.capacity));
  const maxCap = cap.reduce((a, b) => Math.max(a, b), 0);

  // ---- fixed unit order: weight desc, earlier exam first, then topic id (keeps topic blocks contiguous)
  const units = input.units
    .map((u, original) => ({
      ...u,
      original,
      weight: u.importance * u.difficulty,
      limit: Math.max(0, Math.min(u.examDay, D)), // usable days are 0 .. limit-1
    }))
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        a.examDay - b.examDay ||
        (a.topicId < b.topicId ? -1 : a.topicId > b.topicId ? 1 : 0) ||
        a.original - b.original,
    )
    .map((u, index) => ({ ...u, index }));
  const m = units.length;

  // ---- maximal runs of the same topic (units of a run are interchangeable)
  const runStart = new Int32Array(m);
  const runs = [];
  for (let i = 0; i < m; i++) {
    if (i > 0 && units[i].topicId === units[i - 1].topicId) {
      runStart[i] = runStart[i - 1];
      runs[runs.length - 1][1] = i + 1;
    } else {
      runStart[i] = i;
      runs.push([i, i + 1]);
    }
  }

  // ---- suffixCount[s][L] = #units among indices >= s whose usable-day limit <= L
  const suffixCount = new Array(m + 1);
  suffixCount[m] = new Int32Array(D + 1);
  for (let s = m - 1; s >= 0; s--) {
    const row = Int32Array.from(suffixCount[s + 1]);
    for (let L = units[s].limit; L <= D; L++) row[L] += 1;
    suffixCount[s] = row;
  }

  // ---- scratch buffers for the heuristic DP (no allocation per call)
  const dpA = new Float64Array(m + 1);
  const dpB = new Float64Array(m + 1);

  const problem = {
    kind: 'study-schedule',
    units,
    days,
    weights: W,
    maxPerTopicPerDay,
    totalUnits: m,
    heuristicInfo: HEURISTIC_INFO,
    /** all step costs are integers >= 0 (validated by construction and by tests) */
    minStepCost: 0,
    costsNonNegative: true,

    initialState() {
      return { depth: 0, days: new Int16Array(m).fill(-1), used: new Uint8Array(D) };
    },

    isGoal(state) {
      return state.depth === m;
    },

    /** Hall-condition dead-end test for the suffix after assigning unit i to day d. */
    _feasibleAfter(state, i, d) {
      const row = suffixCount[i + 1];
      if (row[0] > 0) return false;
      let free = 0;
      for (let L = 1; L <= D; L++) {
        const day = L - 1;
        free += cap[day] - state.used[day] - (day === d ? 1 : 0);
        if (row[L] > free) return false;
      }
      return true;
    },

    _sameTopicOnDay(state, i, d) {
      let same = 0;
      for (let j = runStart[i]; j < i; j++) if (state.days[j] === d) same++;
      return same;
    },

    /** Legal actions for the next unit. `pruned` counts legal moves discarded as provable dead ends. */
    actions(state) {
      const i = state.depth;
      if (i >= m) return { actions: [], pruned: 0 };
      const unit = units[i];
      const actions = [];
      let pruned = 0;
      for (let d = 0; d < unit.limit; d++) {
        if (state.used[d] >= cap[d]) continue; // H2
        if (this._sameTopicOnDay(state, i, d) >= maxPerTopicPerDay) continue; // H3
        if (!this._feasibleAfter(state, i, d)) {
          pruned++; // H4
          continue;
        }
        actions.push({ unit: i, day: d, slot: state.used[d] });
      }
      return { actions, pruned };
    },

    /** Transition model: returns a NEW state, the input is never mutated. */
    result(state, action) {
      const days2 = state.days.slice();
      const used2 = state.used.slice();
      days2[action.unit] = action.day;
      used2[action.day] += 1;
      return { depth: state.depth + 1, days: days2, used: used2 };
    },

    costBreakdown(state, action) {
      const u = units[action.unit];
      const d = action.day;
      const delay = W.delay * u.weight * d;
      const load = W.load * state.used[d];
      return { delay, load, total: delay + load };
    },

    /** Non-negative step cost c(state, action). */
    stepCost(state, action) {
      return this.costBreakdown(state, action).total;
    },

    /** Canonical key: per topic run, the sorted multiset of assigned days. */
    key(state) {
      const parts = [];
      for (const [start, end] of runs) {
        if (start >= state.depth) break;
        const stop = Math.min(end, state.depth);
        const arr = [];
        for (let j = start; j < stop; j++) arr.push(state.days[j]);
        arr.sort((a, b) => a - b);
        parts.push(arr.join(','));
      }
      return `${state.depth}|${parts.join(';')}`;
    },

    /**
     * Admissible and consistent heuristic (see header comment).
     *
     * Exact optimum of a relaxed problem, computed by dynamic programming over days:
     *   dp[N] = cheapest cost of having placed the N heaviest remaining units on days 0..d.
     *   Placing n more units on day d costs  delay*weight*d  for each unit (heaviest first)
     *   plus load*(used+0) + ... + load*(used+n-1) for the in-day slot indices.
     *   Count constraint (necessary condition for the real problem): after day L-1 at least
     *   as many units as have an exam on/before day L must already be placed.
     * Cost: O(days * remaining units * slots-per-day) per call, allocation-free.
     */
    heuristic(state) {
      const rem = m - state.depth;
      if (rem <= 0) return 0;
      let cur = dpA;
      let nxt = dpB;
      cur.fill(Infinity, 0, rem + 1);
      cur[0] = 0;
      const demand = suffixCount[state.depth];
      const base = state.depth;
      for (let d = 0; d < D; d++) {
        const f = cap[d] - state.used[d];
        nxt.fill(Infinity, 0, rem + 1);
        const used = state.used[d];
        for (let N = 0; N <= rem; N++) {
          const v0 = cur[N];
          if (v0 === Infinity) continue;
          if (v0 < nxt[N]) nxt[N] = v0;
          let add = 0;
          for (let n = 1; n <= f && N + n <= rem; n++) {
            add += W.delay * units[base + N + n - 1].weight * d + W.load * (used + n - 1);
            const v = v0 + add;
            if (v < nxt[N + n]) nxt[N + n] = v;
          }
        }
        // deadline count constraint after finishing day d
        const need = demand[d + 1];
        for (let N = 0; N < need && N <= rem; N++) nxt[N] = Infinity;
        const swap = cur;
        cur = nxt;
        nxt = swap;
      }
      return cur[rem];
    },

    /** Assignments made so far as plain objects (for UI and conversion to a timetable). */
    assignmentsOf(state) {
      const out = [];
      for (let i = 0; i < state.depth; i++) out.push({ unit: units[i], day: state.days[i] });
      return out;
    },

    /** Recomputes the cost of any (partial or complete) assignment by replaying the unit order. */
    evaluateAssignment(dayOfUnit) {
      let state = this.initialState();
      let cost = 0;
      const totals = { delay: 0, load: 0 };
      for (let i = 0; i < dayOfUnit.length && i < m; i++) {
        const action = { unit: i, day: dayOfUnit[i], slot: state.used[dayOfUnit[i]] };
        const b = this.costBreakdown(state, action);
        totals.delay += b.delay;
        totals.load += b.load;
        cost += b.total;
        state = this.result(state, action);
      }
      return { cost, totals };
    },

    /** Exact test of the hard constraints H1-H3 via max-flow (units -> topics -> days). */
    rootFeasibility() {
      if (problem._feasCache) return problem._feasCache;
      const topicIds = [];
      const topicIndex = new Map();
      const topicInfo = [];
      for (const u of units) {
        if (!topicIndex.has(u.topicId)) {
          topicIndex.set(u.topicId, topicIds.length);
          topicIds.push(u.topicId);
          topicInfo.push({ topicId: u.topicId, label: u.topicName || u.label || u.topicId, limit: u.limit, count: 0, subjectName: u.subjectName });
        }
        topicInfo[topicIndex.get(u.topicId)].count += 1;
      }
      const T = topicIds.length;
      const S = 0;
      const sink = 1 + T + D;
      const edges = [];
      topicInfo.forEach((t, ti) => {
        edges.push([S, 1 + ti, t.count]);
        for (let d = 0; d < t.limit; d++) {
          if (cap[d] > 0) edges.push([1 + ti, 1 + T + d, maxPerTopicPerDay]);
        }
      });
      for (let d = 0; d < D; d++) if (cap[d] > 0) edges.push([1 + T + d, sink, cap[d]]);
      const flow = m === 0 ? 0 : maxFlow(sink + 1, edges, S, sink);

      const diagnostics = [];
      const limits = [...new Set(units.map((u) => u.limit))].sort((a, b) => a - b);
      for (const L of limits) {
        const demand = units.filter((u) => u.limit <= L).length;
        let supply = 0;
        for (let d = 0; d < L; d++) supply += cap[d];
        if (demand > supply) {
          const subjects = [...new Set(units.filter((u) => u.limit <= L).map((u) => u.subjectName).filter(Boolean))];
          diagnostics.push({
            type: 'deadline-capacity',
            limitDay: L,
            demand,
            supply,
            shortfall: demand - supply,
            subjects,
            message: `${demand} session(s) must finish within the first ${L} day(s) but only ${supply} slot(s) are available${subjects.length ? ` (${subjects.join(', ')})` : ''}.`,
          });
        }
      }
      for (const t of topicInfo) {
        let avail = 0;
        for (let d = 0; d < t.limit; d++) avail += Math.min(cap[d], maxPerTopicPerDay);
        if (t.count > avail) {
          diagnostics.push({
            type: 'topic-daily-cap',
            topicId: t.topicId,
            demand: t.count,
            supply: avail,
            shortfall: t.count - avail,
            message: `"${t.label}" needs ${t.count} session(s) but at most ${avail} fit before its exam with ${maxPerTopicPerDay} per day.`,
          });
        }
      }
      const result = {
        feasible: flow === m,
        required: m,
        maxPlaceable: flow,
        shortfall: m - flow,
        diagnostics,
      };
      problem._feasCache = result;
      return result;
    },
  };
  return problem;
}
