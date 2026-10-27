// Reproducible benchmark used by docs/PROJECT_REPORT.md.  Run:  node scripts/benchmark.mjs
import { createStudyProblem, runSearch } from '../src/algorithms/index.js';

function make(nTopics, unitsPer, nDays, cap, exams) {
  const units = [];
  for (let t = 0; t < nTopics; t++) {
    for (let k = 0; k < unitsPer; k++) {
      units.push({
        id: `t${t}-${k}`, topicId: `t${t}`, topicName: `Topic ${t}`,
        importance: 1 + ((t * 2) % 5), difficulty: 1 + ((t * 3) % 5), examDay: exams[t % exams.length],
      });
    }
  }
  return createStudyProblem({ units, days: Array.from({ length: nDays }, () => ({ capacity: cap })), maxPerTopicPerDay: 2 });
}

const cases = [
  ['6 units, 5 days', [3, 2, 5, 3, [5, 4, 5]]],
  ['8 units, 7 days', [4, 2, 7, 3, [7, 6, 5, 7]]],
  ['18 units, 14 days', [6, 3, 14, 3, [14, 12, 10, 14, 9, 14]]],
  ['40 units, 21 days', [10, 4, 21, 3, [21, 18, 15, 20, 14, 21, 17, 19, 16, 21]]],
];
for (const [label, args] of cases) {
  const p = make(...args);
  console.log(`\n${label}`);
  for (const algo of ['bfs', 'dfs', 'astar']) {
    const r = runSearch(algo, p, { limits: { maxExpansions: 20000, maxMillis: 8000 } });
    console.log(
      algo.padEnd(6), r.status.padEnd(14), 'cost', String(r.cost).padEnd(6), 'optimal', String(r.optimal).padEnd(6),
      'expanded', String(r.stats.expanded).padEnd(6), 'maxFrontier', String(r.stats.maxFrontier).padEnd(7),
      'ms', r.stats.runtimeMs.toFixed(1), r.limit || '',
    );
  }
}
