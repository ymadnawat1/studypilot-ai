import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ALGORITHMS_INFO, HEURISTIC, MODEL, QUESTIONS } from '../vivaContent.js';
import { Card } from '../components.jsx';

function Accordion({ q, a, id }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-200 last:border-0 dark:border-slate-800">
      <h3>
        <button className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm font-medium" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          {q}
          <ChevronDown size={16} className={`shrink-0 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </h3>
      {open && <p id={id} className="pb-3 text-sm text-slate-600 dark:text-slate-400">{a}</p>}
    </div>
  );
}

export default function Viva() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h-page">AISC Viva Guide</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">State-space search, how each algorithm works here, the heuristic, and likely viva questions.</p>
      </div>

      <Card title="1. The state-space model (shared by BFS, DFS and A*)">
        <dl className="grid gap-3 sm:grid-cols-2">
          {MODEL.map(([k, v]) => (
            <div key={k}><dt className="text-xs font-semibold uppercase text-brand-600 dark:text-brand-300">{k}</dt><dd className="text-sm text-slate-700 dark:text-slate-300">{v}</dd></div>
          ))}
        </dl>
      </Card>

      <Card title="2. How each algorithm works and its complexity">
        <div className="grid gap-4 lg:grid-cols-3">
          {ALGORITHMS_INFO.map((a) => (
            <article key={a.name} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-white">{a.name}</h3>
              <p className="mt-1">{a.how}</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                <li><strong>Complete:</strong> {a.complete}</li>
                <li><strong>Optimal:</strong> {a.optimal}</li>
                <li><strong>Time:</strong> {a.time}</li>
                <li><strong>Space:</strong> {a.space}</li>
              </ul>
            </article>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">b = branching factor (number of usable days), m = number of study units (solution depth).</p>
      </Card>

      <Card title="3. The A* heuristic">
        <div className="space-y-2 text-sm">
          <p><strong>Idea.</strong> {HEURISTIC.idea}</p>
          <p><strong>Why admissible.</strong> {HEURISTIC.admissible}</p>
          <p><strong>Why consistent.</strong> {HEURISTIC.consistent}</p>
          <p><strong>Tiny example.</strong> {HEURISTIC.explain}</p>
          <p className="rounded-lg bg-slate-100 p-3 font-mono text-xs dark:bg-slate-800">f(n) = g(n) + h(n) · g = cost of assignments so far · h = cheapest completion of the relaxed problem</p>
        </div>
      </Card>

      <Card title="4. Viva questions (click to reveal)">
        {QUESTIONS.map(([q, a], i) => <Accordion key={q} q={q} a={a} id={`viva-${i}`} />)}
      </Card>
    </div>
  );
}
