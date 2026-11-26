import { api, DEMO } from './api.js';
import { CONFIG } from '../config.js';
import { spriteHTML, playOnce, CAST } from './sprites.js';
import {
  todayISO, addDays, weekStart, weekEnd, monthStart, monthEnd, range, minISO, maxISO,
  fmtLong, fmtShort, relDay, DOW_LETTER, DOW_SHORT, WEEK_ORDER, dow, fromISO,
} from './dates.js';
import { progress, weekScore, dayState, isActiveOn, isScheduledOn, isHit, cadenceText } from './progress.js';

// ------------------------------------------------------------------ helpers
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SESSION_KEY = 'fambam_session';
const store = {
  get() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } },
  set(v) { try { v ? localStorage.setItem(SESSION_KEY, JSON.stringify(v)) : localStorage.removeItem(SESSION_KEY); } catch { /* private mode */ } },
};
const debouncers = new Map();
function debounce(key, fn, ms = 700) {
  clearTimeout(debouncers.get(key));
  debouncers.set(key, setTimeout(() => { debouncers.delete(key); fn(); }, ms));
}

const S = {
  token: null, me: null,
  date: todayISO(),           // day being logged on Today
  board: null, boardRange: null,
  famWeek: weekStart(todayISO()),
  fam: null,
};

const app = $('#app');

// ------------------------------------------------------------------ toast + confetti
let toastTimer;
function toast(msg, kind = '') {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.className = `toast show ${kind}`;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function confetti(fromEl) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = fromEl.getBoundingClientRect();
  const colors = ['#f4b63f', '#d6453d', '#5f9e4a', '#4a7fd1', '#f29bb0', '#26365f'];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('span');
    p.className = 'confetti';
    p.style.left = `${r.left + r.width / 2}px`;
    p.style.top = `${r.top + r.height / 2}px`;
    p.style.background = colors[i % colors.length];
    const a = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
    const d = 40 + Math.random() * 50;
    p.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    p.style.setProperty('--dy', `${Math.sin(a) * d - 30}px`);
    document.body.append(p);
    setTimeout(() => p.remove(), 900);
  }
}

function handleError(e) {
  console.error(e);
  if (e && e.code === 'not_logged_in') { logout(true); return; }
  toast("Hmm, that didn't save. Check your connection and try again.", 'bad');
}

// ------------------------------------------------------------------ icons (pixel-y svgs)
const ICON = {
  today: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h12v12H2z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 8h2v2h2V8h2V6h2v2h-2v2H8v2H6v-2H4z" fill="currentColor"/></svg>',
  goals: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1h2v14H3zM5 2h8v2h-2v2h2v2H5z" fill="currentColor"/></svg>',
  fam: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2h4v4H3zM9 2h4v4H9zM2 8h6v6H2zM8 8h6v6H8z" fill="currentColor"/></svg>',
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h2v2h2v2h2v-2h2V8h2V6h2V4h-2v2h-2v2H8v2H6V8H4V6H2z" fill="currentColor"/></svg>',
  left: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 3h2v2H9v2H7v2h2v2h2v2H9v-2H7V9H5V7h2V5h2z" fill="currentColor"/></svg>',
  right: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3h2v2h2v2h2v2H9v2H7v2H5v-2h2V9h2V7H7V5H5z" fill="currentColor"/></svg>',
  star: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7 1h2v4h4v2h-2v2h1v4h-2v-1H8v-1H8v1H6v1H4V9h1V7H3V5h4z" fill="currentColor"/></svg>',
};

// ------------------------------------------------------------------ login
function renderLogin(msg = '') {
  const cast = Object.keys(CAST);
  const parade = [...cast, ...cast].map((k, i) => `<div class="parade-guy">${spriteHTML(k, i % 3 === 0 ? 'wave' : 'idle', 2)}</div>`).join('');
  app.innerHTML = `
  <main class="login">
    <div class="logo">
      <span class="logo-top">FAM BAM</span>
      <span class="logo-sub">Fitness Challenge</span>
    </div>
    <div class="parade" aria-hidden="true"><div class="parade-track">${parade}</div><div class="ground"></div></div>
    <form class="card login-card" id="login-form" novalidate>
      <label for="phone">Your phone number</label>
      <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(555) 555-0123" required>
      <button class="btn primary big" type="submit">Let's go!</button>
      <p class="err" id="login-err" role="alert">${esc(msg)}</p>
      ${DEMO ? `<p class="hint">Demo mode: try <b>555-555-0103</b> (any number from 555-555-0101 to 0109). Hook up Supabase in <code>config.js</code> to go live.</p>` : ''}
    </form>
  </main>`;
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = $('#phone').value;
    const btn = e.target.querySelector('button');
    if (phone.replace(/\D/g, '').length < 10) { $('#login-err').textContent = 'Enter your full 10-digit number.'; return; }
    btn.disabled = true; btn.textContent = 'Checking…';
    try {
      const r = await api.login(phone);
      S.token = r.token; S.me = r.member;
      store.set({ token: r.token, member: r.member });
      location.hash = '#/today';
      route();
    } catch (err) {
      btn.disabled = false; btn.textContent = "Let's go!";
      $('#login-err').textContent = err.code === 'unknown_phone'
        ? "That number isn't on the Fam Bam list yet. Ask whoever set this up to add you!"
        : "Couldn't connect. Check your signal and try again.";
    }
  });
}

