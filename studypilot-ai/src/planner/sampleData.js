import { addDays } from './dates.js';

/** Sample subjects/topics with exam dates relative to `today`, so the demo is never out of date. */
export function sampleData(today) {
  const subjects = [
    { id: 'sub-ai', name: 'Artificial Intelligence', color: '#6366f1', examDate: addDays(today, 9) },
    { id: 'sub-dbms', name: 'Database Systems', color: '#10b981', examDate: addDays(today, 12) },
    { id: 'sub-cn', name: 'Computer Networks', color: '#f59e0b', examDate: addDays(today, 15) },
  ];
  const t = (id, subjectId, name, difficulty, importance, durationMinutes) => ({
    id, subjectId, name, difficulty, importance, durationMinutes,
  });
  const topics = [
    t('t-search', 'sub-ai', 'State-space search', 4, 5, 120),
    t('t-heur', 'sub-ai', 'Heuristics & A*', 5, 5, 120),
    t('t-fuzzy', 'sub-ai', 'Fuzzy logic', 3, 3, 60),
    t('t-norm', 'sub-dbms', 'Normalization', 3, 4, 120),
    t('t-tx', 'sub-dbms', 'Transactions & ACID', 4, 4, 120),
    t('t-sql', 'sub-dbms', 'SQL joins', 2, 3, 60),
    t('t-tcp', 'sub-cn', 'TCP congestion control', 5, 4, 120),
    t('t-routing', 'sub-cn', 'Routing algorithms', 4, 4, 120),
    t('t-osi', 'sub-cn', 'OSI model', 2, 2, 60),
  ];
  return { subjects, topics };
}
