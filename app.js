'use strict';

const STORE_KEY = 'habits.v1';
const COLORS = ['#d97757', '#e0a43a', '#6aa84f', '#3d9a8b', '#4a86c8', '#7b6cd9', '#c95b9b', '#8a8780'];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MILESTONES = [1, 3, 7, 14, 30, 60, 90, 180, 270, 365];

// Habit shape:
//   { id, name, emoji, color, type: 'build' | 'quit', start: 'YYYY-MM-DD', goal (build only), log: { 'YYYY-MM-DD': 1 } }
//   build: log = days the habit was done
//   quit:  log = days with a slip; every other day since `start` counts as clean

// ---------- dates (local time, keyed as YYYY-MM-DD) ----------
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (k) => new Date(k + 'T00:00:00');
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const startOfWeek = (d) => addDays(d, -d.getDay()); // Sunday
const daysBetween = (a, b) => Math.round((b - a) / 864e5);
const fmtDate = (d, year = false) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(year || d.getFullYear() !== today().getFullYear() ? { year: 'numeric' } : {}) });
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ---------- state ----------
let state = load();
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.habits)) return migrate(s);
  } catch {}
  return { habits: [] };
}
function migrate(s) {
  for (const h of s.habits) {
    h.type = h.type === 'quit' ? 'quit' : 'build';
    h.log = h.log || {};
    if (!h.start) h.start = [h.created, ...Object.keys(h.log)].filter(Boolean).sort()[0] || keyOf(today());
    if (h.type === 'build' && !h.goal) h.goal = 7;
  }
  return s;
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const findHabit = (id) => state.habits.find((h) => h.id === id);
const isQuit = (h) => h.type === 'quit';

// Returns false if the user cancelled.
function toggle(h, key) {
  if (isQuit(h)) {
    if (key < h.start) return false;
    if (!h.log[key] && !confirm(`Log a slip on ${fmtDate(parseKey(key))}? Your clean streak will restart from the next day.`)) return false;
  }
  if (h.log[key]) delete h.log[key];
  else h.log[key] = 1;
  save();
  if (navigator.vibrate) navigator.vibrate(8);
  return true;
}

// ---------- build-habit stats ----------
function weekCount(h, weekStart) {
  let n = 0;
  for (let i = 0; i < 7; i++) if (h.log[keyOf(addDays(weekStart, i))]) n++;
  return n;
}

// Daily habits: consecutive days (today may still be pending).
// Weekly-goal habits: consecutive weeks that met the goal (this week may still be pending).
function buildStreak(h) {
  const t = today();
  if (h.goal >= 7) {
    let d = h.log[keyOf(t)] ? t : addDays(t, -1);
    let n = 0;
    while (h.log[keyOf(d)]) { n++; d = addDays(d, -1); }
    return { n, unit: n === 1 ? 'day' : 'days' };
  }
  let w = startOfWeek(t);
  let n = 0;
  if (weekCount(h, w) >= h.goal) n++;
  w = addDays(w, -7);
  while (weekCount(h, w) >= h.goal) { n++; w = addDays(w, -7); }
  return { n, unit: n === 1 ? 'week' : 'weeks' };
}

function bestDailyStreak(h) {
  const keys = Object.keys(h.log).sort();
  let best = 0, run = 0, prev = null;
  for (const k of keys) {
    run = prev && keyOf(addDays(prev, 1)) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = parseKey(k);
  }
  return best;
}

// ---------- quit-habit stats ----------
const slips = (h) => Object.keys(h.log).filter((k) => k >= h.start && k <= keyOf(today())).sort();

// The day the current clean run began: the day after the last slip, or the start date.
function cleanSince(h) {
  const s = slips(h);
  return s.length ? addDays(parseKey(s[s.length - 1]), 1) : parseKey(h.start);
}
const cleanDays = (h) => Math.max(0, daysBetween(cleanSince(h), today()));

function longestClean(h) {
  let cur = parseKey(h.start), best = 0;
  for (const k of slips(h)) {
    best = Math.max(best, daysBetween(cur, parseKey(k)));
    cur = addDays(parseKey(k), 1);
  }
  return Math.max(best, daysBetween(cur, today()));
}

function nextMilestone(n) {
  const m = MILESTONES.find((x) => x > n);
  return m || (Math.floor(n / 365) + 1) * 365;
}
function milestoneLabel(n) {
  if (n % 365 === 0) return plural(n / 365, 'year');
  if (n === 180) return '6 months';
  if (n === 270) return '9 months';
  return plural(n, 'day');
}
function roughDuration(n) {
  if (n >= 365) {
    const y = Math.floor(n / 365), m = Math.floor((n % 365) / 30.44);
    return plural(y, 'year') + (m ? `, ${plural(m, 'month')}` : '');
  }
  if (n >= 60) return `about ${plural(Math.floor(n / 30.44), 'month')}`;
  if (n >= 14) return `${plural(Math.floor(n / 7), 'week')}${n % 7 ? `, ${plural(n % 7, 'day')}` : ''}`;
  return '';
}

// ---------- rendering ----------
const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids) e.append(k);
  return e;
};

