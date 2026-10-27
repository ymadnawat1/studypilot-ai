import { DEFAULT_SETTINGS, normalizeSettings } from '../planner/planner.js';
import { isValidISO } from '../planner/dates.js';

export const STORAGE_KEY = 'studypilot.v1';
export const THEME_KEY = 'studypilot.theme';
export const SCHEMA_VERSION = 1;

export function emptyState() {
  return {
    version: SCHEMA_VERSION,
    subjects: [],
    topics: [],
    sessions: [],
    settings: normalizeSettings(DEFAULT_SETTINGS),
    planMeta: null,
    replanLog: [],
    seeded: false,
  };
}

const clamp = (v, lo, hi, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};

/** Defensive sanitiser: bad / hand-edited / older data never crashes the app. */
export function sanitizeState(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const subjects = (Array.isArray(raw.subjects) ? raw.subjects : [])
    .filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string')
    .map((s) => ({
      id: s.id,
      name: s.name.slice(0, 80),
      color: typeof s.color === 'string' ? s.color : '#6366f1',
      examDate: isValidISO(s.examDate) ? s.examDate : '',
    }));
  const ids = new Set(subjects.map((s) => s.id));
  const topics = (Array.isArray(raw.topics) ? raw.topics : [])
    .filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string' && ids.has(t.subjectId))
    .map((t) => ({
      id: t.id,
      subjectId: t.subjectId,
      name: t.name.slice(0, 80),
      difficulty: clamp(t.difficulty, 1, 5, 3),
      importance: clamp(t.importance, 1, 5, 3),
      durationMinutes: clamp(t.durationMinutes, 15, 3000, 60),
    }));
  const topicIds = new Set(topics.map((t) => t.id));
  const sessions = (Array.isArray(raw.sessions) ? raw.sessions : [])
    .filter(
      (s) =>
        s && typeof s.id === 'string' && topicIds.has(s.topicId) && isValidISO(s.date) &&
        ['planned', 'completed', 'missed'].includes(s.status),
    )
    .map((s) => ({
      id: s.id,
      topicId: s.topicId,
      subjectId: topics.find((t) => t.id === s.topicId).subjectId,
      date: s.date,
      start: String(s.start || '18:00'),
      end: String(s.end || '19:00'),
      minutes: clamp(s.minutes, 5, 600, 60),
      status: s.status,
    }));
  return {
    version: SCHEMA_VERSION,
    subjects,
    topics,
    sessions,
    settings: normalizeSettings(raw.settings),
    planMeta: raw.planMeta && typeof raw.planMeta === 'object' ? raw.planMeta : null,
    replanLog: Array.isArray(raw.replanLog) ? raw.replanLog.slice(0, 20) : [],
    seeded: !!raw.seeded,
  };
}

export function loadState(storage = globalThis.localStorage) {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    if (!text) return null;
    return sanitizeState(JSON.parse(text));
  } catch {
    return null; // corrupted JSON or storage blocked: caller starts fresh
  }
}

export function saveState(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false; // quota exceeded / private mode
  }
}

export function clearState(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadTheme(storage = globalThis.localStorage) {
  try {
    const t = storage?.getItem(THEME_KEY);
    if (t === 'dark' || t === 'light') return t;
  } catch {
    /* ignore */
  }
  try {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function saveTheme(theme, storage = globalThis.localStorage) {
  try {
    storage?.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}
