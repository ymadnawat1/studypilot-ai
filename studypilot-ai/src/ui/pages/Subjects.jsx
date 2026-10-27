import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store.jsx';
import { newId } from '../../planner/reducer.js';
import { formatDate, isValidISO } from '../../planner/dates.js';
import { Badge, Card, EmptyState, Field, Modal } from '../components.jsx';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9', '#8b5cf6', '#ef4444'];

function SubjectForm({ initial, onSave, onClose, count }) {
  const [name, setName] = useState(initial?.name || '');
  const [examDate, setExamDate] = useState(initial?.examDate || '');
  const [color, setColor] = useState(initial?.color || COLORS[count % COLORS.length]);
  const [error, setError] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Please enter a subject name.');
    if (!isValidISO(examDate)) return setError('Please pick a valid exam date.');
    onSave({ id: initial?.id || newId('sub'), name: name.trim(), examDate, color });
  };
  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <Field label="Subject name" id="sub-name"><input id="sub-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Exam date" id="sub-date"><input id="sub-date" type="date" className="input" value={examDate} onChange={(e) => setExamDate(e.target.value)} /></Field>
      <fieldset>
        <legend className="label">Colour</legend>
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button type="button" key={c} onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={color === c}
              className={`h-7 w-7 rounded-full border-2 ${color === c ? 'border-slate-900 dark:border-white' : 'border-transparent'}`} style={{ background: c }} />
          ))}
        </div>
      </fieldset>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save subject</button>
      </div>
    </form>
  );
}

function TopicForm({ initial, subjectId, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || '');
  const [difficulty, setDifficulty] = useState(initial?.difficulty || 3);
  const [importance, setImportance] = useState(initial?.importance || 3);
  const [minutes, setMinutes] = useState(initial?.durationMinutes || 60);
  const [error, setError] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const m = Number(minutes);
    if (!name.trim()) return setError('Please enter a topic name.');
    if (!Number.isFinite(m) || m < 15 || m > 3000) return setError('Study time must be between 15 and 3000 minutes.');
    onSave({ id: initial?.id || newId('t'), subjectId, name: name.trim(), difficulty: Number(difficulty), importance: Number(importance), durationMinutes: Math.round(m) });
  };
  const scale = (id, label, value, set) => (
    <Field label={`${label}: ${value}/5`} id={id}>
      <input id={id} type="range" min="1" max="5" step="1" value={value} onChange={(e) => set(e.target.value)} className="w-full accent-brand-600" />
    </Field>
  );
  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <Field label="Topic name" id="top-name"><input id="top-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      {scale('top-diff', 'Difficulty', difficulty, setDifficulty)}
      {scale('top-imp', 'Importance', importance, setImportance)}
      <Field label="Estimated study time (minutes)" id="top-min"><input id="top-min" type="number" min="15" step="15" className="input" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></Field>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save topic</button>
      </div>
    </form>
  );
}

export default function Subjects() {
  const { state, dispatch, today } = useStore();
  const [dialog, setDialog] = useState(null); // {kind, item, subjectId}
  const close = () => setDialog(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-page">Subjects & Topics</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Difficulty and importance decide which topics the planner schedules first.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setDialog({ kind: 'subject' })}><Plus size={16} /> Add subject</button>
      </div>

      {state.subjects.length === 0 && (
        <EmptyState title="No subjects yet">
          Add a subject, or <button className="underline" onClick={() => dispatch({ type: 'LOAD_SAMPLE' })}>load the sample data</button>.
        </EmptyState>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {state.subjects.map((s) => {
          const topics = state.topics.filter((t) => t.subjectId === s.id);
          const past = s.examDate && s.examDate < today;
          return (
            <Card key={s.id}
              title={<span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full" style={{ background: s.color }} aria-hidden="true" />{s.name}</span>}
              action={
                <div className="flex items-center gap-1">
                  <Badge tone={past ? 'red' : 'brand'}>Exam {s.examDate ? formatDate(s.examDate) : 'not set'}</Badge>
                  <button className="btn btn-ghost !p-1.5" aria-label={`Edit subject ${s.name}`} onClick={() => setDialog({ kind: 'subject', item: s })}><Pencil size={15} /></button>
                  <button className="btn btn-ghost !p-1.5 text-rose-600" aria-label={`Delete subject ${s.name}`} onClick={() => window.confirm(`Delete "${s.name}" and its ${topics.length} topic(s)?`) && dispatch({ type: 'DELETE_SUBJECT', id: s.id })}><Trash2 size={15} /></button>
                </div>
              }>
              {topics.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No topics yet.</p>
              ) : (
                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                  {topics.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{t.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Difficulty {t.difficulty}/5 · Importance {t.importance}/5 · {t.durationMinutes} min</p>
                      </div>
                      <div className="flex shrink-0">
                        <button className="btn btn-ghost !p-1.5" aria-label={`Edit topic ${t.name}`} onClick={() => setDialog({ kind: 'topic', item: t, subjectId: s.id })}><Pencil size={15} /></button>
                        <button className="btn btn-ghost !p-1.5 text-rose-600" aria-label={`Delete topic ${t.name}`} onClick={() => window.confirm(`Delete topic "${t.name}"?`) && dispatch({ type: 'DELETE_TOPIC', id: t.id })}><Trash2 size={15} /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <button className="btn btn-secondary mt-3" onClick={() => setDialog({ kind: 'topic', subjectId: s.id })}><Plus size={14} /> Add topic</button>
            </Card>
          );
        })}
      </div>

      {dialog?.kind === 'subject' && (
        <Modal title={dialog.item ? 'Edit subject' : 'Add subject'} onClose={close}>
          <SubjectForm initial={dialog.item} count={state.subjects.length} onClose={close}
            onSave={(subject) => { dispatch({ type: dialog.item ? 'UPDATE_SUBJECT' : 'ADD_SUBJECT', subject }); close(); }} />
        </Modal>
      )}
      {dialog?.kind === 'topic' && (
        <Modal title={dialog.item ? 'Edit topic' : 'Add topic'} onClose={close}>
          <TopicForm initial={dialog.item} subjectId={dialog.subjectId} onClose={close}
            onSave={(topic) => { dispatch({ type: dialog.item ? 'UPDATE_TOPIC' : 'ADD_TOPIC', topic }); close(); }} />
        </Modal>
      )}
    </div>
  );
}
