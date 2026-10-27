# AI Algorithms in StudyPilot AI

Code: `src/algorithms/studyProblem.js` (model) and `src/algorithms/searchEngine.js` (BFS, DFS, A*).
All three algorithms use **one shared problem object**, so comparisons are on identical input.

## 1. Problem formulation

A **study unit** is one session-length block of a topic (a 150-minute topic with 60-minute sessions = 3 units). Units are put in a fixed order, highest priority first (`importance × difficulty`).

| Element | Definition |
|---|---|
| Initial state | Empty schedule: no unit assigned |
| Action | Assign the next unit to a compatible day (it takes the day's earliest free slot) |
| Transition model | `result(state, action)` → a new state; the old state is never mutated |
| Goal state | All required units assigned, no hard constraint violated |
| State key | Per topic, the sorted multiset of assigned days; swapping identical units of one topic gives the same key |

**Hard constraints** (an action that breaks one is never generated):

1. A unit is studied on a day strictly **before** its exam.
2. A day holds at most `capacity` sessions (from availability and the daily workload limit).
3. At most `maxPerTopicPerDay` units of one topic per day.
4. **Dead-end pruning:** if the remaining units cannot fit before their deadlines (Hall's condition on nested deadlines), the child is discarded. This is *sound*: it only removes states that cannot reach the goal.

Before searching, an exact **max-flow** test (units → topics → days) decides feasibility. If it fails, every algorithm returns `infeasible` with the shortfall and the reason.

**Why "earliest free slot in the day"?** Slots inside one day are interchangeable for the cost model, so fixing their order removes pointless symmetry and keeps the search complete.

## 2. Cost function (documented, non-negative)

Step cost of assigning unit *u* to day *d* (day 0 = plan start), where *j* = sessions already on day *d*:

```
cost = wDelay · importance · difficulty · d      (important / hard topics early)
     + wLoad  · j                                (spread work across days)
```

Defaults `wDelay = 1`, `wLoad = 6`, both integers ≥ 0 and validated (negative weights throw). The schedule cost `g` is the sum of step costs; it does not depend on the order in which units were assigned, so equivalent states have equal `g`.

## 3. The algorithms

| | BFS | DFS | A* |
|---|---|---|---|
| Frontier | FIFO queue | LIFO stack (explicit, with backtracking) | Binary-heap priority queue on `f = g + h` |
| Goal test | when a node is generated | when a node is generated | when a node is **selected for expansion** |
| Duplicates | `seen` key set | `seen` key set | `bestG` map; closed set; reopen if a cheaper route appears |
| Tie-break | FIFO | preferred child first | smaller `h` (deeper) first, then FIFO |

Each is a JavaScript **generator** yielding one event per expansion, and `runSearch()` simply drives it to the end. The Search Visualizer drives the *same generators* one step at a time, so what you see is real execution. A test checks that stepping and running give identical statistics.

**Search limits:** expansions (default 20 000), time (4 s) and frontier size. Hitting one returns `limit_reached` with no schedule, never a wrong answer.

**Reported statistics:** expanded, generated, duplicates skipped, pruned, dead ends, backtracks, max frontier, runtime.

## 4. The A* heuristic

**Idea (relaxation).** Make the problem easier by dropping the per-topic daily cap and by keeping each deadline only as a *count*: "at least *k* remaining units must be placed before day *L*". In the easy problem the cheapest plan puts the **heaviest remaining units on the earliest days** (rearrangement inequality), and the best number of units per day is found exactly with a dynamic program over days:

```
dp[N] = cheapest cost of placing the N heaviest remaining units on days 0..d
h(n)  = dp[all remaining units] after the last day
```

**Admissible** (never overestimates): every real schedule is also a schedule of the easy problem, so the easy optimum ≤ the real optimum.

**Consistent**: every real action is also an action of the easy problem with the *same* step cost, so `h(n) ≤ c(n,a,n') + h(n')`. With a consistent heuristic A* never needs to reopen a closed state (the code still handles reopening defensively).

**Tested, not just argued.** `algorithms.test.js` builds tiny problems, computes the *true* cost-to-go of every reachable state by exhaustive search, and asserts `h ≤ h*` for each state and `h(n) ≤ c + h(n')` for each edge.

**Evolution (honest note).** An earlier cost model also had "cramming" and "same-topic-repeat" penalties. The relaxation could not account for them, so A* expanded tens of thousands of states and hit its limit. They were removed to keep the model simple and the heuristic tight.

## 5. When is a result called "optimal"?

`optimal = true` only if **all** hold: algorithm is A*, a goal was found (selected for expansion) **before** any limit was hit, all step costs are ≥ 0, and the heuristic is flagged admissible. Otherwise the result carries an explanation:

* **BFS** returns the shallowest goal, but every complete schedule has the same depth (one action per unit), so this says nothing about cost. Not optimal.
* **DFS** returns the first complete schedule. Not optimal.
* **A\*** stopped by a limit: not optimal, no schedule.

## 6. Complexity

*b* = usable days (branching factor), *m* = number of units (depth).

| | Time | Space | Complete | Cost-optimal |
|---|---|---|---|---|
| BFS | O(b^m) | O(b^m) | yes | no (see above) |
| DFS | O(b^m) worst case | O(b·m) path (+ seen set) | yes (finite, duplicates skipped) | no |
| A* | exponential worst case; depends on h quality | O(generated states) | yes | yes, under the conditions above |

Heuristic cost: O(days × remaining units × slots-per-day) per evaluation.

## 7. Infeasible plans, limits and fallbacks (planner behaviour)

* **Infeasible** (max-flow fails): the planner builds a *valid partial* schedule (best effort, priority order), lists the unscheduled sessions and the reasons, and marks the plan `partial`.
* **Limit reached** (e.g. BFS chosen on a big input): the planner falls back to a **heuristic-guided DFS**, labels the plan "not guaranteed optimal", and still validates it.
* Every generated plan is re-checked by an **independent validator** (`validateSchedule`) that does not use the search code.
