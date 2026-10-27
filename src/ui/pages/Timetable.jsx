import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, RefreshCw, RotateCcw, XCircle } from 'lucide-react';
import { useStore } from '../store.jsx';
import { addDays, formatDate, startOfWeek } from '../../planner/dates.js';
import { Badge, Card, Notice } from '../components.jsx';

const STATUS_TONE = { planned: 'brand', completed: 'green', missed: 'red' };

export default function Timetable() {
  const { state, dispatch, today } = useStore();
  const [weekStart, setWeekStart] = useState(startOfWeek(today));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const topicById = useMemo(() => new Map(state.topics.map((t) => [t.id, t])), [state.topics]);
  const subjectById = useMemo(() => new Map(state.subjects.map((s) => [s.id, s])), [state.subjects]);
  const meta = state.planMeta;
  const overdue = state.sessions.filter((s) => s.status === 'planned' && s.date < today).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-page">Weekly Timetable</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Mark sessions completed or missed. Missed sessions trigger a replan{state.settings.autoReplan ? '' : ' (auto-replan is off: use the button)'}.</p>
        </div>
        <button className="btn btn-primary" onClick={() => dispatch({ type: 'GENERATE', reason: 'Manual replan' })}><RefreshCw size={16} /> Replan now</button>
      </div>

      {meta?.stale && <Notice tone="amber" title="Plan is out of date">Subjects, topics or settings changed while auto-replan was off. Press &quot;Replan now&quot;.</Notice>}
      {overdue > 0 && <Notice tone="amber" title={`${overdue} overdue session(s)`}>Sessions before today that were never marked are counted as missed when you replan.</Notice>}
      {meta?.partial && <Notice tone="red" title="Only a partial plan fits">{meta.unscheduled.length} session(s) could not be scheduled. See the Planner page for the reasons.</Notice>}

      <div className="flex items-center justify-between">
        <button className="btn btn-secondary" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week"><ChevronLeft size={16} /></button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{formatDate(weekStart)} – {formatDate(addDays(weekStart, 6))}</span>
          <button className="btn btn-ghost" onClick={() => setWeekStart(startOfWeek(today))}>This week</button>
        </div>
        <button className="btn btn-secondary" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week"><ChevronRight size={16} /></button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {days.map((date) => {
          const sessions = state.sessions.filter((s) => s.date === date).sort((a, b) => (a.start < b.start ? -1 : 1));
          const exams = state.subjects.filter((s) => s.examDate === date);
          return (
            <section key={date} aria-label={formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}
              className={`rounded-xl border p-3 ${date === today ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-900/10' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
              <h2 className="mb-2 flex items-center justify-between text-sm font-semibold">
                <span>{formatDate(date)}</span>
                {date === today && <Badge tone="brand">Today</Badge>}
              </h2>
              {exams.map((e) => <div key={e.id} className="mb-2"><Badge tone="red">Exam: {e.name}</Badge></div>)}
              {sessions.length === 0 ? (
                <p className="text-xs text-slate-400">No sessions</p>
              ) : (
                <ul className="space-y-2">
                  {sessions.map((s) => {
                    const t = topicById.get(s.topicId);
                    const subj = subjectById.get(s.subjectId);
                    return (
                      <li key={s.id} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700" style={{ borderLeft: `4px solid ${subj?.color || '#6366f1'}` }}>
                        <p className={`text-sm font-medium ${s.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-white'}`}>{t?.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{s.start}–{s.end} · {subj?.name}</p>
                        <div className="mt-1.5 flex items-center justify-between">
                          <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
                          <div className="flex gap-1">
                            {s.status !== 'completed' && <button className="btn btn-ghost !p-1 text-emerald-600" aria-label={`Mark ${t?.name} on ${date} completed`} onClick={() => dispatch({ type: 'MARK_SESSION', id: s.id, status: 'completed' })}><CheckCircle2 size={18} /></button>}
                            {s.status === 'planned' && <button className="btn btn-ghost !p-1 text-rose-600" aria-label={`Mark ${t?.name} on ${date} missed`} onClick={() => dispatch({ type: 'MARK_SESSION', id: s.id, status: 'missed' })}><XCircle size={18} /></button>}
                            {s.status === 'completed' && <button className="btn btn-ghost !p-1" aria-label={`Undo completion of ${t?.name}`} onClick={() => dispatch({ type: 'MARK_SESSION', id: s.id, status: 'planned' })}><RotateCcw size={16} /></button>}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <Card title="Replanning log">
        {state.replanLog.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No replans yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr><th className="py-1 pr-3">When</th><th className="pr-3">Reason</th><th className="pr-3">Result</th><th className="pr-3">Scheduled</th><th className="pr-3">Unchanged</th><th>Moved</th></tr></thead>
              <tbody>
                {state.replanLog.map((l, i) => (
                  <tr key={i} className="border-t border-slate-200 dark:border-slate-800">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{new Date(l.at).toLocaleString()}</td>
                    <td className="pr-3">{l.reason}</td>
                    <td className="pr-3"><Badge tone={l.partial ? 'amber' : 'green'}>{l.partial ? 'partial' : l.status}</Badge></td>
                    <td className="pr-3">{l.scheduled}</td>
                    <td className="pr-3">{l.unchanged}</td>
                    <td>{l.moved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
