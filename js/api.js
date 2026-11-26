// Talks to Supabase (Postgres functions via the REST "rpc" endpoint).
// If config.js has no Supabase URL, it runs a demo backend in this browser instead.
import { CONFIG } from '../config.js?v=20261126160150';
import { todayISO, addDays, weekStart } from './dates.js?v=20261126160150';

export const DEMO = !CONFIG.SUPABASE_URL;
const BASE = () => CONFIG.SUPABASE_URL.replace(/\/$/, '');

// Where a stored photo can be loaded from
export function photoURL(path) {
  if (!path) return '';
  if (/^(data:|assets\/|blob:|https?:)/.test(path)) return path;
  return `${BASE()}/storage/v1/object/public/photos/${path}`;
}

async function rpc(fn, args) {
  const key = CONFIG.SUPABASE_KEY;
  const headers = { 'Content-Type': 'application/json', apikey: key };
  if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`; // legacy anon JWT keys
  const res = await fetch(`${BASE()}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers, body: JSON.stringify(args),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error((data && data.message) || res.statusText || 'Request failed');
    err.code = data && data.message;
    throw err;
  }
  return data;
}

// ---------------------------------------------------------------- real API
const real = {
  login: (phone) => rpc('fb_login', { p_phone: phone }),
  logout: (t) => rpc('fb_logout', { p_token: t }),
  me: (t) => rpc('fb_me', { p_token: t }),
  board: (t, from, to, everyone) => rpc('fb_board', { p_token: t, p_from: from, p_to: to, p_everyone: everyone }),
  saveGoal: (t, goal) => rpc('fb_save_goal', { p_token: t, p_goal: goal }),
  archiveGoal: (t, id) => rpc('fb_archive_goal', { p_token: t, p_goal_id: id }),
  saveLog: (t, goalId, date, done, amount, note) =>
    rpc('fb_save_log', { p_token: t, p_goal_id: goalId, p_date: date, p_done: done, p_amount: amount, p_note: note }),
  saveDayNote: (t, date, note) => rpc('fb_save_day_note', { p_token: t, p_date: date, p_note: note }),
  async uploadPhoto(t, blob) {
    const ticket = await rpc('fb_photo_ticket', { p_token: t });
    const path = `${ticket}/${uid()}.jpg`;
    const key = CONFIG.SUPABASE_KEY;
    const res = await fetch(`${BASE()}/storage/v1/object/photos/${path}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'false' },
      body: blob,
    });
    if (!res.ok) { const e = new Error('upload_failed'); e.code = 'upload_failed'; throw e; }
    return path;
  },
  addPhoto: (t, path, goalId, date, caption) =>
    rpc('fb_add_photo', { p_token: t, p_path: path, p_goal_id: goalId, p_date: date, p_caption: caption }),
  updatePhoto: (t, id, caption) => rpc('fb_update_photo', { p_token: t, p_photo_id: id, p_caption: caption }),
  deletePhoto: (t, id) => rpc('fb_delete_photo', { p_token: t, p_photo_id: id }),
  toggleLike: (t, id) => rpc('fb_toggle_like', { p_token: t, p_photo_id: id }),
  feed: (t, before, limit = 15) => rpc('fb_feed', { p_token: t, p_before: before, p_limit: limit }),
  photosBetween: (t, from, to, everyone = false) =>
    rpc('fb_photos_between', { p_token: t, p_from: from, p_to: to, p_everyone: everyone }),
};

// ---------------------------------------------------------------- demo API
const DKEY = 'fambam_demo_db_v2';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const norm = (p) => String(p || '').replace(/\D/g, '').slice(-10);

function seedDemo() {
  const names = ['Mark', 'Jaimi', 'Megan', 'Nate', 'Matthew', 'Riley', 'Julia', 'Staci', 'Carol'];
  const members = names.map((n, i) => ({ id: 'm' + i, name: n, sprite: n.toLowerCase(), phone: `55555501${String(i + 1).padStart(2, '0')}` }));
  const ws = weekStart(todayISO());
  const start = addDays(ws, -14);
  const goals = [], logs = [], day_notes = [];
  const add = (mi, g) => { const goal = { id: uid(), member_id: 'm' + mi, emoji: null, unit: null, days_of_week: [], kind: 'check', sort_order: goals.length, start_date: start, archived_at: null, ...g }; goals.push(goal); return goal; };
  const log = (g, d, extra) => { if (d <= todayISO()) logs.push({ goal_id: g.id, member_id: g.member_id, log_date: d, done: true, amount: null, note: null, updated_at: new Date().toISOString(), ...extra }); };
  const notes = ['Felt strong today 💪', 'Rainy, did it inside', 'Legs = jelly', 'With the dog!', 'Short but it counts', 'New PR!!', 'Tired but showed up'];
  let k = 0;
  const g1 = add(0, { title: 'Walk the neighborhood', emoji: '🚶', cadence: 'daily' });
  const g2 = add(1, { title: 'Workout', emoji: '🏋️', cadence: 'weekly', target: 4 });
  const g3 = add(1, { title: 'Run', emoji: '🏃', cadence: 'weekly', kind: 'amount', target: 15, unit: 'miles' });
  const g4 = add(3, { title: 'Yoga', emoji: '🧘', cadence: 'days', days_of_week: [1, 3, 5] });
  const g5 = add(4, { title: 'Pushups', emoji: '💥', cadence: 'daily', kind: 'amount', target: 50, unit: 'reps' });
  const g6 = add(5, { title: 'Bike rides', emoji: '🚴', cadence: 'monthly', target: 12 });
  const g7 = add(6, { title: 'Run', emoji: '🏃', cadence: 'daily' });
  const g8 = add(7, { title: 'Gym', emoji: '🏋️', cadence: 'weekly', target: 3 });
  const g9 = add(8, { title: 'Water', emoji: '💧', cadence: 'daily', kind: 'amount', target: 64, unit: 'oz' });
  for (let i = 0; i < 21; i++) {
    const d = addDays(start, i);
    const n = () => (Math.random() < 0.35 ? notes[k++ % notes.length] : null);
    if (i % 3 !== 2) log(g1, d, { note: n() });
    if (i % 2 === 0) log(g2, d, { note: n() });
    if (i % 3 === 0) log(g3, d, { amount: 3 + (i % 3), note: n() });
    if ([1, 3, 5].includes(new Date(d + 'T12:00').getDay())) log(g4, d);
    if (i % 4 !== 3) log(g5, d, { amount: 40 + (i % 3) * 10 });
    if (i % 2 === 1) log(g6, d, { note: n() });
    log(g7, d, { note: n() });
    if (i % 3 === 0) log(g8, d);
    if (i % 5 !== 4) log(g9, d, { amount: 64 });
  }
  day_notes.push({ member_id: 'm1', log_date: addDays(todayISO(), -1), note: 'Skipped the gym but did 3 miles with the pup 🐕', updated_at: new Date().toISOString() });
  const pic = (emoji, a, b) => 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><text x="200" y="250" font-size="160" text-anchor="middle">${emoji}</text></svg>`);
  const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  const photos = [
    { id: uid(), member_id: 'm6', goal_id: g7.id, log_date: todayISO(), path: pic('🏃', '#ffd38a', '#f29bb0'), caption: 'Sunrise 5k before work!', created_at: ago(2) },
    { id: uid(), member_id: 'm1', goal_id: g3.id, log_date: addDays(todayISO(), -1), path: pic('🐕', '#bfe3f2', '#8cc46b'), caption: 'Trail run with my running buddy', created_at: ago(20) },
    { id: uid(), member_id: 'm8', goal_id: g9.id, log_date: addDays(todayISO(), -1), path: pic('💧', '#cfeaf6', '#4a7fd1'), caption: 'Hydration station', created_at: ago(28) },
    { id: uid(), member_id: 'm4', goal_id: g5.id, log_date: addDays(todayISO(), -2), path: pic('💪', '#f4b63f', '#d6453d'), caption: '50 pushups, no breaks', created_at: ago(50) },
  ];
  const photo_likes = [
    { photo_id: photos[0].id, member_id: 'm0' }, { photo_id: photos[0].id, member_id: 'm7' },
    { photo_id: photos[1].id, member_id: 'm2' }, { photo_id: photos[1].id, member_id: 'm8' }, { photo_id: photos[1].id, member_id: 'm5' },
    { photo_id: photos[3].id, member_id: 'm1' },
  ];
  return { members, goals, logs, day_notes, photos, photo_likes, sessions: {} };
}

function db() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(DKEY)); } catch { /* ignore */ }
  if (!d) { d = seedDemo(); save(d); }
  return d;
}
function save(d) { try { localStorage.setItem(DKEY, JSON.stringify(d)); } catch { /* ignore */ } }
function who(d, t) {
  const id = d.sessions[t];
  if (!id) { const e = new Error('not_logged_in'); e.code = 'not_logged_in'; throw e; }
  return id;
}
const pub = (m) => ({ id: m.id, name: m.name, sprite: m.sprite });
const wait = (v) => new Promise((r) => setTimeout(() => r(v), 120));