async function logout(expired = false) {
  if (S.token && !expired) api.logout(S.token).catch(() => {});
  S.token = null; S.me = null; S.board = null; S.fam = null;
  store.set(null);
  renderLogin(expired ? 'You got logged out. Pop your number back in.' : '');
}

// ------------------------------------------------------------------ shell
function shell(view) {
  if (!$('#shell')) {
    app.innerHTML = `
    <div id="shell">
      <header class="topbar">
        <a href="#/today" class="mini-logo">FAM BAM</a>
        ${DEMO ? '<span class="demo-pill">demo</span>' : ''}
        <button class="me-btn" id="me-btn" aria-label="Your character">${spriteHTML(S.me.sprite, 'idle', 1, 'me-mini')}</button>
      </header>
      <main id="view" tabindex="-1"></main>
      <nav class="tabs" aria-label="Sections">
        <a href="#/today" data-tab="today">${ICON.today}<span>Today</span></a>
        <a href="#/goals" data-tab="goals">${ICON.goals}<span>Goals</span></a>
        <a href="#/fam" data-tab="fam">${ICON.fam}<span>Fam</span></a>
      </nav>
    </div>`;
    $('#me-btn').addEventListener('click', () => {
      playOnce($('#me-btn .spr'), 'sig');
      const hero = $('.hero .spr'); if (hero) playOnce(hero, 'sig');
    });
  }
  $$('.tabs a').forEach((a) => a.setAttribute('aria-current', a.dataset.tab === view ? 'page' : 'false'));
}
function refreshMeSprite() {
  const b = $('#me-btn'); if (b) b.innerHTML = spriteHTML(S.me.sprite, 'idle', 1, 'me-mini');
}

// ------------------------------------------------------------------ data loading
async function loadMine(force = false) {
  const from = minISO(weekStart(S.date), monthStart(S.date));
  const to = maxISO(weekEnd(S.date), monthEnd(S.date));
  if (!force && S.board && S.boardRange && S.boardRange[0] <= from && S.boardRange[1] >= to) return;
  S.board = await api.board(S.token, from, to, false);
  S.boardRange = [from, to];
}

function logFor(goalId, date) {
  return S.board.logs.find((l) => l.goal_id === goalId && l.log_date === date);
}
function setLocalLog(goal, date, patch) {
  const logs = S.board.logs;
  const i = logs.findIndex((l) => l.goal_id === goal.id && l.log_date === date);
  const cur = i >= 0 ? logs[i] : { goal_id: goal.id, member_id: S.me.id, log_date: date, done: false, amount: null, note: null };
  const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
  const empty = !next.done && next.amount == null && !(next.note && next.note.trim());
  if (i >= 0) { if (empty) logs.splice(i, 1); else logs[i] = next; } else if (!empty) logs.push(next);
  return next;
}
async function persistLog(goal, date) {
  const l = logFor(goal.id, date) || { done: false, amount: null, note: null };
  try {
    await api.saveLog(S.token, goal.id, date, !!l.done, l.amount == null ? null : Number(l.amount), l.note || null);
    flashSaved();
  } catch (e) { handleError(e); }
}
function flashSaved() {
  const s = $('#save-state'); if (!s) return;
  s.textContent = 'Saved ✓'; s.classList.add('on');
  clearTimeout(s._t); s._t = setTimeout(() => s.classList.remove('on'), 1400);
}

// ------------------------------------------------------------------ TODAY
function todayGoals() {
  return S.board.goals.filter((g) => isActiveOn(g, S.date)).sort((a, b) => a.sort_order - b.sort_order);
}

function heroSummary(goals) {
  if (!goals.length) return 'No goals yet. Set a couple and start checking them off.';
  const due = goals.filter((g) => isScheduledOn(g, S.date));
  const hits = goals.filter((g) => isHit(g, logFor(g.id, S.date)));
  const dueHit = due.filter((g) => isHit(g, logFor(g.id, S.date)));
  const when = S.date === todayISO() ? 'today' : 'that day';
  if (due.length && dueHit.length === due.length) return `Every goal due ${when} is done. Look at you go! ✨`;
  if (due.length) return `${dueHit.length} of ${due.length} daily goal${due.length === 1 ? '' : 's'} done ${when}.`;
  if (hits.length) return `${hits.length} thing${hits.length === 1 ? '' : 's'} checked off ${when}. Nice.`;
  return `Did something ${when}? Check it off below.`;
}

