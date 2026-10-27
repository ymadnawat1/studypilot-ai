import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import { reducer } from '../planner/reducer.js';
import { emptyState, loadState, saveState, loadTheme, saveTheme } from '../storage/storage.js';
import { todayISO } from '../planner/dates.js';

const StoreContext = createContext(null);

function init() {
  const saved = loadState();
  if (saved && (saved.seeded || saved.subjects.length > 0)) return saved;
  // first visit: start with sample data so every page has something to show
  return reducer(emptyState(), { type: 'LOAD_SAMPLE', today: todayISO() });
}

export function StoreProvider({ children, today: todayOverride }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, init);
  const [theme, setTheme] = useState(loadTheme);
  const today = todayOverride || todayISO();

  const dispatch = useCallback((action) => rawDispatch({ today, ...action }), [today]);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    saveTheme(theme);
  }, [theme]);

  const value = useMemo(
    () => ({ state, dispatch, today, theme, toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }),
    [state, dispatch, today, theme],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