const demo = {
  async login(phone) {
    const d = db();
    const m = d.members.find((x) => x.phone === norm(phone));
    if (!m) { const e = new Error('unknown_phone'); e.code = 'unknown_phone'; throw e; }
    const t = uid(); d.sessions[t] = m.id; save(d);
    return wait({ token: t, member: pub(m) });
  },
  async logout(t) { const d = db(); delete d.sessions[t]; save(d); },
  async me(t) { const d = db(); return wait(pub(d.members.find((m) => m.id === who(d, t)))); },
  async board(t, from, to, everyone) {
    const d = db(); const me = who(d, t);
    const mine = (x) => everyone || x.member_id === me;
    return wait({
      me,
      members: d.members.filter((m) => everyone || m.id === me).map(pub).sort((a, b) => a.name.localeCompare(b.name)),
      goals: d.goals.filter((g) => mine(g) && g.start_date <= to && (!g.archived_at || g.archived_at.slice(0, 10) >= from)),
      logs: d.logs.filter((l) => mine(l) && l.log_date >= from && l.log_date <= to),
      day_notes: d.day_notes.filter((n) => mine(n) && n.log_date >= from && n.log_date <= to),
    });
  },
  async saveGoal(t, goal) {
    const d = db(); const me = who(d, t);
    let g = goal.id && d.goals.find((x) => x.id === goal.id && x.member_id === me);
    if (g) Object.assign(g, goal);
    else { g = { ...goal, id: uid(), member_id: me, archived_at: null, sort_order: d.goals.length, start_date: goal.start_date || todayISO() }; d.goals.push(g); }
    save(d); return wait(g);
  },
  async archiveGoal(t, id) {
    const d = db(); const me = who(d, t);
    const g = d.goals.find((x) => x.id === id && x.member_id === me);
    if (g) {
      if (d.logs.some((l) => l.goal_id === id)) g.archived_at = new Date().toISOString();
      else d.goals = d.goals.filter((x) => x !== g);
    }
    save(d);
  },
  async saveLog(t, goalId, date, done, amount, note) {
    const d = db(); const me = who(d, t);
    d.logs = d.logs.filter((l) => !(l.goal_id === goalId && l.log_date === date));
    let l = null;
    if (done || amount != null || (note && note.trim())) {
      l = { goal_id: goalId, member_id: me, log_date: date, done: !!done, amount, note: note && note.trim() ? note.trim() : null, updated_at: new Date().toISOString() };
      d.logs.push(l);
    }
    save(d); return wait(l);
  },
  async saveDayNote(t, date, note) {
    const d = db(); const me = who(d, t);
    d.day_notes = d.day_notes.filter((n) => !(n.member_id === me && n.log_date === date));
    if (note && note.trim()) d.day_notes.push({ member_id: me, log_date: date, note: note.trim(), updated_at: new Date().toISOString() });
    save(d);
  },
};

