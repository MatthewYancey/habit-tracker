'use strict';

const STORE_KEY = 'habits.v1';
const COLORS = ['#d97757', '#e0a43a', '#6aa84f', '#3d9a8b', '#4a86c8', '#7b6cd9', '#c95b9b', '#8a8780'];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// ---------- dates (local time, keyed as YYYY-MM-DD) ----------
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const startOfWeek = (d) => addDays(d, -d.getDay()); // Sunday

// ---------- state ----------
let state = load();
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.habits)) return s;
  } catch {}
  return { habits: [] };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const findHabit = (id) => state.habits.find((h) => h.id === id);

function toggle(habit, key) {
  if (habit.log[key]) delete habit.log[key];
  else habit.log[key] = 1;
  save();
  if (navigator.vibrate) navigator.vibrate(8);
}

// ---------- stats ----------
function weekCount(h, weekStart) {
  let n = 0;
  for (let i = 0; i < 7; i++) if (h.log[keyOf(addDays(weekStart, i))]) n++;
  return n;
}

// Daily habits: consecutive days (today may still be pending).
// Weekly-goal habits: consecutive weeks that met the goal (this week may still be pending).
function streak(h) {
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
    const d = new Date(k + 'T00:00:00');
    run = prev && keyOf(addDays(prev, 1)) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

function goalLabel(g) {
  return g >= 7 ? 'Daily' : g === 1 ? 'Weekly' : `${g}× a week`;
}

// ---------- rendering ----------
const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids) e.append(k);
  return e;
};

function render() {
  const t = today();
  $('#today-label').textContent = t.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const days = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));

  const list = $('#habit-list');
  list.replaceChildren();
  const tk = keyOf(t);
  let doneToday = 0;

  for (const h of state.habits) {
    if (h.log[tk]) doneToday++;
    const s = streak(h);
    const wk = weekCount(h, startOfWeek(t));
    const meta = h.goal >= 7
      ? (s.n ? `🔥 ${s.n} ${s.unit}` : 'Daily')
      : `${wk}/${h.goal} this week${s.n ? ` · 🔥 ${s.n}` : ''}`;

    const info = el('div', { className: 'info' },
      el('div', { className: 'emoji', textContent: h.emoji || '•' }),
      el('div', { style: 'min-width:0' },
        el('div', { className: 'name', textContent: h.name }),
        el('div', { className: 'meta', textContent: meta }),
      ),
    );
    info.querySelector('.emoji').style.background = h.color + '26';
    info.addEventListener('click', () => openDetail(h.id));

    const dayBtns = days.map((d, i) => {
      const k = keyOf(d);
      const b = el('button', {
        className: 'day' + (h.log[k] ? ' done' : '') + (i === 6 ? ' today' : ''),
        textContent: h.log[k] ? '✓' : DAY_LETTERS[d.getDay()],
      });
      b.setAttribute('aria-label', `${h.name} ${d.toDateString()} ${h.log[k] ? 'done' : 'not done'}`);
      b.style.setProperty('--c', h.color);
      b.addEventListener('click', () => { toggle(h, k); render(); });
      return b;
    });

    list.append(el('div', { className: 'habit' }, info, el('div', { className: 'days' }, ...dayBtns)));
  }

  $('#empty').hidden = state.habits.length > 0;
  renderSummary(doneToday, state.habits.length);
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

function openForm(id = null) {
  editingId = id;
  const h = id ? findHabit(id) : null;
  $('#habit-dialog-title').textContent = h ? 'Edit habit' : 'New habit';
  $('#f-name').value = h ? h.name : '';
  $('#f-emoji').value = h ? h.emoji : '';
  pickedColor = h ? h.color : COLORS[state.habits.length % COLORS.length];
  const goal = String(h ? h.goal : 7);
  form.querySelectorAll('input[name=goal]').forEach((r) => { r.checked = r.value === goal; });
  $('#delete-btn').hidden = !h;
  renderSwatches();
  habitDialog.showModal();
  if (!h) setTimeout(() => $('#f-name').focus(), 50);
}

form.addEventListener('submit', (e) => {
  if (e.submitter && e.submitter.value !== 'save') return;
  const name = $('#f-name').value.trim();
  if (!name) { e.preventDefault(); return; }
  const data = {
    name,
    emoji: $('#f-emoji').value.trim(),
    color: pickedColor,
    goal: Number(form.querySelector('input[name=goal]:checked').value),
  };
  if (editingId) Object.assign(findHabit(editingId), data);
  else state.habits.push({ id: uid(), created: keyOf(today()), log: {}, ...data });
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
  const s = streak(h);
  const total = Object.keys(h.log).length;
  const third = h.goal >= 7
    ? { v: bestDailyStreak(h), l: 'best streak' }
    : { v: `${weekCount(h, startOfWeek(today()))}/${h.goal}`, l: 'this week' };
  $('#detail-stats').innerHTML = '';
  for (const [v, l] of [[s.n, `current (${s.unit})`], [third.v, third.l], [total, 'total']]) {
    $('#detail-stats').append(el('div', { className: 'stat' }, el('b', { textContent: v }), el('span', { textContent: l })));
  }

  const t = today();
  const start = addDays(startOfWeek(t), -7 * 15);
  const cells = [];
  for (let i = 0; i < 16 * 7; i++) {
    const d = addDays(start, i);
    const k = keyOf(d);
    const future = d > t;
    const b = el('button', { className: (h.log[k] ? 'done' : '') + (future ? ' future' : '') + (k === keyOf(t) ? ' today' : '') });
    b.style.setProperty('--c', h.color);
    b.setAttribute('aria-label', `${d.toDateString()}${h.log[k] ? ' done' : ''}`);
    if (!future) b.addEventListener('click', () => { toggle(h, k); renderDetail(); render(); });
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
    state = data;
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
