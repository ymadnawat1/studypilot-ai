import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarClock, CheckCircle2, ListChecks, XCircle } from 'lucide-react';
import { useStore } from '../store.jsx';
import { dashboardStats } from '../../planner/stats.js';
import { formatDate } from '../../planner/dates.js';
import { Badge, Card, EmptyState, ProgressBar, Stat } from '../components.jsx';

export default function Dashboard() {
  const { state, today, dispatch } = useStore();
  const st = dashboardStats(state, today);
  const pie = [
    { name: 'Completed', value: st.completed, color: '#10b981' },
    { name: 'Planned', value: st.planned, color: '#6366f1' },
    { name: 'Missed', value: st.missed, color: '#f43f5e' },
  ].filter((p) => p.value > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-page">Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Your exams, today&apos;s sessions and progress at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sessions planned" value={st.planned} hint="still to do" />
        <Stat label="Completed" value={st.completed} />
        <Stat label="Missed" value={st.missed} />
        <Stat label="Completion rate" value={st.completionRate === null ? '—' : `${Math.round(st.completionRate * 100)}%`} hint="completed / (completed + missed)" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Upcoming exams & deadlines" className="lg:col-span-2">
          {st.upcomingExams.length === 0 ? (
            <EmptyState title="No upcoming exams">Add a subject with an exam date on the Subjects page.</EmptyState>
          ) : (
            <ul className="space-y-4">
              {st.upcomingExams.map((e) => (
                <li key={e.id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
                      <span className="inline-block h-3 w-3 rounded-full" style={{ background: e.color }} aria-hidden="true" />
                      {e.name}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone={e.daysLeft <= 3 ? 'red' : e.daysLeft <= 7 ? 'amber' : 'gray'}>
                        {e.daysLeft === 0 ? 'today' : `${e.daysLeft} day${e.daysLeft === 1 ? '' : 's'} left`}
                      </Badge>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(e.examDate)}</span>
                    </span>
                  </div>
                  <ProgressBar value={e.progress} color={e.color} label={`${e.name} study progress`} />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {Math.round(e.progress * 100)}% of study time completed · {e.plannedLeft} session(s) planned
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Session status">
          {pie.length === 0 ? (
            <EmptyState title="No sessions yet">Generate a plan first.</EmptyState>
          ) : (
            <div className="h-56" role="img" aria-label={`Sessions: ${st.completed} completed, ${st.planned} planned, ${st.missed} missed`}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {pie.map((p) => <Cell key={p.name} fill={p.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Today's tasks" className="lg:col-span-1">
          {st.todays.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Nothing scheduled for today.</p>
          ) : (
            <ul className="space-y-2">
              {st.todays.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900 dark:text-white">{s.topic?.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{s.start}–{s.end} · {s.subject?.name}</p>
                  </div>
                  {s.status === 'planned' ? (
                    <div className="flex gap-1">
                      <button className="btn btn-ghost !p-1 text-emerald-600" aria-label={`Mark ${s.topic?.name} completed`} onClick={() => dispatch({ type: 'MARK_SESSION', id: s.id, status: 'completed' })}><CheckCircle2 size={18} /></button>
                      <button className="btn btn-ghost !p-1 text-rose-600" aria-label={`Mark ${s.topic?.name} missed`} onClick={() => dispatch({ type: 'MARK_SESSION', id: s.id, status: 'missed' })}><XCircle size={18} /></button>
                    </div>
                  ) : (
                    <Badge tone={s.status === 'completed' ? 'green' : 'red'}>{s.status}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Workload — next 14 days (minutes)" className="lg:col-span-2">
          <div className="h-60" role="img" aria-label="Bar chart of planned and completed study minutes per day for the next 14 days">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={st.workload}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="planned" name="Planned" stackId="a" fill="#6366f1" />
                <Bar dataKey="completed" name="Completed" stackId="a" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <ListChecks size={14} aria-hidden="true" /> <CalendarClock size={14} aria-hidden="true" />
        Dates are in your local time. Progress is stored in this browser only.
      </p>
    </div>
  );
}
