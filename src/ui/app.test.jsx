// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import App from '../App.jsx';
import { StoreProvider } from './store.jsx';
import { loadState, STORAGE_KEY } from '../storage/storage.js';
import { todayISO } from '../planner/dates.js';

const TODAY = todayISO();
const mount = () => render(<StoreProvider today={TODAY}><App /></StoreProvider>);
const go = (hash) => act(() => { window.location.hash = hash; window.dispatchEvent(new HashChangeEvent('hashchange')); });

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '#/dashboard';
});
afterEach(cleanup);

describe('StudyPilot AI app', () => {
  it('first visit seeds sample data and shows the dashboard', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getAllByText('Artificial Intelligence').length).toBeGreaterThan(0);
    expect(loadState().subjects).toHaveLength(3);
  });

  it('navigates between all pages', () => {
    mount();
    const pages = {
      '#/subjects': 'Subjects & Topics',
      '#/planner': 'Study Planner',
      '#/timetable': 'Weekly Timetable',
      '#/visualizer': 'Search Visualizer',
      '#/compare': 'Algorithm Comparison',
    };
    for (const [hash, title] of Object.entries(pages)) {
      go(hash);
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeTruthy();
    }
  });

  it('toggles and persists the dark theme', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /switch to (dark|light) theme/i }));
    const dark = document.documentElement.classList.contains('dark');
    expect(localStorage.getItem('studypilot.theme')).toBe(dark ? 'dark' : 'light');
  });

  it('progress persists across a refresh (unmount + remount)', () => {
    const first = mount();
    go('#/timetable');
    const buttons = screen.getAllByRole('button', { name: /completed$/i }).filter((b) => /^Mark/.test(b.getAttribute('aria-label')));
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[0]);
    const before = loadState().sessions.filter((s) => s.status === 'completed').length;
    expect(before).toBe(1);
    first.unmount();
    mount();
    expect(loadState().sessions.filter((s) => s.status === 'completed').length).toBe(1);
    go('#/dashboard');
    expect(screen.getByText('Completed').nextSibling.textContent).toBe('1');
  });

  it('adds a subject and a topic, then the plan includes the new topic', () => {
    mount();
    go('#/subjects');
    fireEvent.click(screen.getByRole('button', { name: /add subject/i }));
    fireEvent.change(screen.getByLabelText('Subject name'), { target: { value: 'Soft Computing' } });
    const exam = new Date(); exam.setDate(exam.getDate() + 10);
    const iso = `${exam.getFullYear()}-${String(exam.getMonth() + 1).padStart(2, '0')}-${String(exam.getDate()).padStart(2, '0')}`;
    fireEvent.change(screen.getByLabelText('Exam date'), { target: { value: iso } });
    fireEvent.click(screen.getByRole('button', { name: /save subject/i }));
    const card = screen.getByText('Soft Computing').closest('section');
    fireEvent.click(within(card).getByRole('button', { name: /add topic/i }));
    fireEvent.change(screen.getByLabelText('Topic name'), { target: { value: 'Genetic algorithms' } });
    fireEvent.click(screen.getByRole('button', { name: /save topic/i }));
    const saved = loadState();
    expect(saved.subjects.some((s) => s.name === 'Soft Computing')).toBe(true);
    const topic = saved.topics.find((t) => t.name === 'Genetic algorithms');
    expect(topic).toBeTruthy();
    expect(saved.sessions.some((s) => s.topicId === topic.id && s.status === 'planned')).toBe(true);
  });

  it('rejects an invalid topic duration with an accessible error', () => {
    mount();
    go('#/subjects');
    const card = screen.getByText('Fuzzy logic').closest('section');
    fireEvent.click(within(card).getByRole('button', { name: /add topic/i }));
    fireEvent.change(screen.getByLabelText('Topic name'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText(/estimated study time/i), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /save topic/i }));
    expect(screen.getByRole('alert').textContent).toMatch(/between 15 and 3000/);
  });

  it('visualizer: Step runs the real algorithm and counters advance; Reset clears them', () => {
    mount();
    go('#/visualizer');
    const expanded = () => screen.getByTestId('stat-Expanded').textContent;
    expect(expanded()).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: /step one expansion/i })); // init event
    fireEvent.click(screen.getByRole('button', { name: /step one expansion/i })); // first expansion
    fireEvent.click(screen.getByRole('button', { name: /step one expansion/i }));
    expect(Number(expanded())).toBe(2);
    expect(Number(screen.getByTestId('stat-Generated').textContent)).toBeGreaterThan(2);
    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(expanded()).toBe('0');
  });

  it('comparison page runs all three algorithms and shows honest statuses', () => {
    mount();
    go('#/compare');
    fireEvent.click(screen.getByRole('button', { name: /run comparison/i }));
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(4); // header + BFS + DFS + A*
    expect(within(table).getByText('goal · optimal')).toBeTruthy();
  });
});

describe('storage key', () => {
  it('uses the documented key', () => {
    expect(STORAGE_KEY).toBe('studypilot.v1');
  });
});
