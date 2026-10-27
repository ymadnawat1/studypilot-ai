import { createStudyProblem, runSearch, STATUS } from '../algorithms/index.js';
import { buildProblemFor } from './planner.js';

/**
 * Builds ONE problem and runs BFS, DFS and A* on it with identical limits,
 * so every metric is measured on identical input.
 * `maxUnits` keeps only the highest-priority units (BFS is exponential, so a subset is useful).
 */
export function buildComparisonProblem(state, today, maxUnits = null) {
  const { problem, units, days, settings } = buildProblemFor(state, today);
  if (!maxUnits || units.length <= maxUnits) return { problem, truncated: false, totalAvailable: units.length };
  const keep = problem.units.slice(0, maxUnits).map(({ index, original, weight, limit, ...u }) => u);
  const subset = createStudyProblem({
    units: keep,
    days,
    maxPerTopicPerDay: settings.maxPerTopicPerDay,
    weights: settings.weights,
  });
  return { problem: subset, truncated: true, totalAvailable: units.length };
}

export function coverage(problem, result) {
  const days = result.status === STATUS.GOAL ? result.schedule : result.bestPartial.days;
  const depth = result.status === STATUS.GOAL ? problem.totalUnits : result.bestPartial.depth;
  const total = problem.totalUnits;
  const topicTotals = new Map();
  const topicDone = new Map();
  problem.units.forEach((u, i) => {
    topicTotals.set(u.topicId, (topicTotals.get(u.topicId) || 0) + 1);
    if (i < depth && days[i] >= 0) topicDone.set(u.topicId, (topicDone.get(u.topicId) || 0) + 1);
  });
  let full = 0;
  for (const [id, n] of topicTotals) if ((topicDone.get(id) || 0) === n) full++;
  return {
    unitCoverage: total === 0 ? 1 : depth / total,
    topicCoverage: topicTotals.size === 0 ? 1 : full / topicTotals.size,
  };
}

export function compareAlgorithms(problem, limits) {
  return ['bfs', 'dfs', 'astar'].map((algorithm) => {
    const result = runSearch(algorithm, problem, { limits });
    const cov = coverage(problem, result);
    return {
      algorithm,
      status: result.status,
      limit: result.limit,
      optimal: result.optimal,
      cost: result.cost,
      runtimeMs: result.stats.runtimeMs,
      expanded: result.stats.expanded,
      generated: result.stats.generated,
      duplicates: result.stats.duplicates,
      maxFrontier: result.stats.maxFrontier,
      unitCoverage: cov.unitCoverage,
      topicCoverage: cov.topicCoverage,
      note: result.optimalityNote,
      message: result.message,
    };
  });
}
