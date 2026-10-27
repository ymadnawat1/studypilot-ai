import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Pause, Play, RotateCcw, StepForward } from 'lucide-react';
import { useStore } from '../store.jsx';
import { createSearch, ALGORITHMS } from '../../algorithms/index.js';
import { buildComparisonProblem } from '../../planner/compare.js';
import { ALGO_COLORS, Badge, Card, Field, Notice } from '../components.jsx';

const NODE_CAP = 220; // nodes drawn in the tree (the search itself is never truncated)
const STATUS_FILL = { expanded: '#6366f1', frontier: '#94a3b8', goal: '#10b981', duplicate: '#f59e0b', current: '#ef4444' };

function emptyRun() {
  return { nodes: new Map(), order: [], log: [], series: [], stats: null, current: null, frontier: [], result: null, steps: 0 };
}

export default function Visualizer() {
  const { state, today } = useStore();
  const [algo, setAlgo] = useState('astar');
  const [maxUnits, setMaxUnits] = useState(5);
  const [speed, setSpeed] = useState(3); // 1..6
  const [running, setRunning] = useState(false);
  const [, force] = useState(0);
  const runRef = useRef(emptyRun());
  const genRef = useRef(null);

  const { problem, truncated, totalAvailable } = useMemo(() => buildComparisonProblem(state, today, maxUnits), [state, today, maxUnits]);

  const reset = useCallback(() => {
    setRunning(false);
    runRef.current = emptyRun();
    genRef.current = createSearch(algo, problem, { trace: true, limits: { maxExpansions: 5000, maxMillis: 20000 } });
    force((n) => n + 1);
  }, [algo, problem]);

  useEffect(() => { reset(); }, [reset]);

  const stepOnce = useCallback(() => {
    const gen = genRef.current;
    const run = runRef.current;
    if (!gen || run.result) return false;
    const r = gen.next();
    if (r.done) {
      run.result = r.value;
      run.stats = r.value.stats;
      run.log.unshift(`Finished: ${r.value.status}${r.value.cost != null ? ` · cost ${r.value.cost}` : ''}`);
      return false;
    }
    const ev = r.value;
    run.steps++;
    run.stats = ev.stats;
    const register = (v, status) => {
      const prev = run.nodes.get(v.id);
      if (!prev) {
        run.nodes.set(v.id, { ...v, status: status || v.status });
        if (run.order.length < NODE_CAP) run.order.push(v.id);
      } else if (status) prev.status = status;
    };
    if (ev.type === 'init') register(ev.node, 'frontier');
    else if (ev.type === 'goal') {
      register(ev.node, 'goal');
      run.log.unshift(`Goal node selected for expansion (f = ${ev.node.f})`);
    } else {
      register(ev.node, 'expanded');
      run.nodes.get(ev.node.id).status = 'expanded';
      ev.children.forEach((c) => register(c, c.status));
      run.current = ev.node.id;
      run.frontier = ev.frontier;
      const act = ev.node.action ? `${problem.units[ev.node.action.unit].topicName} → day ${ev.node.action.day + 1}` : 'root';
      run.log.unshift(`#${ev.stats.expanded} expand ${act} · g=${ev.node.g} h=${ev.node.h} f=${ev.node.f}${ev.backtracked ? ' · BACKTRACK' : ''}${ev.children.length === 0 ? ' · dead end' : ''}`);
      run.series.push({ step: ev.stats.expanded, frontier: ev.stats.frontierSize });
      if (run.series.length > 400) run.series.shift();
    }
    if (run.log.length > 60) run.log.length = 60;
    return true;
  }, [problem]);

  useEffect(() => {
    if (!running) return undefined;
    const perTick = [1, 1, 1, 3, 8, 25][speed - 1];
    const delay = [900, 450, 200, 150, 120, 80][speed - 1];
    const id = setInterval(() => {
      let alive = true;
      for (let i = 0; i < perTick && alive; i++) alive = stepOnce();
      force((n) => n + 1);
      if (!alive) setRunning(false);
    }, delay);
    return () => clearInterval(id);
  }, [running, speed, stepOnce]);

  const run = runRef.current;
  const done = !!run.result;

  // partial schedule of the node being expanded: walk parents (all from real events)
  const partial = useMemo(() => {
    const out = [];
    let id = run.current ?? null;
    while (id !== null && id !== undefined) {
      const n = run.nodes.get(id);
      if (!n) break;
      if (n.action) out.push(n.action);
      id = n.parentId;
    }
    return out.reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.steps, run.current]);

  // tree layout: x by order within depth, y by depth
  const layout = useMemo(() => {
    const perDepth = new Map();
    const pos = new Map();
    for (const id of run.order) {
      const n = run.nodes.get(id);
      const i = perDepth.get(n.depth) || 0;
      perDepth.set(n.depth, i + 1);
      pos.set(id, { x: 14 + i * 16, y: 20 + n.depth * 38 });
    }
    const maxX = Math.max(300, ...[...pos.values()].map((p) => p.x + 20));
    const maxDepth = Math.max(1, ...run.order.map((id) => run.nodes.get(id).depth));
    return { pos, width: maxX, height: 40 + maxDepth * 38 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.steps, run.order.length]);

  const dayCount = problem.days.length;
  const stats = run.stats || { expanded: 0, generated: 0, duplicates: 0, pruned: 0, frontierSize: 0, maxFrontier: 0, maxDepth: 0, backtracks: 0 };
  const curNode = run.current !== null ? run.nodes.get(run.current) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-page">Search Visualizer</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">This runs the real BFS / DFS / A* code one expansion at a time. Nothing is faked or replayed from a recording.</p>
      </div>

      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Algorithm" id="v-alg">
            <select id="v-alg" className="input" value={algo} onChange={(e) => setAlgo(e.target.value)}>
              {Object.values(ALGORITHMS).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label={`Study units searched: ${problem.totalUnits}`} id="v-units" hint={truncated ? `Highest-priority ${maxUnits} of ${totalAvailable} units.` : 'All remaining units.'}>
            <input id="v-units" type="range" min="2" max="10" value={maxUnits} onChange={(e) => setMaxUnits(Number(e.target.value))} className="w-full accent-brand-600" />
          </Field>
          <Field label={`Speed: ${speed}/6`} id="v-speed">
            <input id="v-speed" type="range" min="1" max="6" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full accent-brand-600" />
          </Field>
          <div className="flex items-end gap-2">
            <button className="btn btn-primary" onClick={() => setRunning((r) => !r)} disabled={done || problem.totalUnits === 0}>
              {running ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Start</>}
            </button>
            <button className="btn btn-secondary" onClick={() => { stepOnce(); force((n) => n + 1); }} disabled={done || running} aria-label="Step one expansion"><StepForward size={16} /> Step</button>
            <button className="btn btn-secondary" onClick={reset} aria-label="Reset"><RotateCcw size={16} /></button>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Frontier: <strong>{ALGORITHMS[algo].frontier}</strong>. {algo === 'astar' && 'Goal test happens when the node is selected for expansion.'}
          {algo !== 'astar' && 'Goal test happens when a node is generated.'}
        </p>
      </Card>

      {problem.totalUnits === 0 && <Notice title="Nothing to search">Add topics with exams inside the planning horizon.</Notice>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8" aria-live="polite">
        {[
          ['Expanded', stats.expanded], ['Generated', stats.generated], ['Duplicates skipped', stats.duplicates], ['Pruned (dead ends)', stats.pruned],
          ['Frontier size', stats.frontierSize], ['Max frontier', stats.maxFrontier], ['Deepest level', `${stats.maxDepth}/${problem.totalUnits}`], ['Backtracks', stats.backtracks],
        ].map(([k, v]) => (
          <div key={k} className="card !p-3"><p className="text-[11px] uppercase text-slate-500">{k}</p><p className="text-lg font-bold" data-testid={`stat-${k}`}>{v}</p></div>
        ))}
      </div>

      {done && (
        <Notice tone={run.result.status === 'goal' ? 'green' : 'amber'} title={run.result.status === 'goal' ? `Complete schedule found · cost ${run.result.cost}` : `Stopped: ${run.result.status}`}>
          {run.result.message || run.result.optimalityNote}
          {run.result.status === 'goal' && <p className="mt-1">{run.result.optimalityNote}</p>}
        </Notice>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title={`Search tree (first ${NODE_CAP} nodes drawn)`} className="xl:col-span-2">
          <div className="mb-2 flex flex-wrap gap-2 text-xs">
            {Object.entries({ expanded: 'Expanded', frontier: 'In frontier', duplicate: 'Duplicate', goal: 'Goal' }).map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full" style={{ background: STATUS_FILL[k] }} />{v}</span>
            ))}
            <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full ring-2 ring-rose-500" />Current</span>
          </div>
          <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <svg width={layout.width} height={layout.height} role="img" aria-label={`Search tree with ${run.order.length} nodes. Level ${stats.maxDepth} reached out of ${problem.totalUnits}.`}>
              {run.order.map((id) => {
                const n = run.nodes.get(id);
                const p = layout.pos.get(id);
                const par = n.parentId !== null ? layout.pos.get(n.parentId) : null;
                return par ? <line key={`e${id}`} x1={par.x} y1={par.y} x2={p.x} y2={p.y} stroke="#94a3b8" strokeWidth="0.7" opacity="0.6" /> : null;
              })}
              {run.order.map((id) => {
                const n = run.nodes.get(id);
                const p = layout.pos.get(id);
                return (
                  <circle key={id} cx={p.x} cy={p.y} r={id === run.current ? 6 : 4.5} fill={STATUS_FILL[n.status] || '#94a3b8'} stroke={id === run.current ? '#ef4444' : 'none'} strokeWidth="2">
                    <title>{`node ${id} · depth ${n.depth} · g=${n.g} h=${n.h} f=${n.f}`}</title>
                  </circle>
                );
              })}
            </svg>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Partial schedule of the current node">
            {partial.length === 0 ? <p className="text-sm text-slate-500">Press Start or Step.</p> : (
              <ol className="max-h-56 space-y-1 overflow-auto text-sm">
                {partial.map((a, i) => (
                  <li key={i} className="flex justify-between gap-2"><span className="truncate">{problem.units[a.unit].topicName}</span><Badge tone="brand">{problem.days[a.day]?.date.slice(5)} · slot {a.slot + 1}</Badge></li>
                ))}
              </ol>
            )}
            {curNode && <p className="mt-2 text-xs text-slate-500">depth {curNode.depth}/{problem.totalUnits} · g={curNode.g} · h={curNode.h} · f={curNode.f}</p>}
          </Card>
          <Card title={`Frontier preview (${dayCount} days)`}>
            {run.frontier.length === 0 ? <p className="text-sm text-slate-500">Empty.</p> : (
              <ul className="space-y-1 text-xs">
                {run.frontier.map((n) => <li key={n.id} className="flex justify-between"><span>node {n.id} · depth {n.depth}</span><span className="font-mono">f={n.f}</span></li>)}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Frontier size over time">
          <div className="h-48" role="img" aria-label="Line chart of frontier size per expansion">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={run.series}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="step" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="frontier" stroke={ALGO_COLORS[algo]} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Execution log">
          <ol className="h-48 space-y-1 overflow-auto font-mono text-xs">
            {run.log.length === 0 ? <li className="text-slate-500">No steps yet.</li> : run.log.map((l, i) => <li key={i}>{l}</li>)}
          </ol>
        </Card>
      </div>
    </div>
  );
}