function photoJSON(d, p, me) {
  const likes = d.photo_likes.filter((l) => l.photo_id === p.id);
  return { ...p, likes: likes.length, liked: likes.some((l) => l.member_id === me),
    likers: likes.map((l) => (d.members.find((m) => m.id === l.member_id) || {}).name) };
}
Object.assign(demo, {
  async uploadPhoto(t, blob) {
    const { blobToDataURL } = await import('./image.js?v=20261126160150');
    return blobToDataURL(blob);
  },
  async addPhoto(t, path, goalId, date, caption) {
    const d = db(); const me = who(d, t);
    const p = { id: uid(), member_id: me, goal_id: goalId, log_date: date, path, caption: caption && caption.trim() ? caption.trim() : null, created_at: new Date().toISOString() };
    d.photos.push(p);
    try { save(d); } catch { /* storage full */ }
    if (!localStorage.getItem(DKEY).includes(p.id)) { const e = new Error('demo_storage_full'); e.code = 'demo_storage_full'; throw e; }
    return wait(photoJSON(d, p, me));
  },
  async updatePhoto(t, id, caption) {
    const d = db(); const me = who(d, t); const p = d.photos.find((x) => x.id === id && x.member_id === me);
    if (p) p.caption = caption && caption.trim() ? caption.trim() : null; save(d);
  },
  async deletePhoto(t, id) {
    const d = db(); const me = who(d, t);
    d.photos = d.photos.filter((x) => !(x.id === id && x.member_id === me));
    d.photo_likes = d.photo_likes.filter((l) => d.photos.some((p) => p.id === l.photo_id)); save(d);
  },
  async toggleLike(t, id) {
    const d = db(); const me = who(d, t);
    const had = d.photo_likes.some((l) => l.photo_id === id && l.member_id === me);
    if (had) d.photo_likes = d.photo_likes.filter((l) => !(l.photo_id === id && l.member_id === me));
    else d.photo_likes.push({ photo_id: id, member_id: me });
    save(d); return wait(photoJSON(d, d.photos.find((p) => p.id === id), me));
  },
  async feed(t, before, limit = 15) {
    const d = db(); const me = who(d, t);
    const photos = d.photos.filter((p) => !before || p.created_at < before)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit).map((p) => photoJSON(d, p, me));
    return wait({ members: d.members.map(pub), photos, goals: d.goals.map((g) => ({ id: g.id, title: g.title, emoji: g.emoji })) });
  },
  async photosBetween(t, from, to, everyone = false) {
    const d = db(); const me = who(d, t);
    return wait(d.photos.filter((p) => (everyone || p.member_id === me) && p.log_date >= from && p.log_date <= to)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)).map((p) => photoJSON(d, p, me)));
  },
});

export const api = DEMO ? demo : real;
export const DEMO_PHONES = '555-555-0101 … 0109';
