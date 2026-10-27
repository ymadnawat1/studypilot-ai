import { createStudyProblem, runSearch, STATUS } from '../algorithms/index.js';
import { addDays, diffDays, weekdayOf, hhmmToMinutes, minutesToHHMM } from './dates.js';

export const DEFAULT_SETTINGS = Object.freeze({
  horizonDays: 21,
  sessionMinutes: 60,
  breakMinutes: 10,
  maxDailyMinutes: 240,
  maxPerTopicPerDay: 2,
  startTime: '18:00',
  startOffsetDays: 0,
  // minutes available per weekday, Sunday..Saturday
  availability: [180, 120, 120, 120, 120, 120, 180],
  autoReplan: true,
  algorithm: 'astar',
  maxExpansions: 20000,
  weights: { delay: 1, load: 6 },
});

export function normalizeSettings(s = {}) {
  const num = (v, lo, hi, dflt) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
  };
  const base = DEFAULT_SETTINGS;
  const avail = Array.isArray(s.availability) && s.availability.length === 7 ? s.availability : base.availability;
  return {
    horizonDays: num(s.horizonDays, 1, 90, base.horizonDays),
    sessionMinutes: num(s.sessionMinutes, 15, 240, base.sessionMinutes),
    breakMinutes: num(s.breakMinutes, 0, 60, base.breakMinutes),
    maxDailyMinutes: num(s.maxDailyMinutes, 15, 720, base.maxDailyMinutes),
    maxPerTopicPerDay: num(s.maxPerTopicPerDay, 1, 8, base.maxPerTopicPerDay),
    startTime: /^\d{1,2}:\d{2}$/.test(s.startTime || '') ? s.startTime : base.startTime,
    startOffsetDays: num(s.startOffsetDays, 0, 7, base.startOffsetDays),
    availability: avail.map((v) => num(v, 0, 1440, 0)),
    autoReplan: s.autoReplan !== false,
    algorithm: ['astar', 'bfs', 'dfs'].includes(s.algorithm) ? s.algorithm : 'astar',
    maxExpansions: num(s.maxExpansions, 100, 200000, base.maxExpansions),
    weights: {
      delay: num(s.weights?.delay, 0, 100, base.weights.delay),
      load: num(s.weights?.load, 0, 100, base.weights.load),
    },
  };
}

/** Day list for the planning horizon with the number of session slots per day. */
export function buildDays(settings, startISO) {
  const s = settings;
  const out = [];
  for (let i = 0; i < s.horizonDays; i++) {
    const date = addDays(startISO, i);
    const avail = s.availability[weekdayOf(date)];
    const byAvail = Math.floor((avail + s.breakMinutes) / (s.sessionMinutes + s.breakMinutes));
    const byLimit = Math.floor(s.maxDailyMinutes / s.sessionMinutes);
    out.push({ index: i, date, capacity: Math.max(0, Math.min(byAvail, byLimit)) });
  }
  return out;
}

/** Remaining study units (one unit = one session-length block) for every schedulable topic. */
export function buildUnits({ subjects, topics, sessions, settings, startISO }) {
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const doneMinutes = new Map();
  for (const ses of sessions) {
    if (ses.status === 'completed') doneMinutes.set(ses.topicId, (doneMinutes.get(ses.topicId) || 0) + ses.minutes);
  }
  const units = [];
  const excluded = [];
  for (const t of topics) {
    const subj = subjectById.get(t.subjectId);
    if (!subj || !subj.examDate) {
      excluded.push({ topicId: t.id, name: t.name, reason: 'No exam date set for its subject.' });
      continue;
    }
    const remaining = Math.max(0, t.durationMinutes - (doneMinutes.get(t.id) || 0));
    const n = Math.ceil(remaining / settings.sessionMinutes);
    if (n === 0) continue;
    const examDay = diffDays(startISO, subj.examDate);
    if (examDay <= 0) {
      excluded.push({ topicId: t.id, name: t.name, reason: 'Exam is today or already passed.' });
      continue;
    }
    if (examDay > settings.horizonDays) {
      excluded.push({ topicId: t.id, name: t.name, reason: 'Exam is beyond the planning horizon.' });
      continue;
    }
    for (let k = 0; k < n; k++) {
      units.push({
        id: `${t.id}#${k}`,
        topicId: t.id,
        subjectId: subj.id,
        topicName: t.name,
        subjectName: subj.name,
        label: `${t.name}`,
        importance: t.importance,
        difficulty: t.difficulty,
        examDay,
      });
    }
  }
  return { units, excluded };
}

