// Content for the in-app AISC Viva Guide (the same ideas are in docs/AI_ALGORITHMS.md and docs/VIVA_QUESTIONS.md).

export const MODEL = [
  ['Initial state', 'An empty schedule: no study unit has been assigned to a day yet.'],
  ['Action', 'Assign the next study unit (a session-length block of a topic) to a compatible day. It takes the earliest free slot of that day.'],
  ['Transition model', 'result(state, action) returns a NEW state with that unit assigned; the old state is never changed.'],
  ['Goal test', 'Every required unit is assigned and no hard constraint is broken.'],
  ['Hard constraints', 'Study before the exam day · day capacity (availability and daily limit) · max sessions of one topic per day.'],
  ['Step cost', 'delay = weight × importance × difficulty × day index (important, hard topics early) + load = weight × sessions already on that day (spread work out). Both are integers ≥ 0.'],
  ['State key', 'For each topic, the sorted list of days its units use. Swapping two identical units of a topic gives the same key, so the duplicate is skipped.'],
];

export const ALGORITHMS_INFO = [
  {
    name: 'Breadth-First Search (BFS)',
    how: 'FIFO queue. Expands all nodes at depth d before depth d+1. The goal test is applied when a node is generated.',
    complete: 'Yes (finite space).',
    optimal: 'Not for schedule cost. Every complete schedule has the same depth (one action per unit), so "shallowest goal" says nothing about cost.',
    time: 'O(b^d)',
    space: 'O(b^d) — the whole frontier is stored',
  },
  {
    name: 'Depth-First Search (DFS)',
    how: 'LIFO stack. Goes deep first and backtracks when a branch is a dead end.',
    complete: 'Yes here: the graph is finite and acyclic, and duplicates are skipped.',
    optimal: 'No. It returns the first complete schedule it reaches.',
    time: 'O(b^m) worst case',
    space: 'O(b·m) for the path; more here because the seen-set stores keys',
  },
  {
    name: 'A* Search',
    how: 'Priority queue ordered by f(n) = g(n) + h(n). The goal test is applied when a node is selected for expansion.',
    complete: 'Yes (finite space, costs ≥ 0).',
    optimal: 'Yes, when h is admissible (never overestimates), costs are ≥ 0, and the search was not cut off by a limit.',
    time: 'Depends on how close h is to the true cost; exponential worst case',
    space: 'O(number of generated states)',
  },
];

export const HEURISTIC = {
  idea:
    'Pretend the rules are easier: ignore the per-topic daily cap and treat each exam deadline only as a count ("at least k sessions before day L"). ' +
    'The cheapest way to place the remaining units in that easier problem is found exactly with a small dynamic program over days: the heaviest remaining units go to the earliest days, and the DP chooses how many units to put on each day.',
  admissible:
    'The real problem has every rule of the easy one plus extra rules, so its best cost can only be higher or equal. Therefore h(n) ≤ true remaining cost: admissible.',
  consistent:
    'Every real action is also an action of the easy problem with the same cost, so h(n) ≤ c(n, a, n′) + h(n′): consistent. A* with a consistent heuristic never needs to re-open a closed state.',
  explain:
    'Example: two units left, weights 20 and 2, free days 0 and 1. Best easy plan: weight 20 on day 0 (cost 0), weight 2 on day 1 (cost 2) → h = 2 (+ load costs). Any real plan costs at least this much.',
};

export const QUESTIONS = [
  ['What is a state space?', 'The set of all states reachable from the initial state by legal actions. Here a state is a partial schedule and an action assigns one unit to a day.'],
  ['What is the difference between a state and a node?', 'A state is a configuration of the problem. A node is a bookkeeping record in the search tree: state + parent + action + g + h + depth. Two nodes can hold the same state.'],
  ['Why do BFS and A* differ on this problem?', 'BFS ignores cost and explores level by level, so it blows up exponentially. A* uses h to focus on promising partial schedules and returns the cheapest one.'],
  ['Is BFS optimal here?', 'BFS is optimal for the number of actions, but every complete schedule uses exactly one action per unit, so all goals are at the same depth. It therefore gives no cost guarantee.'],
  ['Why is DFS fast but poor in quality?', 'It dives straight to the first complete schedule (few expansions) but never compares it with other schedules, so cost is not minimised.'],
  ['What is an admissible heuristic?', 'One that never overestimates the true cost to reach the goal. It is the condition that makes A* optimal.'],
  ['What is a consistent heuristic?', 'h(n) ≤ c(n,a,n′) + h(n′) for every edge. Consistent implies admissible, and f never decreases along a path.'],
  ['Why must step costs be non-negative?', 'A* assumes that extending a path never makes it cheaper. Negative costs would break the optimality argument and the stopping rule.'],
  ['How do you detect duplicate states?', 'Every state has a canonical key (per-topic sorted day multiset). A hash set of keys makes the check O(1) on average.'],
  ['What happens if no schedule exists?', 'A max-flow check detects it before the search. The planner reports the shortfall and the reason, builds a valid partial plan, and never claims it is complete.'],
  ['What if the search limit is reached?', 'The result says "limit_reached" and is not claimed optimal. The planner falls back to a heuristic-guided DFS and labels the plan as not guaranteed optimal.'],
  ['What is dead-end pruning?', 'If the remaining units can no longer fit before their deadlines (Hall\'s condition) the branch is discarded. It is sound: it never removes a state that can still reach the goal.'],
  ['What are the hard and soft constraints?', 'Hard: before the exam, capacity, per-topic daily cap. Soft (costs): finishing important topics early and spreading the load across days.'],
  ['Time and space complexity?', 'With branching factor b (days) and depth m (units): BFS O(b^m) time and space, DFS O(b^m) time and O(b·m) path space, A* depends on h but is exponential in the worst case.'],
  ['Why does A* use fewer states than BFS in the Comparison page?', 'Because h is close to the true cost, almost all expansions lie on or near the optimal path. Open the Comparison page and compare the "States explored" column.'],
];
