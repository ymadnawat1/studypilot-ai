import { replan } from './planner.js';
import { sampleData } from './sampleData.js';
import { emptyState } from '../storage/storage.js';
import { normalizeSettings } from './planner.js';

let counter = 0;
export const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Recomputes the plan (auto-replan) or just flags it as stale. */
function afterChange(state, reason, today, now) {
  if (state.settings.autoReplan) {
    const { sessions, meta, log } = replan(state, today, reason, now);
    return { ...state, sessions, planMeta: meta, replanLog: [log, ...state.replanLog].slice(0, 20) };
  }
  return { ...state, planMeta: state.planMeta ? { ...state.planMeta, stale: true } : state.planMeta };
}

export function reducer(state, action) {
  const today = action.today;
  const now = action.now ?? Date.now();
  switch (action.type) {
    case 'INIT':
      return action.state;

    case 'ADD_SUBJECT':
      return afterChange({ ...state, subjects: [...state.subjects, action.subject] }, 'Subject added', today, now);
    case 'UPDATE_SUBJECT': {
      const old = state.subjects.find((s) => s.id === action.subject.id);
      const next = { ...state, subjects: state.subjects.map((s) => (s.id === action.subject.id ? action.subject : s)) };
      const reason = old && old.examDate !== action.subject.examDate ? `Exam date changed for ${action.subject.name}` : `Subject ${action.subject.name} updated`;
      return afterChange(next, reason, today, now);
    }
    case 'DELETE_SUBJECT':
      return afterChange(
        {
          ...state,
          subjects: state.subjects.filter((s) => s.id !== action.id),
          topics: state.topics.filter((t) => t.subjectId !== action.id),
          sessions: state.sessions.filter((s) => s.subjectId !== action.id),
        },
        'Subject deleted',
        today,
        now,
      );

    case 'ADD_TOPIC':
      return afterChange({ ...state, topics: [...state.topics, action.topic] }, 'Topic added', today, now);
    case 'UPDATE_TOPIC':
      return afterChange(
        { ...state, topics: state.topics.map((t) => (t.id === action.topic.id ? action.topic : t)) },
        'Topic updated',
        today,
        now,
      );
    case 'DELETE_TOPIC':
      return afterChange(
        {
          ...state,
          topics: state.topics.filter((t) => t.id !== action.id),
          sessions: state.sessions.filter((s) => s.topicId !== action.id),
        },
        'Topic deleted',
        today,
        now,
      );

    case 'UPDATE_SETTINGS':
      return afterChange({ ...state, settings: normalizeSettings({ ...state.settings, ...action.settings }) }, 'Planner settings changed', today, now);

    case 'GENERATE': {
      const { sessions, meta, log } = replan(state, today, action.reason || 'Plan generated', now);
      return { ...state, sessions, planMeta: meta, replanLog: [log, ...state.replanLog].slice(0, 20) };
    }

    case 'MARK_SESSION': {
      const next = {
        ...state,
        sessions: state.sessions.map((s) => (s.id === action.id ? { ...s, status: action.status } : s)),
      };
      // a missed session triggers replanning; completing one just updates progress
      if (action.status === 'missed') return afterChange(next, 'Session missed', today, now);
      return next;
    }

    case 'LOAD_SAMPLE': {
      const { subjects, topics } = sampleData(today);
      const base = { ...emptyState(), subjects, topics, seeded: true, settings: state.settings };
      const { sessions, meta, log } = replan(base, today, 'Sample data loaded', now);
      return { ...base, sessions, planMeta: meta, replanLog: [log] };
    }
    case 'RESET':
      return { ...emptyState(), seeded: true };

    default:
      return state;
  }
}