export function buildProblemFor(state, today) {
  const settings = normalizeSettings(state.settings);
  const startISO = addDays(today, settings.startOffsetDays);
  const days = buildDays(settings, startISO);
  const { units, excluded } = buildUnits({
    subjects: state.subjects,
    topics: state.topics,
    sessions: state.sessions || [],
    settings,
    startISO,
  });
  const problem = createStudyProblem({
    units,
    days,
    maxPerTopicPerDay: settings.maxPerTopicPerDay,
    weights: settings.weights,
  });
  return { problem, settings, startISO, days, units, excluded };
}

/** Best-effort partial plan when no complete schedule exists: cheapest valid day per unit, in priority order. */
function greedyPartial(problem) {
  let state = problem.initialState();
  const dayOfUnit = new Array(problem.totalUnits).fill(-1);
  const used = new Uint8Array(problem.days.length);
  const topicDay = new Map();
  for (const u of problem.units) {
    let best = null;
    for (let d = 0; d < u.limit; d++) {
      if (used[d] >= problem.days[d].capacity) continue;
      if ((topicDay.get(`${u.topicId}|${d}`) || 0) >= problem.maxPerTopicPerDay) continue;
      const cost = problem.weights.delay * u.weight * d + problem.weights.load * used[d];
      if (!best || cost < best.cost) best = { d, cost };
    }
    if (best) {
      dayOfUnit[u.index] = best.d;
      used[best.d]++;
      topicDay.set(`${u.topicId}|${best.d}`, (topicDay.get(`${u.topicId}|${best.d}`) || 0) + 1);
    }
  }
  return dayOfUnit;
}

function dayAssignmentsToSessions(problem, dayOfUnit, settings) {
  const byDay = new Map();
  problem.units.forEach((u) => {
    const d = dayOfUnit[u.index];
    if (d < 0 || d === undefined) return;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(u);
  });
  const startMin = hhmmToMinutes(settings.startTime);
  const out = [];
  for (const [d, list] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    // hardest / most important first (fresh mind), then by topic to keep a topic's sessions together
    list.sort((a, b) => b.weight - a.weight || (a.topicId < b.topicId ? -1 : 1) || a.index - b.index);
    list.forEach((u, slot) => {
      const start = startMin + slot * (settings.sessionMinutes + settings.breakMinutes);
      out.push({
        id: `s-${problem.days[d].date}-${slot}-${u.topicId}`,
        topicId: u.topicId,
        subjectId: u.subjectId,
        date: problem.days[d].date,
        start: minutesToHHMM(start),
        end: minutesToHHMM(start + settings.sessionMinutes),
        minutes: settings.sessionMinutes,
        status: 'planned',
      });
    });
  }
  return out;
}

/**
 * Generates a plan. History (completed / missed sessions) is preserved, every
 * future 'planned' session is regenerated from the remaining work.
 */
export function generatePlan(state, today, { reason = 'Manual plan generation', now = Date.now() } = {}) {
  const history = (state.sessions || []).filter((s) => s.status !== 'planned' || s.date < today);
  // overdue planned sessions count as missed
  const reconciled = history.map((s) => (s.status === 'planned' ? { ...s, status: 'missed' } : s));
  const working = { ...state, sessions: reconciled };
  const ctx = buildProblemFor(working, today);
  const { problem, settings } = ctx;

  const meta = {
    generatedAt: now,
    reason,
    requestedAlgorithm: settings.algorithm,
    algorithm: settings.algorithm,
    status: STATUS.GOAL,
    optimal: false,
    optimalityNote: '',
    fallback: null,
    partial: false,
    cost: 0,
    stats: null,
    message: '',
    totalUnits: problem.totalUnits,
    scheduledUnits: 0,
    unscheduled: [],
    excluded: ctx.excluded,
    diagnostics: [],
    startDate: ctx.startISO,
  };

  let dayOfUnit = [];
  if (problem.totalUnits === 0) {
    meta.message = 'Nothing to schedule: no remaining study units before an exam inside the horizon.';
    meta.optimalityNote = 'Trivial: the empty schedule is the goal state.';
    meta.optimal = true;
  } else {
    const limits = { maxExpansions: settings.maxExpansions, maxMillis: 3000 };
    let result = runSearch(settings.algorithm, problem, { limits });
    meta.stats = result.stats;
    meta.status = result.status;
    meta.optimal = result.optimal;
    meta.optimalityNote = result.optimalityNote;
    meta.message = result.message;

    if (result.status === STATUS.LIMIT) {
      // honest fallback: guided DFS (heuristic-ordered), clearly flagged as not optimal
      const fb = runSearch('dfs', problem, { ordering: 'heuristic', limits: { maxExpansions: 50000, maxMillis: 3000 } });
      if (fb.status === STATUS.GOAL) {
        meta.fallback = 'guided-dfs';
        meta.status = STATUS.GOAL;
        meta.optimal = false;
        meta.optimalityNote = `${settings.algorithm.toUpperCase()} hit its search limit, so a heuristic-guided DFS schedule was used. It is valid but not guaranteed optimal.`;
        meta.message = `${result.message} Fell back to guided DFS.`;
        result = fb;
      }
    }

    if (result.status === STATUS.GOAL) {
      dayOfUnit = result.schedule;
      meta.cost = result.cost;
    } else {
      // infeasible or no schedule found: keep as much as is valid
      meta.partial = true;
      meta.optimal = false;
      dayOfUnit = greedyPartial(problem);
      const feas = problem.rootFeasibility();
      meta.diagnostics = feas.diagnostics;
      meta.cost = null; // a partial schedule has no comparable cost
    }
  }

  const planned = dayAssignmentsToSessions(problem, dayOfUnit, settings);
  meta.scheduledUnits = planned.length;
  meta.unscheduled = problem.units
    .filter((u) => dayOfUnit[u.index] === undefined || dayOfUnit[u.index] < 0)
    .map((u) => ({ topicId: u.topicId, topicName: u.topicName, subjectName: u.subjectName }));

  const sessions = [...reconciled, ...planned].sort((a, b) =>
    a.date === b.date ? (a.start < b.start ? -1 : 1) : a.date < b.date ? -1 : 1,
  );
  meta.validation = validateSchedule({ ...state, sessions }, today);
  return { sessions, meta };
}