// State of one calendar day for a habit: 'before' | 'done' | 'slip' | 'clean' | ''
function dayState(h, k) {
  if (isQuit(h)) return k < h.start ? 'before' : h.log[k] ? 'slip' : 'clean';
  return h.log[k] ? 'done' : '';
}

function render() {
  const t = today();
  const tk = keyOf(t);
  $('#today-label').textContent = t.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const days = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
  const list = $('#habit-list');
  list.replaceChildren();

  for (const h of state.habits) {
    let meta, badge = null;
    if (isQuit(h)) {
      const n = cleanDays(h);
      meta = `Clean since ${fmtDate(cleanSince(h))}`;
      badge = el('div', { className: 'badge' }, el('b', { textContent: n }), el('span', { textContent: n === 1 ? 'day' : 'days' }));
      badge.style.color = h.color;
    } else {
      const s = buildStreak(h);
      const wk = weekCount(h, startOfWeek(t));
      meta = h.goal >= 7
        ? (s.n ? `🔥 ${s.n} ${s.unit}` : 'Daily')
        : `${wk}/${h.goal} this week${s.n ? ` · 🔥 ${s.n}` : ''}`;
    }

    const info = el('div', { className: 'info' },
      el('div', { className: 'emoji', textContent: h.emoji || (isQuit(h) ? '🚫' : '•') }),
      el('div', { className: 'text' },
        el('div', { className: 'name', textContent: h.name }),
        el('div', { className: 'meta', textContent: meta }),
      ),
    );
    if (badge) info.append(badge);
    info.querySelector('.emoji').style.background = h.color + '26';
    info.addEventListener('click', () => openDetail(h.id));

    const dayBtns = days.map((d, i) => {
      const k = keyOf(d);
      const st = dayState(h, k);
      const b = el('button', {
        className: `day ${st}${i === 6 ? ' today' : ''}`,
        textContent: st === 'done' || st === 'clean' ? '✓' : st === 'slip' ? '✕' : DAY_LETTERS[d.getDay()],
        disabled: st === 'before',
      });
      b.setAttribute('aria-label', `${h.name} ${d.toDateString()} ${st || 'not done'}`);
      b.style.setProperty('--c', h.color);
      b.addEventListener('click', () => { if (toggle(h, k)) render(); });
      return b;
    });

    list.append(el('div', { className: 'habit' + (isQuit(h) ? ' quit' : '') }, info, el('div', { className: 'days' }, ...dayBtns)));
  }

  $('#empty').hidden = state.habits.length > 0;
  const builds = state.habits.filter((h) => !isQuit(h));
  renderSummary(builds.filter((h) => h.log[tk]).length, builds.length);
}

