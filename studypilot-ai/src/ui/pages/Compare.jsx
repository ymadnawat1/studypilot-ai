import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Play } from 'lucide-react';
import { useStore } from '../store.jsx';
import { buildComparisonProblem, compareAlgorithms } from '../../planner/compare.js';
import { ALGO_COLORS, ALGO_LABEL, Badge, Card, Field, Notice } from '../components.jsx';

const pct = (x) => `${Math.round(x * 100)}%`;

function MiniChart({ title, rows, dataKey, unit = '' }) {
  const data = rows.map((r) => ({ name: ALGO_LABEL[r.algorithm], value: r[dataKey] ?? 0, algorithm: r.algorithm }));
  return (
    <Card title={title}>
      <div className="h-44" role="img" aria-label={`${title}: ${data.map((d) => `${d.name} ${Number(d.value).toFixed(1)}${unit}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="name" />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit}`} />
            <Bar dataKey="value" isAnimationActive={false}>
              {data.map((d) => <Cell key={d.algorithm} fill={ALGO_COLORS[d.algorithm]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export default function Compare() {
  const { state, today } = useStore();
  const [units, setUnits] = useState(6);
  const [limit, setLimit] = useState(20000);
  const [rows, setRows] = useState(null);
  const [info, setInfo] = useState(null);

  const run = () => {
    const { problem, truncated, totalAvailable } = buildComparisonProblem(state, today, units);
    const out = compareAlgorithms(problem, { maxExpansions: Number(limit), maxMillis: 8000 });
    setRows(out);
    setInfo({ total: problem.totalUnits, days: problem.days.length, truncated, totalAvailable, limit: Number(limit) });
  };

  const astar = rows?.find((r) => r.algorithm === 'astar');
  const bfs = rows?.find((r) => r.algorithm === 'bfs');
  const dfs = rows?.find((r) => r.algorithm === 'dfs');

  const findings = [];
  if (rows) {
    const solved = rows.filter((r) => r.status === 'goal');
    if (astar?.status === 'goal') {
      for (const r of [bfs, dfs]) {
        if (r.status === 'goal') findings.push(`${ALGO_LABEL[r.algorithm]} found a schedule with cost ${r.cost}; A* found cost ${astar.cost}${r.cost > astar.cost ? ` (${r.cost - astar.cost} higher than optimal)` : ' (same cost)'}.`);
        else findings.push(`${ALGO_LABEL[r.algorithm]} did not finish: ${r.status}${r.limit ? ` (${r.limit} limit)` : ''}.`);
      }
      if (bfs.expanded > 0 && astar.expanded > 0) findings.push(`A* expanded ${astar.expanded} states vs BFS ${bfs.expanded}${bfs.status !== 'goal' ? ' (BFS stopped at its limit)' : ''}.`);
    } else if (solved.length === 0) findings.push('No algorithm found a complete schedule within the limit. Increase the limit or reduce the number of units.');
    if (rows.every((r) => r.status === 'infeasible')) findings.length = 0, findings.push('The problem is infeasible: no algorithm can build a schedule that satisfies the hard constraints.');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-page">Algorithm Comparison</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">BFS, DFS and A* run on the exact same problem object with the same limits.</p>
      </div>

      <Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={`Study units: ${units}`} id="c-units" hint="BFS grows exponentially, so large inputs stop at the limit. That is a real result, not an error.">
            <input id="c-units" type="range" min="2" max="14" value={units} onChange={(e) => setUnits(Number(e.target.value))} className="w-full accent-brand-600" />
          </Field>
          <Field label="Expansion limit" id="c-limit">
            <select id="c-limit" className="input" value={limit} onChange={(e) => setLimit(e.target.value)}>
              {[2000, 20000, 100000].map((v) => <option key={v} value={v}>{v.toLocaleString()}</option>)}
            </select>
          </Field>
          <div className="flex items-end"><button className="btn btn-primary" onClick={run}><Play size={16} /> Run comparison</button></div>
        </div>
      </Card>

      {!rows && <Notice title="Ready">Press &quot;Run comparison&quot; to execute all three algorithms on your current subjects and topics.</Notice>}

      {rows && (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Input: {info.total} study units over {info.days} days{info.truncated ? ` (highest-priority ${info.total} of ${info.totalAvailable})` : ''}. Limit: {info.limit.toLocaleString()} expansions.
          </p>
          <Card title="Results">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr><th className="py-2 pr-3">Algorithm</th><th className="pr-3">Status</th><th className="pr-3">Runtime (ms)</th><th className="pr-3">States explored</th><th className="pr-3">Generated</th><th className="pr-3">Duplicates</th><th className="pr-3">Max frontier</th><th className="pr-3">Schedule cost</th><th className="pr-3">Unit coverage</th><th>Topic coverage</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.algorithm} className="border-t border-slate-200 dark:border-slate-800">
                      <td className="py-2 pr-3 font-semibold" style={{ color: ALGO_COLORS[r.algorithm] }}>{ALGO_LABEL[r.algorithm]}</td>
                      <td className="pr-3"><Badge tone={r.status === 'goal' ? 'green' : r.status === 'infeasible' ? 'red' : 'amber'}>{r.status === 'goal' ? (r.optimal ? 'goal · optimal' : 'goal') : r.status}</Badge></td>
                      <td className="pr-3">{r.runtimeMs.toFixed(1)}</td>
                      <td className="pr-3">{r.expanded.toLocaleString()}</td>
                      <td className="pr-3">{r.generated.toLocaleString()}</td>
                      <td className="pr-3">{r.duplicates.toLocaleString()}</td>
                      <td className="pr-3">{r.maxFrontier.toLocaleString()}</td>
                      <td className="pr-3">{r.cost ?? '—'}</td>
                      <td className="pr-3">{pct(r.unitCoverage)}</td>
                      <td>{pct(r.topicCoverage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Coverage of a run that did not finish is the deepest partial schedule it reached.</p>
          </Card>

          {findings.length > 0 && <Notice title="What these numbers show"><ul className="list-disc pl-5">{findings.map((f, i) => <li key={i}>{f}</li>)}</ul></Notice>}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MiniChart title="Runtime (ms)" rows={rows} dataKey="runtimeMs" unit=" ms" />
            <MiniChart title="States explored" rows={rows} dataKey="expanded" />
            <MiniChart title="Max frontier size" rows={rows} dataKey="maxFrontier" />
            <MiniChart title="Schedule cost (0 = none found)" rows={rows} dataKey="cost" />
          </div>
        </>
      )}
    </div>
  );
}
