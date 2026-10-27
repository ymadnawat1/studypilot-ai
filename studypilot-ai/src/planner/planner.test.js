// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { generatePlan, replan, validateSchedule, buildDays, DEFAULT_SETTINGS, normalizeSettings } from './planner.js';
import { reducer, newId } from './reducer.js';
import { sampleData } from './sampleData.js';
import { addDays, diffDays, isValidISO, weekdayOf } from './dates.js';
import { compareAlgorithms, buildComparisonProblem } from './compare.js';
import { dashboardStats } from './stats.js';
import { emptyState, loadState, saveState, sanitizeState, STORAGE_KEY } from '../storage/storage.js';

const TODAY = '2026-10-28'; // a Wednesday (fixed so tests are deterministic)

function sampleState(overrides = {}) {
  const { subjects, topics } = sampleData(TODAY);
  return { ...emptyState(), subjects, topics, ...overrides };
}

describe('dates', () => {
  it('does calendar math without timezone surprises', () => {
    expect(weekdayOf(TODAY)).toBe(3);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(diffDays('2026-03-01', '2026-03-31')).toBe(30);
    expect(isValidISO('2026-02-30')).toBe(false);
  });
});

describe('slots and settings', () => {
  it('derives capacity from availability and the daily workload limit', () => {
    const s = normalizeSettings({ sessionMinutes: 60, breakMinutes: 10, maxDailyMinutes: 120, availability: [0, 300, 300, 300, 300, 300, 0] });
    const days = buildDays(s, TODAY);
    expect(days[0].capacity).toBe(2); // Wed: 300 min available but workload limit 120 => 2
    const sat = days.find((d) => weekdayOf(d.date) === 6);
    expect(sat.capacity).toBe(0);
  });
  it('clamps invalid settings', () => {
    const s = normalizeSettings({ sessionMinutes: -5, horizonDays: 9999, algorithm: 'nope' });
    expect(s.sessionMinutes).toBeGreaterThanOrEqual(15);
    expect(s.horizonDays).toBe(90);
    expect(s.algorithm).toBe('astar');
  });
});

describe('plan generation (integration)', () => {
  it('schedules all sample topics, obeys every hard constraint, and A* is optimal', () => {
    const { sessions, meta } = generatePlan(sampleState(), TODAY);
    expect(meta.status).toBe('goal');
    expect(meta.algorithm).toBe('astar');
    expect(meta.optimal).toBe(true);
    expect(meta.fallback).toBeNull();
    expect(meta.partial).toBe(false);
    // 120+120+60+120+120+60+120+120+60 = 900 minutes = 15 one-hour sessions
    expect(sessions.filter((s) => s.status === 'planned')).toHaveLength(15);
    expect(meta.validation.ok).toBe(true);
    const subj = new Map(sampleState().subjects.map((s) => [s.id, s]));
    for (const s of sessions) expect(s.date < subj.get(s.subjectId).examDate).toBe(true);
  });

  it('the independent validator really catches violations', () => {
    const state = sampleState();
    const { sessions } = generatePlan(state, TODAY);
    const bad = sessions.map((s, i) => (i === 0 ? { ...s, date: state.subjects.find((x) => x.id === s.subjectId).examDate } : s));
    const v = validateSchedule({ ...state, sessions: bad }, TODAY);
    expect(v.ok).toBe(false);
    expect(v.violations.join(' ')).toMatch(/not before the exam/);
    const dup = [...sessions, { ...sessions[0], id: 'dup' }];
    expect(validateSchedule({ ...state, sessions: dup }, TODAY).ok).toBe(false);
  });

  it('works with BFS and DFS as the selected algorithm (falls back honestly when BFS hits its limit)', () => {
    const dfs = generatePlan(sampleState({ settings: normalizeSettings({ algorithm: 'dfs' }) }), TODAY);
    expect(dfs.meta.status).toBe('goal');
    expect(dfs.meta.optimal).toBe(false);
    expect(dfs.meta.validation.ok).toBe(true);
    const bfs = generatePlan(sampleState({ settings: normalizeSettings({ algorithm: 'bfs', maxExpansions: 300 }) }), TODAY);
    expect(bfs.meta.fallback).toBe('guided-dfs');
    expect(bfs.meta.optimal).toBe(false);
    expect(bfs.meta.validation.ok).toBe(true);
  });

  it('reports infeasible plans, keeps a valid partial schedule and explains why', () => {
    const state = sampleState({ settings: normalizeSettings({ availability: [0, 60, 60, 60, 60, 60, 0], maxDailyMinutes: 60 }) });
    const { sessions, meta } = generatePlan(state, TODAY);
    expect(meta.status).toBe('infeasible');
    expect(meta.partial).toBe(true);
    expect(meta.optimal).toBe(false);
    expect(meta.unscheduled.length).toBeGreaterThan(0);
    expect(meta.diagnostics.length).toBeGreaterThan(0);
    expect(meta.validation.ok).toBe(true);
    expect(sessions.filter((s) => s.status === 'planned').length + meta.unscheduled.length).toBe(meta.totalUnits);
  });

  it('excludes topics whose exam is beyond the horizon or has passed', () => {
    const state = sampleState();
    state.subjects[0] = { ...state.subjects[0], examDate: addDays(TODAY, 60) };
    state.subjects[1] = { ...state.subjects[1], examDate: addDays(TODAY, -2) };
    const { meta } = generatePlan(state, TODAY);
    expect(meta.excluded.length).toBe(6);
    expect(meta.excluded.some((e) => /horizon/.test(e.reason))).toBe(true);
    expect(meta.excluded.some((e) => /passed/.test(e.reason))).toBe(true);
  });
});

