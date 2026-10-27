import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useStore } from '../store.jsx';
import { WEEKDAYS } from '../../planner/dates.js';
import { ALGORITHMS } from '../../algorithms/index.js';
import { Badge, Card, Field, Notice } from '../components.jsx';

export default function Planner() {
  const { state, dispatch } = useStore();
  const s = state.settings;
  const [draft, setDraft] = useState(s);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(s);
  const meta = state.planMeta;

  const num = (id, label, key, props = {}, hint) => (
    <Field label={label} id={id} hint={hint}>
      <input id={id} type="number" className="input" value={draft[key]} onChange={(e) => set({ [key]: e.target.value })} {...props} />
    </Field>
  );

  const apply = () => dispatch({ type: 'UPDATE_SETTINGS', settings: draft });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-page">Study Planner</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Tell the planner how much time you have. It searches for a schedule that respects every hard constraint.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Availability & limits" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            {num('h', 'Planning horizon (days)', 'horizonDays', { min: 1, max: 90 }, 'Only topics with an exam inside the horizon are scheduled.')}
            <Field label="Plan starts" id="off">
              <select id="off" className="input" value={draft.startOffsetDays} onChange={(e) => set({ startOffsetDays: Number(e.target.value) })}>
                <option value={0}>Today</option>
                <option value={1}>Tomorrow</option>
              </select>
            </Field>
            {num('sm', 'Session length (minutes)', 'sessionMinutes', { min: 15, max: 240, step: 5 })}
            {num('bm', 'Break between sessions (minutes)', 'breakMinutes', { min: 0, max: 60, step: 5 })}
            {num('md', 'Max study minutes per day', 'maxDailyMinutes', { min: 15, max: 720, step: 15 }, 'Workload limit: hard constraint.')}
            {num('mt', 'Max sessions of one topic per day', 'maxPerTopicPerDay', { min: 1, max: 8 }, 'Hard constraint that keeps study varied.')}
            <Field label="Daily start time" id="st"><input id="st" type="time" className="input" value={draft.startTime} onChange={(e) => set({ startTime: e.target.value })} /></Field>
          </div>

          <fieldset className="mt-4">
            <legend className="label">Minutes available on each weekday</legend>
            <div className="grid grid-cols-7 gap-2">
              {WEEKDAYS.map((w, i) => (
                <div key={w}>
                  <label htmlFor={`av-${i}`} className="mb-1 block text-center text-xs text-slate-500 dark:text-slate-400">{w}</label>
                  <input id={`av-${i}`} type="number" min="0" max="1440" step="15" className="input !px-1 text-center" value={draft.availability[i]}
                    onChange={(e) => set({ availability: draft.availability.map((v, j) => (j === i ? e.target.value : v)) })} />
                </div>
              ))}
            </div>
          </fieldset>
        </Card>

        <Card title="Search settings">
          <div className="space-y-3">
            <Field label="Algorithm used to build the plan" id="alg" hint="A* is optimal when it finishes within the limit.">
              <select id="alg" className="input" value={draft.algorithm} onChange={(e) => set({ algorithm: e.target.value })}>
                {Object.values(ALGORITHMS).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            {num('mx', 'Search limit (expansions)', 'maxExpansions', { min: 100, max: 200000, step: 100 })}
            <Field label={`Delay weight: ${draft.weights.delay}`} id="wd" hint="Higher = important & hard topics are pulled earlier.">
              <input id="wd" type="range" min="0" max="10" value={draft.weights.delay} onChange={(e) => set({ weights: { ...draft.weights, delay: Number(e.target.value) } })} className="w-full accent-brand-600" />
            </Field>
            <Field label={`Daily-load weight: ${draft.weights.load}`} id="wl" hint="Higher = work is spread across more days.">
              <input id="wl" type="range" min="0" max="30" value={draft.weights.load} onChange={(e) => set({ weights: { ...draft.weights, load: Number(e.target.value) } })} className="w-full accent-brand-600" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.autoReplan} onChange={(e) => set({ autoReplan: e.target.checked })} className="h-4 w-4 accent-brand-600" />
              Replan automatically when sessions are missed or deadlines change
            </label>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={apply} disabled={!dirty}>Save settings{s.autoReplan ? ' & replan' : ''}</button>
        <button className="btn btn-secondary" onClick={() => dispatch({ type: 'GENERATE', reason: 'Manual plan generation' })}><Sparkles size={16} /> Generate plan now</button>
        {dirty && <button className="btn btn-ghost" onClick={() => setDraft(s)}>Discard changes</button>}
      </div>

      <PlanReport meta={meta} />
    </div>
  );
}

export function PlanReport({ meta }) {
  if (!meta) return <Notice title="No plan yet">Press &quot;Generate plan now&quot;.</Notice>;
  const toneForStatus = meta.status === 'goal' && !meta.partial ? 'green' : 'amber';
  return (
    <Card title="Latest plan report">
      <div className="mb-3 flex flex-wrap gap-2">
        <Badge tone="brand">Algorithm: {meta.fallback ? `${meta.algorithm.toUpperCase()} → guided DFS` : meta.algorithm === 'astar' ? 'A*' : meta.algorithm.toUpperCase()}</Badge>
        <Badge tone={toneForStatus}>{meta.partial ? 'Partial plan' : meta.status === 'goal' ? 'Complete plan' : meta.status}</Badge>
        <Badge tone={meta.optimal ? 'green' : 'gray'}>{meta.optimal ? 'Provably optimal' : 'Not claimed optimal'}</Badge>
        <Badge tone={meta.validation?.ok ? 'green' : 'red'}>{meta.validation?.ok ? 'Constraint check passed' : 'Constraint check FAILED'}</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-slate-500">Sessions scheduled</dt><dd className="font-semibold">{meta.scheduledUnits} / {meta.totalUnits}</dd></div>
        <div><dt className="text-xs text-slate-500">Schedule cost</dt><dd className="font-semibold">{meta.cost ?? '—'}</dd></div>
        <div><dt className="text-xs text-slate-500">States explored</dt><dd className="font-semibold">{meta.stats?.expanded ?? 0}</dd></div>
        <div><dt className="text-xs text-slate-500">Search time</dt><dd className="font-semibold">{meta.stats ? `${meta.stats.runtimeMs.toFixed(1)} ms` : '—'}</dd></div>
      </dl>
      {meta.optimalityNote && <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{meta.optimalityNote}</p>}
      {meta.message && meta.status !== 'goal' && <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{meta.message}</p>}
      {meta.partial && (
        <div className="mt-3 space-y-2">
          <Notice tone="red" title="This workload does not fit the available time">
            <ul className="list-disc pl-5">{meta.diagnostics.map((d, i) => <li key={i}>{d.message}</li>)}</ul>
            <p className="mt-1">Fix: add availability, raise the daily limit, extend the horizon, or remove topics. {meta.unscheduled.length} session(s) could not be placed.</p>
          </Notice>
        </div>
      )}
      {meta.excluded?.length > 0 && (
        <Notice tone="amber" title={`${meta.excluded.length} topic(s) not scheduled`}>
          <ul className="list-disc pl-5">{meta.excluded.map((e) => <li key={e.topicId}>{e.name}: {e.reason}</li>)}</ul>
        </Notice>
      )}
      {meta.validation && !meta.validation.ok && (
        <Notice tone="red" title="Violations"><ul className="list-disc pl-5">{meta.validation.violations.map((v, i) => <li key={i}>{v}</li>)}</ul></Notice>
      )}
    </Card>
  );
}
