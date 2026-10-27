// Date helpers. Dates are plain 'YYYY-MM-DD' strings; math is done in UTC to avoid DST bugs.
const pad = (n) => String(n).padStart(2, '0');

export function toISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function todayISO(now = new Date()) {
  return toISO(now);
}
function parts(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}
export function isValidISO(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const { y, m, d } = parts(iso);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
export function addDays(iso, n) {
  const { y, m, d } = parts(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
/** whole days from a to b (b - a) */
export function diffDays(a, b) {
  const pa = parts(a);
  const pb = parts(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}
/** 0 = Sunday ... 6 = Saturday */
export function weekdayOf(iso) {
  const { y, m, d } = parts(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatDate(iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  const { y, m, d } = parts(iso);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}
export function minutesToHHMM(min) {
  return `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
}
export function hhmmToMinutes(s) {
  const [h, m] = String(s).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
/** Monday-based week start for the given date. */
export function startOfWeek(iso) {
  const wd = weekdayOf(iso);
  return addDays(iso, -((wd + 6) % 7));
}
