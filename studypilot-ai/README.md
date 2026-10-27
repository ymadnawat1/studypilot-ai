# StudyPilot AI — Intelligent Study Planner

An academic project for **Artificial Intelligence and Soft Computing (AISC)**. StudyPilot builds a personalised study timetable by treating scheduling as a **state-space search problem** and solving it with **BFS, DFS and A\*** — all implemented from scratch in JavaScript (no AI APIs, no pathfinding libraries).

**Stack:** React + Vite · JavaScript (JSX) · Tailwind CSS · Lucide icons · Recharts · LocalStorage · Vitest.

## Features

| Page | What it does |
|---|---|
| Dashboard | Upcoming exams, today's tasks, completion stats, workload chart, deadlines |
| Subjects & Topics | Create / edit / delete subjects and topics (difficulty, importance, duration, exam date) |
| Study Planner | Availability per weekday, planning horizon, session length, daily workload limits, algorithm choice |
| Weekly Timetable | Generated sessions; mark **completed** or **missed**; replanning log |
| Search Visualizer | Runs the *real* BFS / DFS / A* one expansion at a time (start, pause, step, reset, speed) |
| Algorithm Comparison | BFS vs DFS vs A* on identical input: runtime, states explored, frontier size, cost, coverage |
| Automatic Replanning | Missed session or changed exam date → schedule regenerated |

Light/dark theme, responsive layout, keyboard-accessible controls, progress saved in the browser.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 44 tests
npm run build      # production build in dist/
npm run preview    # serve the production build
node scripts/benchmark.mjs   # reproduce the benchmark in docs/PROJECT_REPORT.md
```

Requires Node 18+ (developed on Node 22).

## How the AI works (30-second version)

* **State:** a partial schedule. **Action:** assign the next study unit (a session-length block of a topic) to a day. **Goal:** every unit scheduled with no hard constraint broken.
* **Hard constraints:** study before the exam · day capacity · at most N sessions of one topic per day.
* **Cost (≥ 0):** `weight × importance × difficulty × day` (study hard/important topics early) `+ weight × sessions-already-that-day` (spread the load).
* **A\* heuristic:** the exact cost of an *easier* version of the problem, found by a small DP over days. It never overestimates, so A\* is optimal when it finishes. Tests check this against brute force.
* **Honest results:** the planner reports `goal`, `infeasible` or `limit_reached`. It says "optimal" only for A\* under the conditions above, and labels any fallback.

Details: [`docs/AI_ALGORITHMS.md`](docs/AI_ALGORITHMS.md) · Report: [`docs/PROJECT_REPORT.md`](docs/PROJECT_REPORT.md) · Viva prep: [`docs/VIVA_QUESTIONS.md`](docs/VIVA_QUESTIONS.md)

## Project structure

```
src/
  algorithms/   priorityQueue.js · maxFlow.js · studyProblem.js (shared state-space model) · searchEngine.js (BFS, DFS, A*)
  planner/      planner.js (slots, units, plan, validator, replan) · reducer.js · compare.js · stats.js · dates.js · sampleData.js
  storage/      storage.js (localStorage + sanitising)
  ui/           store.jsx · components.jsx · pages/*  (Dashboard, Subjects, Planner, Timetable, Visualizer, Compare)
docs/           AI_ALGORITHMS.md · PROJECT_REPORT.md · VIVA_QUESTIONS.md
scripts/        benchmark.mjs
```

## Deploy (GitHub + Vercel)

The app is a static Vite build that uses hash routing, so no rewrite rules are needed.

1. **GitHub**
   ```bash
   git remote add origin https://github.com/<your-username>/studypilot-ai.git
   git branch -M main
   git push -u origin main
   ```
   (Create the empty repo on github.com first, or run `gh repo create studypilot-ai --public --source=. --push`.)
2. **Vercel** — open <https://vercel.com/new>, import the repo, keep the detected settings (Framework: Vite, Build: `npm run build`, Output: `dist`) and press **Deploy**.
   Or from the terminal: `npx vercel` then `npx vercel --prod`.

## Limitations

* Planning is per **day** with sessions placed in a day by priority; it does not model time-of-day preferences.
* Topics whose exam is beyond the planning horizon are not scheduled (the app tells you which ones).
* BFS is exponential; on larger inputs it stops at its search limit. That is expected and reported, not an error.
* Data lives in this browser's LocalStorage only (no accounts / sync).