function renderSummary(done, total) {
  const box = $('#summary');
  if (!total) { box.hidden = true; return; }
  box.hidden = false;
  const pct = done / total;
  const r = 18, c = 2 * Math.PI * r;
  const msg = done === total ? 'All done today. Nice work!' : `${total - done} left to go today`;
  box.innerHTML = `
    <svg class="ring" viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r="${r}" stroke="var(--off)"/>
      <circle cx="22" cy="22" r="${r}" stroke="var(--accent)" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}" transform="rotate(-90 22 22)"/>
    </svg>
    <div><strong>${done} of ${total} done</strong><span></span></div>`;
  box.querySelector('span').textContent = msg;
}

// ---------- habit form ----------
const habitDialog = $('#habit-dialog');
const form = $('#habit-form');
let editingId = null;
let pickedColor = COLORS[0];

function renderSwatches() {
  $('#swatches').replaceChildren(...COLORS.map((c) => {
    const b = el('button', { type: 'button', className: 'swatch' });
    b.style.background = c;
    b.setAttribute('aria-label', `Color ${c}`);
    b.setAttribute('aria-pressed', String(c === pickedColor));
    b.addEventListener('click', () => { pickedColor = c; renderSwatches(); });
    return b;
  }));
}

const formType = () => form.querySelector('input[name=type]:checked').value;

// Show the fields that apply to the chosen type and start date.
function syncForm() {
  const quit = formType() === 'quit';
  $('#goal-field').hidden = quit;
  $('#f-name').placeholder = quit ? 'e.g. Alcohol' : 'e.g. Read 20 minutes';
  $('#name-label').textContent = quit ? 'What are you staying away from?' : 'Name';
  $('#start-label').textContent = quit ? 'Clean since' : 'Started on';
  const start = $('#f-start').value;
  $('#backfill-field').hidden = quit || !start || start >= keyOf(today());
}

function openForm(id = null) {
  editingId = id;
  const h = id ? findHabit(id) : null;
  $('#habit-dialog-title').textContent = h ? 'Edit habit' : 'New habit';
  $('#type-field').hidden = !!h; // type can't change once there's history
  form.querySelectorAll('input[name=type]').forEach((r) => { r.checked = r.value === (h ? h.type : 'build'); });
  $('#f-name').value = h ? h.name : '';
  $('#f-emoji').value = h ? h.emoji : '';
  $('#f-start').value = h ? h.start : keyOf(today());
  $('#f-start').max = keyOf(today());
  $('#f-backfill').checked = false;
  pickedColor = h ? h.color : COLORS[state.habits.length % COLORS.length];
  const goal = String(h && h.goal ? h.goal : 7);
  form.querySelectorAll('input[name=goal]').forEach((r) => { r.checked = r.value === goal; });
  $('#delete-btn').hidden = !h;
  renderSwatches();
  syncForm();
  habitDialog.showModal();
}

form.querySelectorAll('input[name=type]').forEach((r) => r.addEventListener('change', syncForm));
$('#f-start').addEventListener('input', syncForm);

form.addEventListener('submit', (e) => {
  if (e.submitter && e.submitter.value !== 'save') return;
  const name = $('#f-name').value.trim();
  if (!name) { e.preventDefault(); return; }
  let start = $('#f-start').value || keyOf(today());
  if (start > keyOf(today())) start = keyOf(today());
  const type = editingId ? findHabit(editingId).type : formType();
  const data = { name, emoji: $('#f-emoji').value.trim(), color: pickedColor, start };
  if (type === 'build') data.goal = Number(form.querySelector('input[name=goal]:checked').value);

  let h;
  if (editingId) h = Object.assign(findHabit(editingId), data);
  else state.habits.push(h = { id: uid(), type, log: {}, ...data });

  // "I've kept this up since then": mark every day from start through yesterday.
  if (type === 'build' && !$('#backfill-field').hidden && $('#f-backfill').checked) {
    for (let d = parseKey(start); d < today(); d = addDays(d, 1)) h.log[keyOf(d)] = 1;
  }
  save();
  render();
  if (editingId && detailDialog.open) openDetail(editingId);
});

$('#delete-btn').addEventListener('click', () => {
  const h = findHabit(editingId);
  if (!h || !confirm(`Delete "${h.name}" and all its history?`)) return;
  state.habits = state.habits.filter((x) => x.id !== editingId);
  save();
  habitDialog.close();
  detailDialog.close();
  render();
});