function weekStripHTML() {
  const ws = weekStart(S.date);
  const t = todayISO();
  const goals = S.board.goals;
  const chips = range(ws, addDays(ws, 6)).map((d) => {
    const st = dayState(goals, S.board.logs, d);
    const future = d > t;
    return `<button class="day ${d === S.date ? 'sel' : ''} ${d === t ? 'is-today' : ''} st${st}" data-date="${d}" ${future ? 'disabled' : ''}
      aria-label="${fmtLong(d)}${st === 2 ? ', all done' : st === 1 ? ', some done' : ''}" aria-pressed="${d === S.date}">
      <span class="day-l">${DOW_LETTER[dow(d)]}</span><span class="day-n">${fromISO(d).getDate()}</span><span class="day-dot">${st === 2 ? ICON.star : ''}</span>
    </button>`;
  }).join('');
  const canNext = ws < weekStart(t);
  return `<div class="week">
    <button class="icon-btn" data-week="-1" aria-label="Previous week">${ICON.left}</button>
    <div class="days">${chips}</div>
    <button class="icon-btn" data-week="1" aria-label="Next week" ${canNext ? '' : 'disabled'}>${ICON.right}</button>
  </div>`;
}

function goalCardHTML(g) {
  const l = logFor(g.id, S.date);
  const p = progress(g, S.board.logs, S.date);
  const hit = isHit(g, l);
  const scheduled = g.cadence === 'weekly' || g.cadence === 'monthly' || isScheduledOn(g, S.date);
  const control = g.kind === 'amount'
    ? `<label class="amount ${hit ? 'on' : ''}">
        <input type="number" inputmode="decimal" min="0" step="any" value="${l && l.amount != null ? esc(l.amount) : ''}" placeholder="0" data-act="amount" aria-label="${esc(g.title)} amount${g.unit ? ' in ' + esc(g.unit) : ''}">
        <span>${esc(g.unit || '')}</span>
      </label>`
    : `<button class="check" data-act="toggle" aria-pressed="${hit}" aria-label="${esc(g.title)}: ${hit ? 'done' : 'not done'}">${ICON.check}</button>`;
  return `<article class="card goal ${hit ? 'is-done' : ''} ${scheduled ? '' : 'off-day'}" data-goal="${g.id}">
    <div class="goal-row">
      ${control}
      <div class="goal-main">
        <h3>${g.emoji ? `<span class="emo">${esc(g.emoji)}</span>` : ''}${esc(g.title)}</h3>
        <p class="goal-meta">${esc(cadenceText(g))}${scheduled ? '' : ' · <em>bonus day</em>'}</p>
        <div class="bar ${p.complete ? 'full' : ''}"><span style="width:${Math.round(p.ratio * 100)}%"></span></div>
        <p class="goal-prog">${esc(p.text)}${p.complete ? ' · <b>goal hit!</b>' : ''}</p>
      </div>
    </div>
    <textarea class="note" rows="1" maxlength="500" placeholder="Add a note…" data-act="note" aria-label="Note for ${esc(g.title)}">${esc(l && l.note)}</textarea>
  </article>`;
}

async function viewToday() {
  shell('today');
  const v = $('#view');
  if (!S.board) v.innerHTML = '<div class="loading">Loading…</div>';
  try { await loadMine(); } catch (e) { handleError(e); return; }
  const goals = todayGoals();
  const dn = S.board.day_notes.find((n) => n.log_date === S.date);
  const first = (S.me.name || '').split(' ')[0];
  v.innerHTML = `
    <section class="hero">
      <div class="hero-sky"></div>
      <div class="hero-spr">${spriteHTML(S.me.sprite, 'idle', 3)}</div>
      <div class="hero-text">
        <p class="eyebrow">${esc(relDay(S.date))}</p>
        <h1>Hey ${esc(first)}!</h1>
        <p class="hero-sum" id="hero-sum">${esc(heroSummary(goals))}</p>
      </div>
    </section>
    <div id="week-wrap">${weekStripHTML()}</div>
    <div class="section-head"><h2>${esc(fmtLong(S.date))}</h2><span id="save-state" class="save-state" aria-live="polite"></span></div>
    ${goals.length ? `<div class="goals">${goals.map(goalCardHTML).join('')}</div>` : `
      <div class="card empty">
        <p>You don't have any goals yet.</p>
        <a class="btn primary" href="#/goals">Set my goals</a>
      </div>`}
    <section class="card daynote">
      <label for="daynote"><span class="label">How'd the day go?</span></label>
      <textarea id="daynote" rows="2" maxlength="1000" placeholder="Anything the fam should know: rest day, new PR, sore legs…" data-act="daynote">${esc(dn && dn.note)}</textarea>
    </section>`;
  $$('textarea', v).forEach(autoGrow);
}

