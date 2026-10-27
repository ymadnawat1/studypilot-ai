# StudyPilot AI — Project Report

**Course:** Artificial Intelligence and Soft Computing (AISC)
**Topic:** State-space search (BFS, DFS, A*) applied to study scheduling

## 1. Problem statement

Students must split limited daily time across several subjects with different exam dates, topic difficulty and importance. Doing this by hand is error-prone and breaks whenever a session is missed. StudyPilot AI generates a timetable automatically and regenerates it when plans change.

## 2. Objectives

1. Model scheduling as a state-space search problem.
2. Implement BFS, DFS and A* from scratch and compare them on identical input.
3. Design an explainable, admissible A* heuristic.
4. Deliver a usable web app (planner, timetable, visualiser, replanning).

## 3. Approach

Full formulation, cost function and heuristic are in [`AI_ALGORITHMS.md`](AI_ALGORITHMS.md). In short:

* State = partial schedule; action = assign the next study unit to a day; goal = all units placed.
* Hard constraints: before the exam, day capacity, per-topic daily cap.
* Soft cost: important/hard topics early + spread the daily load.
* A* heuristic = exact optimum of a relaxed problem (DP over days): admissible and consistent.

## 4. System design

| Layer | Folder | Responsibility |
|---|---|---|
| Algorithms | `src/algorithms` | Shared state-space model, BFS/DFS/A* generators, priority queue, max-flow feasibility check |
| Planner | `src/planner` | Slots and units, plan generation, independent validator, replanning, comparison, statistics, reducer |
| Storage | `src/storage` | LocalStorage persistence with defensive sanitising |
| UI | `src/ui`, `src/App.jsx` | Six pages, theme, hash routing |

The reducer is pure and deterministic (dates are passed in), which is what makes the planner easy to test.

## 5. Testing — measured results

Command: `npm test` (Vitest 5). **Result: 3 test files, 44 tests, all passing.**

| File | Tests | Covers |
|---|---|---|
| `algorithms/algorithms.test.js` | 19 | priority queue; hard constraints; duplicate keys; non-negative costs; **heuristic admissible + consistent vs exhaustive search**; BFS/DFS/A* find valid schedules; A* equals brute-force optimum; infeasible and limit handling; DFS backtracking; stepping the generator = running it |
| `planner/planner.test.js` | 16 | dates; slot capacity; full plan obeys constraints; validator catches violations; infeasible → valid partial plan; missed-session and exam-date replanning; comparison on identical input; dashboard stats; localStorage round-trip and corruption recovery |
| `ui/app.test.jsx` | 9 | first-run data; all pages reachable; theme persistence; progress survives remount ("refresh"); add subject/topic; form validation; visualiser stepping/reset; comparison table |

`npm run build` produces a production bundle without errors.

During development two UI tests failed and exposed (1) an ambiguous test selector and (2) a real issue: native browser validation blocked the form before the app's accessible error could appear. The forms now use their own validation (`noValidate`).

## 6. Experimental results

Measured with `node scripts/benchmark.mjs` (synthetic instances, 3 slots per day, expansion limit 20 000). *States explored* = expansions.

| Instance | Algorithm | Status | Cost | States explored | Max frontier |
|---|---|---|---|---|---|
| 6 units, 5 days | BFS | goal | 48 | 212 | 702 |
| | DFS | goal | 48 | 6 | 17 |
| | **A\*** | goal, optimal | **33** | 6 | 20 |
| 8 units, 7 days | BFS | goal | 76 | 10 694 | 53 865 |
| | DFS | goal | 76 | 8 | 32 |
| | **A\*** | goal, optimal | **71** | 8 | 39 |
| 18 units, 14 days | BFS | limit reached | — | 20 000 | 105 508 |
| | DFS | goal | 321 | 18 | 149 |
| | **A\*** | goal, optimal | **297** | 18 | 160 |
| 40 units, 21 days | BFS | limit reached | — | 20 000 | 173 815 |
| | DFS | goal | 1946 | 40 | 435 |
| | **A\*** | goal, optimal | **1921** | 46 | 567 |

On the built-in **sample data** (15 units over 21 days) the planner produced an optimal A* plan: cost 1039, 686 states explored, about 30–70 ms, constraint check passed. DFS found a schedule of the **same cost** (1039) after only 15 expansions on this input, so DFS is not always worse; its quality is simply not guaranteed, while A*'s is. BFS hit its limit from 8 units upward on the sample.

### Observations

* **BFS** is exponential: it needs thousands of expansions for 8 units and cannot finish by 18.
* **DFS** is very fast but its schedule can cost more than the optimum (on all four synthetic instances it was 5 to 25 cost units higher than A*; see table) and it gives no guarantee.
* **A\*** matched the exact optimum on tiny cases (verified by brute force in tests) and stayed close to the number of units in expansions because the heuristic is tight.

## 7. Limitations

* Day-level planning: sessions are ordered inside a day by priority, with no time-of-day preferences.
* Topics with an exam beyond the horizon are not scheduled (reported in the UI).
* The heuristic ignores the per-topic daily cap; instances where that cap binds heavily may need many more expansions (the planner then falls back to guided DFS and says so).
* Time-limited searches use wall-clock time, so very slow machines may hit the limit earlier.
* Data is stored only in one browser's LocalStorage.

## 8. Future work

Time-of-day preferences, spaced-repetition sessions, a Web Worker for very large searches, import/export, and a weighted-A* option for anytime behaviour.

## 9. Conclusion

Modelling timetabling as state-space search gave a planner whose output is verifiable (independent validator), explainable (documented cost and heuristic) and honest (optimality claimed only when justified). A* with a tight, admissible heuristic found optimal schedules quickly where BFS could not finish.