describe('automatic replanning', () => {
  it('missed sessions are rescheduled and completed work is not planned again', () => {
    let state = sampleState();
    state = reducer(state, { type: 'GENERATE', today: TODAY });
    const planned = state.sessions.filter((s) => s.status === 'planned');
    const total = planned.length;
    const [first, second] = planned;
    state = reducer(state, { type: 'MARK_SESSION', id: first.id, status: 'completed', today: TODAY });
    expect(state.sessions.filter((s) => s.status === 'planned')).toHaveLength(total - 1);
    state = reducer(state, { type: 'MARK_SESSION', id: second.id, status: 'missed', today: TODAY });
    const after = state.sessions;
    expect(after.filter((s) => s.status === 'completed')).toHaveLength(1);
    expect(after.filter((s) => s.status === 'missed')).toHaveLength(1);
    // one done, so the remaining 14 units (including the missed one) are planned again
    expect(after.filter((s) => s.status === 'planned')).toHaveLength(total - 1);
    expect(state.planMeta.validation.ok).toBe(true);
    expect(state.replanLog[0].reason).toBe('Session missed');
  });

  it('overdue planned sessions are treated as missed on replan', () => {
    const state = sampleState();
    const first = generatePlan(state, TODAY);
    const later = addDays(TODAY, 2);
    const r = replan({ ...state, sessions: first.sessions }, later, 'Opened the app later');
    expect(r.sessions.some((s) => s.status === 'missed')).toBe(true);
    for (const s of r.sessions.filter((x) => x.status === 'planned')) expect(s.date >= later).toBe(true);
    expect(r.meta.validation.ok).toBe(true);
  });

  it('changing an exam date replans automatically, or flags the plan stale when auto-replan is off', () => {
    let state = reducer(sampleState(), { type: 'GENERATE', today: TODAY });
    const subj = state.subjects[0];
    const moved = { ...subj, examDate: addDays(TODAY, 5) };
    const auto = reducer(state, { type: 'UPDATE_SUBJECT', subject: moved, today: TODAY });
    expect(auto.replanLog[0].reason).toMatch(/Exam date changed/);
    for (const s of auto.sessions.filter((x) => x.subjectId === subj.id && x.status === 'planned')) {
      expect(s.date < moved.examDate).toBe(true);
    }
    const manual = reducer({ ...state, settings: { ...state.settings, autoReplan: false } }, { type: 'UPDATE_SUBJECT', subject: moved, today: TODAY });
    expect(manual.planMeta.stale).toBe(true);
    expect(manual.sessions).toEqual(state.sessions);
  });

  it('adding a topic with a short deadline is scheduled before that deadline', () => {
    let state = reducer(sampleState(), { type: 'GENERATE', today: TODAY });
    const topic = { id: newId('t'), subjectId: state.subjects[0].id, name: 'Extra', difficulty: 5, importance: 5, durationMinutes: 60 };
    state = reducer(state, { type: 'ADD_TOPIC', topic, today: TODAY });
    const extra = state.sessions.filter((s) => s.topicId === topic.id);
    expect(extra).toHaveLength(1);
    expect(state.planMeta.validation.ok).toBe(true);
  });
});