function autoGrow(t) { t.style.height = 'auto'; t.style.height = `${t.scrollHeight + 2}px`; }

function refreshTodayBits(goalId) {
  const g = S.board.goals.find((x) => x.id === goalId);
  const card = $(`.goal[data-goal="${goalId}"]`);
  if (g && card) {
    const p = progress(g, S.board.logs, S.date);
    const hit = isHit(g, logFor(g.id, S.date));
    card.classList.toggle('is-done', hit);
    $('.bar', card).classList.toggle('full', p.complete);
    $('.bar span', card).style.width = `${Math.round(p.ratio * 100)}%`;
    $('.goal-prog', card).innerHTML = `${esc(p.text)}${p.complete ? ' · <b>goal hit!</b>' : ''}`;
    const amt = $('.amount', card); if (amt) amt.classList.toggle('on', hit);
    const chk = $('.check', card);
    if (chk) { chk.setAttribute('aria-pressed', hit); chk.setAttribute('aria-label', `${g.title}: ${hit ? 'done' : 'not done'}`); }
  }
  $('#week-wrap').innerHTML = weekStripHTML();
  $('#hero-sum').textContent = heroSummary(todayGoals());
}

function celebrate(card, goal) {
  confetti($('.check, .amount', card) || card);
  playOnce($('.hero .spr'), 'sig');
  playOnce($('#me-btn .spr'), 'sig');
  const p = progress(goal, S.board.logs, S.date);
  const due = todayGoals().filter((g) => isScheduledOn(g, S.date));
  const allDue = due.length && due.every((g) => isHit(g, logFor(g.id, S.date)));
  if (allDue && isScheduledOn(goal, S.date)) toast('All daily goals done! 🎉', 'good');
  else if (p.complete) toast(`${goal.title}: goal hit for the ${goal.cadence === 'monthly' ? 'month' : 'week'}! 🏆`, 'good');
}

function onTodayClick(e) {
  const day = e.target.closest('[data-date]');
  if (day) { S.date = day.dataset.date; viewToday(); return; }
  const wk = e.target.closest('[data-week]');
  if (wk) {
    const n = Number(wk.dataset.week);
    let d = addDays(S.date, n * 7);
    if (d > todayISO()) d = todayISO();
    S.date = d; viewToday(); return;
  }
  const tog = e.target.closest('[data-act="toggle"]');
  if (tog) {
    const card = tog.closest('.goal');
    const g = S.board.goals.find((x) => x.id === card.dataset.goal);
    const was = isHit(g, logFor(g.id, S.date));
    setLocalLog(g, S.date, { done: !was, note: $('.note', card).value });
    refreshTodayBits(g.id);
    if (!was) celebrate(card, g);
    persistLog(g, S.date);
  }
}

function onTodayInput(e) {
  const t = e.target;
  if (t.tagName === 'TEXTAREA') autoGrow(t);
  const card = t.closest('.goal');
  if (t.dataset.act === 'note' && card) {
    const g = S.board.goals.find((x) => x.id === card.dataset.goal);
    setLocalLog(g, S.date, { note: t.value });
    const date = S.date;
    debounce(`note:${g.id}`, () => persistLog(g, date));
  } else if (t.dataset.act === 'amount' && card) {
    const g = S.board.goals.find((x) => x.id === card.dataset.goal);
    const was = isHit(g, logFor(g.id, S.date));
    const val = t.value === '' ? null : Math.max(0, Number(t.value));
    const next = setLocalLog(g, S.date, { amount: val, done: false });
    next.done = isHit(g, next);
    refreshTodayBits(g.id);
    if (!was && next.done) {
      clearTimeout(card._celebrate);
      card._celebrate = setTimeout(() => celebrate(card, g), 500);
    }
    const date = S.date;
    debounce(`amt:${g.id}`, () => persistLog(g, date), 600);
  } else if (t.dataset.act === 'daynote') {
    const date = S.date;
    const val = t.value;
    const list = S.board.day_notes.filter((n) => n.log_date !== date);
    if (val.trim()) list.push({ member_id: S.me.id, log_date: date, note: val, updated_at: new Date().toISOString() });
    S.board.day_notes = list;
    debounce(`day:${date}`, () => api.saveDayNote(S.token, date, val).then(flashSaved, handleError));
  }
}