/** Independent checker: re-verifies every hard constraint directly from the final sessions. */
export function validateSchedule(state, today) {
  const settings = normalizeSettings(state.settings);
  const subjectById = new Map(state.subjects.map((s) => [s.id, s]));
  const startISO = addDays(today, settings.startOffsetDays);
  const days = buildDays(settings, startISO);
  const capByDate = new Map(days.map((d) => [d.date, d.capacity]));
  const violations = [];
  const perDay = new Map();
  const perTopicDay = new Map();
  const slotUse = new Set();
  const planned = (state.sessions || []).filter((s) => s.status === 'planned');
  for (const s of planned) {
    const subj = subjectById.get(s.subjectId);
    if (!subj) violations.push(`Session ${s.id} references a missing subject.`);
    else if (s.date >= subj.examDate) violations.push(`${s.date}: session for ${subj.name} is not before the exam (${subj.examDate}).`);
    if (s.date < startISO) violations.push(`${s.date}: planned session is before the plan start (${startISO}).`);
    if (!capByDate.has(s.date)) violations.push(`${s.date}: outside the planning horizon.`);
    perDay.set(s.date, (perDay.get(s.date) || 0) + 1);
    const k = `${s.topicId}|${s.date}`;
    perTopicDay.set(k, (perTopicDay.get(k) || 0) + 1);
    const slot = `${s.date}|${s.start}`;
    if (slotUse.has(slot)) violations.push(`${s.date} ${s.start}: double-booked slot.`);
    slotUse.add(slot);
  }
  for (const [date, n] of perDay) {
    const cap = capByDate.get(date) ?? 0;
    if (n > cap) violations.push(`${date}: ${n} sessions exceed the daily capacity of ${cap}.`);
    if (n * settings.sessionMinutes > settings.maxDailyMinutes) violations.push(`${date}: exceeds the daily workload limit.`);
  }
  for (const [k, n] of perTopicDay) {
    if (n > settings.maxPerTopicPerDay) violations.push(`${k.split('|')[1]}: ${n} sessions of one topic exceed the per-topic daily limit.`);
  }
  return { ok: violations.length === 0, violations };
}

/** Replans: overdue sessions become missed, remaining work is rescheduled from the plan start. */
export function replan(state, today, reason, now = Date.now()) {
  const before = (state.sessions || []).filter((s) => s.status === 'planned' && s.date >= today);
  const { sessions, meta } = generatePlan(state, today, { reason, now });
  const after = sessions.filter((s) => s.status === 'planned');
  const key = (s) => `${s.topicId}|${s.date}|${s.start}`;
  const beforeKeys = new Set(before.map(key));
  const afterKeys = new Set(after.map(key));
  const kept = [...afterKeys].filter((k) => beforeKeys.has(k)).length;
  const log = {
    at: now,
    reason,
    status: meta.status,
    scheduled: after.length,
    unchanged: kept,
    moved: after.length - kept,
    dropped: before.length - kept,
    partial: meta.partial,
  };
  return { sessions, meta, log };
}