describe('comparison on identical input', () => {
  it('runs BFS, DFS and A* on the same problem and reports honest metrics', () => {
    const { problem } = buildComparisonProblem(sampleState(), TODAY, 6);
    const rows = compareAlgorithms(problem, { maxExpansions: 20000, maxMillis: 5000 });
    expect(rows.map((r) => r.algorithm)).toEqual(['bfs', 'dfs', 'astar']);
    const astar = rows.find((r) => r.algorithm === 'astar');
    expect(astar.status).toBe('goal');
    expect(astar.optimal).toBe(true);
    for (const r of rows.filter((x) => x.status === 'goal')) expect(r.cost).toBeGreaterThanOrEqual(astar.cost);
    for (const r of rows) {
      expect(r.unitCoverage).toBeGreaterThanOrEqual(0);
      expect(r.unitCoverage).toBeLessThanOrEqual(1);
    }
  });
});

describe('dashboard statistics', () => {
  it('computes counts, completion rate and upcoming exams', () => {
    let state = reducer(sampleState(), { type: 'GENERATE', today: TODAY });
    const [a, b, c] = state.sessions.filter((s) => s.status === 'planned');
    state = reducer(state, { type: 'MARK_SESSION', id: a.id, status: 'completed', today: TODAY });
    state = reducer({ ...state, settings: { ...state.settings, autoReplan: false } }, { type: 'MARK_SESSION', id: b.id, status: 'missed', today: TODAY });
    const st = dashboardStats(state, TODAY);
    expect(st.completed).toBe(1);
    expect(st.missed).toBe(1);
    expect(st.completionRate).toBeCloseTo(0.5);
    expect(st.upcomingExams[0].daysLeft).toBe(9);
    expect(st.workload).toHaveLength(14);
    expect(c).toBeDefined();
  });
});

describe('storage persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips state through localStorage (survives a "refresh")', () => {
    let state = reducer(sampleState(), { type: 'GENERATE', today: TODAY });
    const first = state.sessions.find((s) => s.status === 'planned');
    state = reducer(state, { type: 'MARK_SESSION', id: first.id, status: 'completed', today: TODAY });
    expect(saveState(state)).toBe(true);
    const loaded = loadState();
    expect(loaded.sessions.find((s) => s.id === first.id).status).toBe('completed');
    expect(loaded.subjects).toHaveLength(3);
    expect(loaded.topics).toHaveLength(9);
    expect(loaded.settings.sessionMinutes).toBe(DEFAULT_SETTINGS.sessionMinutes);
  });

  it('recovers from corrupted JSON and sanitises bad records', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadState()).toBeNull();
    const clean = sanitizeState({
      subjects: [{ id: 's1', name: 'X', examDate: 'garbage' }, { nope: true }],
      topics: [{ id: 't1', subjectId: 's1', name: 'T', difficulty: 99, importance: -3, durationMinutes: 'abc' }, { id: 't2', subjectId: 'missing', name: 'orphan' }],
      sessions: [{ id: 'x', topicId: 'nope', date: '2026-01-01', status: 'planned' }],
    });
    expect(clean.subjects).toHaveLength(1);
    expect(clean.subjects[0].examDate).toBe('');
    expect(clean.topics).toHaveLength(1);
    expect(clean.topics[0].difficulty).toBe(5);
    expect(clean.topics[0].importance).toBe(1);
    expect(clean.sessions).toHaveLength(0);
  });
});