// ------------------------------------------------------------------ GOALS
const TEMPLATES = [
  { title: 'Workout', emoji: '🏋️', cadence: 'weekly', kind: 'check', target: 4 },
  { title: 'Run', emoji: '🏃', cadence: 'daily', kind: 'check', target: 1 },
  { title: 'Steps', emoji: '👟', cadence: 'daily', kind: 'amount', target: 10000, unit: 'steps' },
  { title: 'Yoga', emoji: '🧘', cadence: 'days', kind: 'check', target: 1, days_of_week: [1, 3, 5] },
  { title: 'Run', emoji: '🏃', cadence: 'weekly', kind: 'amount', target: 20, unit: 'miles' },
  { title: 'Water', emoji: '💧', cadence: 'daily', kind: 'amount', target: 64, unit: 'oz' },
  { title: 'Bike rides', emoji: '🚴', cadence: 'monthly', kind: 'check', target: 10 },
  { title: 'Stretch', emoji: '🤸', cadence: 'daily', kind: 'amount', target: 10, unit: 'min' },
];
const EMOJIS = ['🏃', '🏋️', '🚶', '🧘', '🚴', '🏊', '👟', '💪', '🤸', '⛹️', '🥾', '💧', '🥗', '😴', '🧠', '⭐'];

async function viewGoals() {
  shell('goals');
  const v = $('#view');
  if (!S.board) v.innerHTML = '<div class="loading">Loading…</div>';
  try { await loadMine(); } catch (e) { handleError(e); return; }
  const goals = S.board.goals.filter((g) => !g.archived_at).sort((a, b) => a.sort_order - b.sort_order);
  v.innerHTML = `
    <div class="page-head">
      <h1>My goals</h1>
      <p>Mix and match: every day, certain days, a number of times a week or month. Check it off, or track a number like miles or minutes.</p>
    </div>
    <div class="goal-list">
      ${goals.length ? goals.map((g) => `
        <article class="card goal-item">
          <div class="gi-main">
            <h3>${g.emoji ? `<span class="emo">${esc(g.emoji)}</span>` : ''}${esc(g.title)}</h3>
            <p class="goal-meta">${esc(cadenceText(g))}${g.kind === 'amount' ? ' · track a number' : ' · check it off'}</p>
          </div>
          <div class="gi-actions">
            <button class="btn small" data-edit="${g.id}">Edit</button>
            <button class="btn small ghost" data-remove="${g.id}" aria-label="Remove ${esc(g.title)}">Remove</button>
          </div>
        </article>`).join('') : '<p class="muted center">No goals yet. Add one or grab an idea below.</p>'}
    </div>
    <button class="btn primary big wide" data-new>+ Add a goal</button>
    <h2 class="sub">Quick ideas</h2>
    <div class="ideas">
      ${TEMPLATES.map((t, i) => `<button class="chip" data-tpl="${i}">${t.emoji} ${esc(t.title)} · ${esc(cadenceText(t))}</button>`).join('')}
    </div>
    <h2 class="sub">Your character</h2>
    <div class="cast-pick" role="radiogroup" aria-label="Pick your character">
      ${Object.entries(CAST).map(([k, c]) => `
        <button class="cast-opt ${S.me.sprite === k ? 'sel' : ''}" role="radio" aria-checked="${S.me.sprite === k}" data-sprite="${k}">
          ${spriteHTML(k, S.me.sprite === k ? 'wave' : 'idle', 1)}<span>${c.name}</span>
        </button>`).join('')}
    </div>
    <div class="account">
      <p class="muted">Logged in as <b>${esc(S.me.name)}</b></p>
      <button class="btn small ghost" data-logout>Log out</button>
    </div>`;
}

async function onGoalsClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.edit) openGoalEditor(S.board.goals.find((g) => g.id === b.dataset.edit));
  else if (b.hasAttribute('data-new')) openGoalEditor(null);
  else if (b.dataset.tpl) openGoalEditor({ ...TEMPLATES[Number(b.dataset.tpl)] }, true);
  else if (b.dataset.remove) {
    const g = S.board.goals.find((x) => x.id === b.dataset.remove);
    if (!confirm(`Remove "${g.title}"? Your past check-ins stay in the history.`)) return;
    try { await api.archiveGoal(S.token, g.id); await loadMine(true); viewGoals(); toast('Goal removed'); } catch (err) { handleError(err); }
  } else if (b.dataset.sprite) {
    const k = b.dataset.sprite;
    S.me = { ...S.me, sprite: k };
    store.set({ token: S.token, member: S.me });
    $$('.cast-opt').forEach((o) => { const on = o.dataset.sprite === k; o.classList.toggle('sel', on); o.setAttribute('aria-checked', on); o.querySelector('.spr').dataset.anim = on ? 'wave' : 'idle'; });
    refreshMeSprite();
    playOnce($('#me-btn .spr'), 'sig');
    try { await api.setSprite(S.token, k); } catch (err) { handleError(err); }
  } else if (b.hasAttribute('data-logout')) logout();
}