// ---------- detail / heatmap ----------
const detailDialog = $('#detail-dialog');
let detailId = null;

function openDetail(id) {
  detailId = id;
  renderDetail();
  if (!detailDialog.open) detailDialog.showModal();
}

function renderDetail() {
  const h = findHabit(detailId);
  if (!h) return;
  $('#detail-title').textContent = `${h.emoji ? h.emoji + ' ' : ''}${h.name}`;
  const t = today();

  let stats, note;
  if (isQuit(h)) {
    const n = cleanDays(h);
    const next = nextMilestone(n);
    const rough = roughDuration(n);
    const nSlips = slips(h).length;
    stats = [[n, n === 1 ? 'day clean' : 'days clean'], [longestClean(h), 'longest run'], [nSlips, nSlips === 1 ? 'slip' : 'slips']];
    note = `Clean since ${fmtDate(cleanSince(h), true)}${rough ? ` (${rough})` : ''}. `
      + `Next milestone: ${milestoneLabel(next)}, ${plural(next - n, 'day')} to go.`;
    $('#heatmap-hint').textContent = 'Last 16 weeks. Tap a day to log or remove a slip.';
  } else {
    const s = buildStreak(h);
    const third = h.goal >= 7
      ? [bestDailyStreak(h), 'best streak']
      : [`${weekCount(h, startOfWeek(t))}/${h.goal}`, 'this week'];
    stats = [[s.n, `current (${s.unit})`], third, [Object.keys(h.log).length, 'total days']];
    note = `Started ${fmtDate(parseKey(h.start), true)}.`;
    $('#heatmap-hint').textContent = 'Last 16 weeks. Tap a day to toggle it.';
  }
  $('#detail-stats').replaceChildren(...stats.map(([v, l]) =>
    el('div', { className: 'stat' }, el('b', { textContent: v }), el('span', { textContent: l }))));
  $('#detail-note').textContent = note;

  const start = addDays(startOfWeek(t), -7 * 15);
  const cells = [];
  for (let i = 0; i < 16 * 7; i++) {
    const d = addDays(start, i);
    const k = keyOf(d);
    const future = d > t;
    const st = dayState(h, k);
    const b = el('button', { className: `${st}${future ? ' future' : ''}${k === keyOf(t) ? ' today' : ''}`, disabled: future || st === 'before' });
    b.style.setProperty('--c', h.color);
    b.setAttribute('aria-label', `${d.toDateString()} ${st}`);
    b.addEventListener('click', () => { if (toggle(h, k)) { renderDetail(); render(); } });
    cells.push(b);
  }
  $('#heatmap').replaceChildren(...cells);
}

$('#detail-edit').addEventListener('click', () => openForm(detailId));

// ---------- settings ----------
const menuDialog = $('#menu-dialog');
$('#menu-btn').addEventListener('click', () => menuDialog.showModal());

$('#export-btn').addEventListener('click', async () => {
  const json = JSON.stringify(state, null, 2);
  const name = `habits-backup-${keyOf(today())}.json`;
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Habits backup' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = el('a', { href: URL.createObjectURL(file), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('#import-input').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data || !Array.isArray(data.habits)) throw new Error('bad file');
    if (!confirm(`Replace current data with ${data.habits.length} habit(s) from the backup?`)) return;
    state = migrate(data);
    save();
    render();
    menuDialog.close();
  } catch {
    alert("That file doesn't look like a Habits backup.");
  }
});

$('#reset-btn').addEventListener('click', () => {
  if (!confirm('Erase all habits and history? This cannot be undone.')) return;
  state = { habits: [] };
  save();
  render();
  menuDialog.close();
});

// ---------- shared dialog behavior ----------
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
$('#add-btn').addEventListener('click', () => openForm());

// Re-render when the day rolls over or the app returns to the foreground.
let lastDay = keyOf(today());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && keyOf(today()) !== lastDay) { lastDay = keyOf(today()); render(); }
});

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
