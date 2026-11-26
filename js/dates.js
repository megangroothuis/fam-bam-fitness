// All dates are local calendar dates as 'YYYY-MM-DD' strings. Weeks run Mon–Sun.

const pad = (n) => String(n).padStart(2, '0');

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayISO = () => toISO(new Date());

export function addDays(iso, n) { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
export const dow = (iso) => fromISO(iso).getDay(); // 0 = Sun
export function weekStart(iso) { return addDays(iso, -((dow(iso) + 6) % 7)); }
export const weekEnd = (iso) => addDays(weekStart(iso), 6);
export const monthStart = (iso) => iso.slice(0, 8) + '01';
export function monthEnd(iso) { const d = fromISO(monthStart(iso)); d.setMonth(d.getMonth() + 1); d.setDate(0); return toISO(d); }
export const daysInMonth = (iso) => Number(monthEnd(iso).slice(8));

export function range(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
export const minISO = (a, b) => (a < b ? a : b);
export const maxISO = (a, b) => (a > b ? a : b);

export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon first

export function fmt(iso, opts) { return fromISO(iso).toLocaleDateString(undefined, opts); }
export const fmtLong = (iso) => fmt(iso, { weekday: 'long', month: 'short', day: 'numeric' });
export const fmtShort = (iso) => fmt(iso, { month: 'short', day: 'numeric' });
export const monthName = (iso) => fmt(iso, { month: 'short' });

export function relDay(iso) {
  const t = todayISO();
  if (iso === t) return 'Today';
  if (iso === addDays(t, -1)) return 'Yesterday';
  return fmt(iso, { weekday: 'short', month: 'short', day: 'numeric' });
}