function openGoalEditor(goal, isTemplate = false) {
  const g = { title: '', emoji: '', cadence: 'weekly', kind: 'check', target: 3, unit: '', days_of_week: [1, 3, 5], ...(goal || {}) };
  if (!g.days_of_week || !g.days_of_week.length) g.days_of_week = [1, 3, 5];
  const editing = goal && goal.id && !isTemplate;
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  dlg.innerHTML = `
    <form method="dialog" class="goal-form" novalidate>
      <div class="sheet-head"><h2>${editing ? 'Edit goal' : 'New goal'}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></div>

      <label class="field"><span class="label">What's the goal?</span>
        <input name="title" maxlength="60" required placeholder="Run, Workout, Yoga…" value="${esc(g.title)}"></label>

      <div class="field"><span class="label">Pick an icon</span>
        <div class="emoji-row">${['', ...EMOJIS].map((em) => `<button type="button" class="emoji-opt ${em === (g.emoji || '') ? 'sel' : ''}" data-emoji="${em}" aria-label="${em || 'No icon'}">${em || '–'}</button>`).join('')}</div>
      </div>

      <div class="field"><span class="label">How often?</span>
        <div class="seg" data-name="cadence">
          ${[['daily', 'Every day'], ['days', 'Certain days'], ['weekly', 'Per week'], ['monthly', 'Per month']].map(([v, l]) => `<button type="button" data-val="${v}" class="${g.cadence === v ? 'sel' : ''}">${l}</button>`).join('')}
        </div>
      </div>

      <div class="field" data-show="days"><span class="label">Which days?</span>
        <div class="dow-row">${WEEK_ORDER.map((d) => `<button type="button" data-dow="${d}" class="${g.days_of_week.includes(d) ? 'sel' : ''}" aria-label="${DOW_SHORT[d]}">${DOW_SHORT[d].slice(0, 2)}</button>`).join('')}</div>
      </div>

      <div class="field"><span class="label">How do you want to track it?</span>
        <div class="seg" data-name="kind">
          <button type="button" data-val="check" class="${g.kind === 'check' ? 'sel' : ''}">Check it off</button>
          <button type="button" data-val="amount" class="${g.kind === 'amount' ? 'sel' : ''}">Track a number</button>
        </div>
      </div>

      <div class="field row2">
        <label data-show-target><span class="label" id="target-label">Times per week</span>
          <input name="target" type="number" inputmode="decimal" min="0.1" step="any" value="${esc(g.target)}"></label>
        <label data-show="amount"><span class="label">Unit</span>
          <input name="unit" maxlength="16" placeholder="miles, min, reps…" value="${esc(g.unit || '')}"></label>
      </div>

      <p class="preview" id="goal-preview"></p>
      <p class="err" id="goal-err" role="alert"></p>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-close>Cancel</button>
        <button type="submit" class="btn primary">${editing ? 'Save' : 'Add goal'}</button>
      </div>
    </form>`;
  document.body.append(dlg);
  const f = $('form', dlg);
  const read = () => ({
    ...g,
    title: f.elements['title'].value.trim(),
    target: Number(f.elements['target'].value),
    unit: f.elements['unit'].value.trim(),
  });
  const sync = () => {
    const cur = read();
    $$('[data-show="days"]', dlg).forEach((el) => { el.hidden = g.cadence !== 'days'; });
    $$('[data-show="amount"]', dlg).forEach((el) => { el.hidden = g.kind !== 'amount'; });
    const needsTarget = g.kind === 'amount' || g.cadence === 'weekly' || g.cadence === 'monthly';
    $('[data-show-target]', dlg).hidden = !needsTarget;
        $('#target-label', dlg).textContent = g.kind === 'amount'
      ? { daily: 'Amount per day', days: 'Amount each day', weekly: 'Weekly total', monthly: 'Monthly total' }[g.cadence]
      : { weekly: 'Times per week', monthly: 'Times per month' }[g.cadence] || 'Times';
    const sentence = `${cur.title || 'Your goal'}: ${cadenceText({ ...cur, target: needsTarget ? cur.target || 0 : 1 })}`;
    $('#goal-preview', dlg).textContent = sentence;
  };
  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-close')) { dlg.close(); return; }
    if (b.dataset.emoji !== undefined) { g.emoji = b.dataset.emoji; $$('.emoji-opt', dlg).forEach((o) => o.classList.toggle('sel', o === b)); }
    const seg = b.closest('.seg');
    if (seg && b.dataset.val) {
      g[seg.dataset.name] = b.dataset.val;
      $$('button', seg).forEach((o) => o.classList.toggle('sel', o === b));
      if (seg.dataset.name === 'cadence' && g.kind === 'check' && (b.dataset.val === 'daily' || b.dataset.val === 'days')) f.elements['target'].value = 1;
    }
    if (b.dataset.dow) {
      const d = Number(b.dataset.dow);
      g.days_of_week = g.days_of_week.includes(d) ? g.days_of_week.filter((x) => x !== d) : [...g.days_of_week, d];
      b.classList.toggle('sel');
    }
    sync();
  });
  f.addEventListener('input', sync);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cur = read();
    const needsTarget = cur.kind === 'amount' || cur.cadence === 'weekly' || cur.cadence === 'monthly';
    if (!needsTarget) cur.target = 1;
    const err = !cur.title ? 'Give it a name.'
      : !(cur.target > 0) ? 'The number needs to be more than 0.'
      : cur.cadence === 'days' && !cur.days_of_week.length ? 'Pick at least one day.'
      : '';
    if (err) { $('#goal-err', dlg).textContent = err; return; }
    const payload = {
      id: editing ? cur.id : null, title: cur.title, emoji: cur.emoji || null, cadence: cur.cadence, kind: cur.kind,
      target: cur.target, unit: cur.kind === 'amount' ? cur.unit || null : null,
      days_of_week: cur.cadence === 'days' ? [...cur.days_of_week].sort() : [],
      start_date: editing ? cur.start_date : weekStart(todayISO()),
    };
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try {
      await api.saveGoal(S.token, payload);
      await loadMine(true);
      dlg.close();
      toast(editing ? 'Goal updated' : 'Goal added! Go get it 💪', 'good');
      playOnce($('#me-btn .spr'), 'sig');
      viewGoals();
    } catch (er) { btn.disabled = false; handleError(er); }
  });
  dlg.addEventListener('close', () => dlg.remove());
  sync();
  dlg.showModal();
  if (!editing && !isTemplate) f.elements['title'].focus();
}

