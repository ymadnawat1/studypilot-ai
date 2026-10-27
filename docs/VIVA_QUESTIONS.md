# AISC Viva Questions — StudyPilot AI

Short answers you can say out loud. File references show where to point in the code.

## State-space search basics

**1. What is a state space?**
All states reachable from the initial state by legal actions. Here a state is a partial timetable and an action assigns one study unit to a day.

**2. State vs node?**
A state is a configuration. A node is a search-tree record: state + parent + action + g + h + depth. Different nodes can hold the same state (that is a duplicate).

**3. What are the five parts of a search problem?**
Initial state, actions, transition model, goal test, path cost. See `studyProblem.js`.

**4. What is the branching factor and depth here?**
Branching factor b = number of usable days for a unit. Depth m = number of study units, because each action places exactly one unit.

## The three algorithms

**5. How does BFS work and is it optimal here?**
FIFO queue, expands level by level. It is optimal for number of actions, but every complete schedule uses exactly m actions, so BFS gives no guarantee on schedule *cost*. It is also O(b^m) in time and space, which is why it hits its limit above ~8 units.

**6. How does DFS work?**
LIFO stack; goes deep and backtracks from dead ends. Very fast and low memory, but it returns the first schedule it finds, so its cost may be higher than the optimum.

**7. How does A\* work?**
Priority queue ordered by f = g + h. g is the cost so far, h estimates the cost to finish. The goal is tested when the node is *selected for expansion*, which is what guarantees optimality.

**8. Why test the goal at expansion in A\* but at generation in BFS?**
In A* a goal node generated early might be reached by an expensive path; a cheaper path might still be in the queue. Testing at expansion ensures the cheapest goal comes out first.

**9. Are the algorithms complete?**
Yes: the space is finite and acyclic and duplicates are skipped.

**10. Complexity table?**
BFS O(b^m) time/space; DFS O(b^m) time, O(b·m) path space; A* exponential worst case, near-linear in practice when h is tight (see report: ~m expansions on the 40-unit instance).

## Heuristic

**11. What is your heuristic?**
The exact cost of an easier problem (no per-topic cap, deadlines only as counts), solved by DP over days with heaviest units on the earliest days.

**12. Why is it admissible?**
Every real schedule is also valid in the easier problem, so the easier optimum can never exceed the real optimum.

**13. Why is it consistent?**
Each real action exists in the easier problem with the same step cost, so h(n) ≤ c(n,a,n′) + h(n′).

**14. How did you verify it?**
By test: tiny problems, true cost-to-go of every reachable state by exhaustive search, assert h ≤ h* and the consistency inequality on every edge (`algorithms.test.js`).

**15. What if the heuristic were not admissible?**
A* could return a non-optimal schedule. The code only labels a result "optimal" when the heuristic is flagged admissible, costs are ≥ 0, and no limit interfered.

**16. Why did you remove the cramming/repeat penalties?**
The relaxation could not account for them, making h loose: A* then exceeded 20 000 expansions on 18–36 units. Removing them gave a simple model and a tight heuristic.

## Constraints, costs, robustness

**17. Hard vs soft constraints?**
Hard: before exam, day capacity, per-topic daily cap. Soft (cost): finish important/hard topics early and spread the daily load.

**18. Why must costs be non-negative?**
A* assumes extending a path never lowers its cost; negative costs break the optimality argument. Weights are validated and negatives throw.

**19. How do you detect duplicate states?**
Canonical key (per-topic sorted day list) in a hash set. Swapping two identical units of a topic gives the same key.

**20. What is dead-end pruning, and is it safe?**
If the remaining units cannot fit before their deadlines (Hall's condition) the branch is discarded. It is a *necessary* condition, so it never removes a state that can reach the goal.

**21. How do you handle infeasible schedules?**
A max-flow test over units → topics → days decides feasibility up front. If infeasible, all algorithms return `infeasible` with a reason, and the planner shows a valid partial plan and what to change.

**22. What happens when a search limit is reached?**
Status `limit_reached`, no schedule, no optimality claim. The planner falls back to heuristic-guided DFS and labels the plan as not guaranteed optimal.

**23. How is replanning done?**
Completed sessions are kept as history, missed/overdue ones become missed, and the remaining work is searched again from the plan start. Triggered by marking a session missed or changing an exam date.

**24. How do you know the visualiser is not a fake animation?**
It calls `.next()` on the same generator that `runSearch` uses; a test asserts the stepped statistics equal the full-run statistics.

**25. DFS matched A\* on the sample data. Why?**
Trying earliest days first happens to follow the cost structure when deadlines do not bind. On the synthetic instances in the report DFS is 5 to 25 cost units worse, and only A* *guarantees* the optimum.

## Soft-computing links (if asked)

**26. How could fuzzy logic extend this?**
Replace the crisp 1–5 difficulty/importance by fuzzy sets and combine them with fuzzy rules to obtain the topic weight.

**27. How could a genetic algorithm compare?**
A GA could evolve schedules without guarantees; it scales to huge instances but gives no optimality proof, whereas A* proves optimality when it finishes.
