import { useEffect, useState } from 'react';
import { BarChart3, BookOpen, CalendarDays, GraduationCap, LayoutDashboard, Menu, Moon, Network, SlidersHorizontal, Sun, X } from 'lucide-react';
import { useStore } from './ui/store.jsx';
import Dashboard from './ui/pages/Dashboard.jsx';
import Subjects from './ui/pages/Subjects.jsx';
import Planner from './ui/pages/Planner.jsx';
import Timetable from './ui/pages/Timetable.jsx';
import Visualizer from './ui/pages/Visualizer.jsx';
import Compare from './ui/pages/Compare.jsx';

const ROUTES = [
  { path: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, Page: Dashboard },
  { path: 'subjects', label: 'Subjects & Topics', icon: BookOpen, Page: Subjects },
  { path: 'planner', label: 'Study Planner', icon: SlidersHorizontal, Page: Planner },
  { path: 'timetable', label: 'Weekly Timetable', icon: CalendarDays, Page: Timetable },
  { path: 'visualizer', label: 'Search Visualizer', icon: Network, Page: Visualizer },
  { path: 'compare', label: 'Algorithm Comparison', icon: BarChart3, Page: Compare },
];

function useHashRoute() {
  const read = () => {
    const p = window.location.hash.replace(/^#\/?/, '');
    return ROUTES.some((r) => r.path === p) ? p : 'dashboard';
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export default function App() {
  const route = useHashRoute();
  const { theme, toggleTheme } = useStore();
  const [open, setOpen] = useState(false);
  const current = ROUTES.find((r) => r.path === route);
  const Page = current.Page;

  useEffect(() => {
    document.title = `${current.label} · StudyPilot AI`;
    window.scrollTo(0, 0);
    setOpen(false);
  }, [current.label]);

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-1 p-3">
      {ROUTES.map(({ path, label, icon: Icon }) => (
        <a key={path} href={`#/${path}`} aria-current={route === path ? 'page' : undefined}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${route === path ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
          <Icon size={18} aria-hidden="true" /> {label}
        </a>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2 focus:text-slate-900">Skip to content</a>

      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:block">
        <div className="flex h-16 items-center gap-2 px-5 text-lg font-bold text-slate-900 dark:text-white">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white"><GraduationCap size={18} /></span> StudyPilot AI
        </div>
        {nav}
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-72 bg-white shadow-xl dark:bg-slate-900">
            <div className="flex h-16 items-center justify-between px-5 font-bold">StudyPilot AI
              <button className="btn btn-ghost !p-1" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
            </div>
            {nav}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          <button className="btn btn-ghost lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <span className="font-semibold lg:hidden">StudyPilot AI</span>
          <span className="hidden text-sm text-slate-500 dark:text-slate-400 lg:block">Intelligent study planning with BFS · DFS · A*</span>
          <button className="btn btn-secondary" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />} <span className="hidden sm:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          <Page />
        </main>
      </div>
    </div>
  );
}