// ------------------------------------------------------------------ FAM
async function viewFam() {
  shell('fam');
  const v = $('#view');
  const ws = S.famWeek, we = addDays(ws, 6);
  const t = todayISO();
  const ref = minISO(t, we);
  if (!S.fam || S.fam.ws !== ws) v.innerHTML = '<div class="loading">Loading the fam…</div>';
  let data;
  try {
    data = await api.board(S.token, minISO(ws, monthStart(ref)), we, true);
    S.fam = { ws, data };
  } catch (e) { handleError(e); return; }

  const rows = data.members.map((m) => {
    const goals = data.goals.filter((g) => g.member_id === m.id);
    const logs = data.logs.filter((l) => l.member_id === m.id);
    const ws_ = weekScore(goals, logs, ref);
    const notes = [
      ...logs.filter((l) => l.note && l.log_date >= ws && l.log_date <= we).map((l) => ({ ...l, goal: goals.find((g) => g.id === l.goal_id) })),
      ...data.day_notes.filter((n) => n.member_id === m.id && n.log_date >= ws && n.log_date <= we),
    ].sort((a, b) => (b.log_date + b.updated_at).localeCompare(a.log_date + a.updated_at));
    const loggedToday = logs.some((l) => l.log_date === t && (l.done || l.amount != null));
    return { m, goals, logs, ...ws_, notes, loggedToday };
  }).sort((a, b) => b.score - a.score || b.onTrack - a.onTrack || a.m.name.localeCompare(b.m.name));

  const isThisWeek = ws === weekStart(t);
  const pct = (x) => `${Math.round(x * 100)}%`;
  const feed = rows.flatMap((r) => r.notes.map((n) => ({ ...n, m: r.m })))
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 40);

  v.innerHTML = `
    <div class="page-head">
      <h1>The Fam</h1>
      <div class="week-nav">
        <button class="icon-btn" data-fweek="-1" aria-label="Previous week">${ICON.left}</button>
        <span>${isThisWeek ? 'This week' : 'Week of'} · ${esc(fmtShort(ws))} – ${esc(fmtShort(we))}</span>
        <button class="icon-btn" data-fweek="1" aria-label="Next week" ${isThisWeek ? 'disabled' : ''}>${ICON.right}</button>
      </div>
    </div>
    <section class="stage" aria-label="Everyone this week">
      <div class="stage-track">
        ${rows.map((r) => `
          <button class="stage-guy ${r.m.id === S.me.id ? 'me' : ''}" data-cheer="${r.m.id}" aria-label="${esc(r.m.name)}, ${pct(r.score)}">
            <span class="badge ${r.score >= 1 ? 'gold' : ''}">${r.total ? pct(r.score) : '–'}</span>
            ${spriteHTML(r.m.sprite, r.total && r.score >= 1 ? 'sig' : r.loggedToday && isThisWeek ? 'wave' : 'idle', 2)}
            <span class="name">${esc(r.m.name)}</span>
          </button>`).join('')}
      </div>
      <div class="ground"></div>
    </section>
    <p class="muted small center">Gold badge = every goal on track. Tap someone to cheer them on.</p>

    <div class="board">
      ${rows.map((r, i) => `
        <article class="card fam-card ${r.m.id === S.me.id ? 'me' : ''}">
          <header class="fam-head">
            <span class="rank">${r.total ? i + 1 : '·'}</span>
            ${spriteHTML(r.m.sprite, 'idle', 1)}
            <div class="fam-name">
              <h3>${esc(r.m.name)}${r.m.id === S.me.id ? ' <small>(you)</small>' : ''}</h3>
              <p class="muted">${r.total ? `${r.onTrack} of ${r.total} goal${r.total === 1 ? '' : 's'} on track` : 'No goals set yet'}</p>
            </div>
            <span class="score ${r.score >= 1 ? 'gold' : ''}">${r.total ? pct(r.score) : ''}</span>
          </header>
          <div class="mini-week" aria-label="Days this week">
            ${range(ws, we).map((d) => { const st = d > t ? -1 : dayState(r.goals, r.logs, d); return `<span class="md st${st}" title="${esc(fmtLong(d))}">${DOW_LETTER[dow(d)]}</span>`; }).join('')}
          </div>
          ${r.goals.length ? `<ul class="fam-goals">
            ${r.goals.map((g) => { const p = progress(g, r.logs, ref); return `<li>
              <div class="fg-top"><span>${g.emoji ? esc(g.emoji) + ' ' : ''}${esc(g.title)}</span><span class="muted">${esc(p.text)}</span></div>
              <div class="bar slim ${p.complete ? 'full' : ''}"><span style="width:${Math.round(p.ratio * 100)}%"></span></div>
            </li>`; }).join('')}
          </ul>` : ''}
          ${r.notes.length ? `<details class="fam-notes"><summary>${r.notes.length} note${r.notes.length === 1 ? '' : 's'} this week</summary>
            <ul>${r.notes.map((n) => `<li><span class="muted">${esc(relDay(n.log_date))}${n.goal ? ' · ' + esc(n.goal.title) : ''}</span>${esc(n.note)}</li>`).join('')}</ul>
          </details>` : ''}
        </article>`).join('')}
    </div>

    <h2 class="sub">Fam feed</h2>
    <div class="feed">
      ${feed.length ? feed.map((n) => {
        const g = n.goal_id ? data.goals.find((x) => x.id === n.goal_id) : null;
        return `<div class="feed-item">${spriteHTML(n.m.sprite, 'idle', 1)}
          <div><p class="feed-meta"><b>${esc(n.m.name)}</b> · ${esc(relDay(n.log_date))}${g ? ` · ${g.emoji ? esc(g.emoji) + ' ' : ''}${esc(g.title)}` : ''}</p><p class="feed-note">${esc(n.note)}</p></div>
        </div>`;
      }).join('') : '<p class="muted center">No notes yet this week. Be the first!</p>'}
    </div>`;
}

