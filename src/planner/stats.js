import { addDays, diffDays } from './dates.js';

export function dashboardStats(state, today) {
  const sessions = state.sessions || [];
  const count = (st) => sessions.filter((s) => s.status === st).length;
  const completed = count('completed');
  const missed = count('missed');
  const planned = count('planned');
  const decided = completed + missed;

  const subjectById = new Map(state.subjects.map((s) => [s.id, s]));
  const upcomingExams = state.subjects
    .filter((s) => s.examDate && s.examDate >= today)
    .map((s) => {
      const topics = state.topics.filter((t) => t.subjectId === s.id);
      const total = topics.reduce((a, t) => a + t.durationMinutes, 0);
      const done = sessions
        .filter((x) => x.subjectId === s.id && x.status === 'completed')
        .reduce((a, x) => a + x.minutes, 0);
      return {
        id: s.id,
        name: s.name,
        color: s.color,
        examDate: s.examDate,
        daysLeft: diffDays(today, s.examDate),
        progress: total === 0 ? 0 : Math.min(1, done / total),
        plannedLeft: sessions.filter((x) => x.subjectId === s.id && x.status === 'planned').length,
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const workload = [];
  for (let i = 0; i < 14; i++) {
    const date = addDays(today, i);
    const day = sessions.filter((s) => s.date === date);
    workload.push({
      date,
      label: date.slice(5),
      planned: day.filter((s) => s.status === 'planned').reduce((a, s) => a + s.minutes, 0),
      completed: day.filter((s) => s.status === 'completed').reduce((a, s) => a + s.minutes, 0),
    });
  }

  const todays = sessions
    .filter((s) => s.date === today)
    .map((s) => ({ ...s, topic: state.topics.find((t) => t.id === s.topicId), subject: subjectById.get(s.subjectId) }));

  return {
    completed,
    missed,
    planned,
    total: sessions.length,
    completionRate: decided === 0 ? null : completed / decided,
    upcomingExams,
    workload,
    todays,
  };
}