function onFamClick(e) {
  const w = e.target.closest('[data-fweek]');
  if (w) {
    const next = addDays(S.famWeek, Number(w.dataset.fweek) * 7);
    if (next <= weekStart(todayISO())) { S.famWeek = next; viewFam(); }
    return;
  }
  const c = e.target.closest('[data-cheer]');
  if (c) {
    const spr = $('.spr', c);
    playOnce(spr, 'sig', 2000);
    confetti(spr);
  }
}

// ------------------------------------------------------------------ router
function route() {
  if (!S.token) { renderLogin(); return; }
  const r = (location.hash.replace('#/', '') || 'today').split('?')[0];
  closeDialogs();
  if (r === 'goals') viewGoals();
  else if (r === 'fam') viewFam();
  else viewToday();
  const view = $('#view'); if (view) view.scrollTop = 0;
  window.scrollTo(0, 0);
}
function closeDialogs() { $$('dialog[open]').forEach((d) => d.close()); }

app.addEventListener('click', (e) => {
  const r = (location.hash.replace('#/', '') || 'today');
  if (!$('#view') || !$('#view').contains(e.target)) return;
  if (r === 'goals') onGoalsClick(e);
  else if (r === 'fam') onFamClick(e);
  else onTodayClick(e);
});
app.addEventListener('input', (e) => {
  const r = (location.hash.replace('#/', '') || 'today');
  if (r === 'today' && $('#view') && $('#view').contains(e.target)) onTodayInput(e);
});
window.addEventListener('hashchange', route);

// Coming back to the app later? Refresh the data (and roll "today" forward).
let lastSeenDay = todayISO();
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !S.token) return;
  if (debouncers.size) return; // don't clobber unsaved typing
  if (todayISO() !== lastSeenDay) { if (S.date === lastSeenDay) S.date = todayISO(); lastSeenDay = todayISO(); }
  S.board = null; S.boardRange = null;
  route();
});

// ------------------------------------------------------------------ boot
(async function boot() {
  document.title = CONFIG.CHALLENGE_NAME || 'Fam Bam Fitness Challenge';
  const saved = store.get();
  if (saved && saved.token) {
    S.token = saved.token; S.me = saved.member;
    route();
    try {
      const me = await api.me(S.token);
      if (me && me.sprite !== S.me.sprite) { S.me = me; store.set({ token: S.token, member: me }); refreshMeSprite(); }
    } catch (e) { if (e.code === 'not_logged_in') logout(true); }
  } else {
    renderLogin();
  }
})();
