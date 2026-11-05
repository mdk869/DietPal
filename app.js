// DietPal — app logic (moved out of index.html so the Content-Security-Policy can forbid inline scripts)
/* ============================================================
   DATA & STORAGE
   ============================================================ */
const KEY = 'dietpal.v1';
const OLD_KEY = 'sukuSeparuh.v1';   // pre-rename key: migrated once on load

const DEFAULTS = {
  profile: {
    setupDone: false,
    name: '', sex: '', age: null, height: null, startWeight: null, targetWeight: null,
    activity: 'rendah', pace: '0.5',
    kcalMode: 'auto', waterMode: 'auto',               // 'auto' = dikira dari profil, 'manual' = pengguna tetapkan
    kcalMin: 1500, kcalMax: 1700, waterGoal: 2500, waterIdeal: 3000,
    milestones: [],
    avoid: [], allergies: [], noSpicy: false, health: []
  },
  settings: {
    theme: 'light', textSize: 'normal',
    mealTimes: { sarapan: '07:30', tengahari: '13:00', malam: '20:00' },
    reminders: { water: true, meals: true, weigh: true, summary: true, weighDay: 1 },
    ai: { consent: false, consentAt: 0, health: true }   // Coach AI: asked once before the first question
  },
  push: { on: false, asked: false, cardDone: false, endpoint: '' },
  dismissed: { date: '', ids: [] },
  backup: { lastAt: 0, snoozeAt: 0 },   // last backup download; backup reminder snoozed until
  days: {},          // { 'YYYY-MM-DD': { meals: [...], water: ml } }
  weights: [],       // [{ date, kg }]
  customFoods: []
};

// FOODS (Malaysian food presets) lives in foods.js — shared with api/coach.js
const CATS = ['Semua','Karbo','Protein','Sayur','Hidangan','Minuman','Snek','Sendiri'];
const MEALS = [
  { id:'sarapan', label:'Sarapan' },
  { id:'tengahari', label:'Tengah hari' },
  { id:'malam', label:'Makan malam', short:'Malam' },
  { id:'snek', label:'Snek' }
];
const PLATE = {
  serat:   { label:'Sayur & serat', color:'#6ba539', bg:'bg-green-50',  text:'text-green-700' },
  protein: { label:'Protein',       color:'#e0573f', bg:'bg-rose-50',   text:'text-rose-600' },
  karbo:   { label:'Karbo kompleks',color:'#e9b21c', bg:'bg-amber-50',  text:'text-amber-700' },
  lain:    { label:'Lain-lain',     color:'#94a3b8', bg:'bg-slate-50',  text:'text-slate-600' }
};

let S = load();
const UI = { tab: 'home', cat: 'Semua', q: '', sugAll: false, meal: guessMeal(), sym: new Set(), pTab: 'profil',
  ob: { step: 0, d: { sex: '', activity: 'rendah', pace: '0.5', avoid: [], allergies: [], noSpicy: false, health: [] } },
  sug: { meal: guessMeal(), loc: S.sugPrefs?.loc || 'rumah', venue: S.sugPrefs?.venue || 'mamak', seed: 0 } };

function load() {
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw && (raw = localStorage.getItem(OLD_KEY))) { localStorage.setItem(KEY, raw); localStorage.removeItem(OLD_KEY); }
    if (raw) {
      const d = JSON.parse(raw), base = structuredClone(DEFAULTS);
      const st = d.settings || {};
      const out = { ...base, ...d,
        profile: { ...base.profile, ...(d.profile || {}) },
        settings: { ...base.settings, ...st, mealTimes: { ...base.settings.mealTimes, ...(st.mealTimes || {}) }, reminders: { ...base.settings.reminders, ...(st.reminders || {}) } } };
      // v1.0 data (before profiles existed): keep the user's numbers exactly as they were
      if (d.profile && d.profile.setupDone === undefined) {
        const op = out.profile;
        op.setupDone = true; op.kcalMode = 'manual'; op.waterMode = 'manual';
        op.height = op.height || 170; op.startWeight = op.startWeight || 98;
        if (!op.milestones?.length) op.milestones = [ { name: 'Fasa 1', kg: 87 }, { name: 'Fasa 2', kg: 77 }, { name: 'Berat ideal', kg: 65 } ];
        op.targetWeight = op.targetWeight || op.milestones[op.milestones.length - 1].kg;
      }
      return sanitizeState(out);
    }
  } catch (e) { console.warn('load failed', e); }
  return structuredClone(DEFAULTS);   // new user → onboarding
}

// Rebuild the saved data from known fields only (types, ranges, lengths), so a damaged or
// tampered backup can never break the app or inject markup. Unknown fields are dropped.
// Runs before the later `const` tables exist, so allowed values are listed here.
function sanitizeState(d) {
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
  const s = (v, max = 80) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
  const n = (v, lo, hi, dflt = null) => { const x = Number(v); return v !== null && v !== '' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : dflt; };
  const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);
  const keys = (v, list) => [...new Set(arr(v, 20).filter(k => list.includes(k)))];
  const DATE = /^\d{4}-\d{2}-\d{2}$/, ID = /^[\w-]{1,40}$/, HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
  const PLATES = ['serat', 'protein', 'karbo', 'lain'], MEAL_IDS = ['sarapan', 'tengahari', 'malam', 'snek'];
  const base = structuredClone(DEFAULTS), src = obj(d);

  const p = obj(src.profile), bp = base.profile;
  const profile = {
    setupDone: p.setupDone === true, setupAt: n(p.setupAt, 0, 9e15) ?? undefined, name: s(p.name, 40), sex: oneOf(p.sex, ['L', 'P'], ''),
    age: n(p.age, 18, 90), height: n(p.height, 100, 250), startWeight: n(p.startWeight, 30, 300), targetWeight: n(p.targetWeight, 30, 300),
    activity: oneOf(p.activity, ['rendah', 'sederhana', 'aktif'], bp.activity), pace: oneOf(String(p.pace), ['0.25', '0.5', '0.75'], bp.pace),
    kcalMode: oneOf(p.kcalMode, ['auto', 'manual'], bp.kcalMode), waterMode: oneOf(p.waterMode, ['auto', 'manual'], bp.waterMode),
    kcalMin: n(p.kcalMin, 800, 6000, bp.kcalMin), kcalMax: n(p.kcalMax, 800, 6000, bp.kcalMax),
    waterGoal: n(p.waterGoal, 500, 10000, bp.waterGoal), waterIdeal: n(p.waterIdeal, 500, 10000, bp.waterIdeal),
    milestones: arr(p.milestones, 20).map(m => ({ name: s(obj(m).name, 40) || 'Milestone', kg: n(obj(m).kg, 30, 300) })).filter(m => m.kg !== null),
    avoid: keys(p.avoid, ['daging', 'ayam', 'ikan', 'laut']), allergies: keys(p.allergies, ['kacang', 'telur', 'susu']),
    noSpicy: p.noSpicy === true, health: keys(p.health, ['diabetes', 'bp', 'gastrik'])
  };

  const st = obj(src.settings), mt = obj(st.mealTimes), rm = obj(st.reminders), bs = base.settings;
  const settings = {
    theme: oneOf(st.theme, ['light', 'dark', 'auto'], bs.theme), textSize: oneOf(st.textSize, ['normal', 'big'], bs.textSize),
    mealTimes: Object.fromEntries(Object.entries(bs.mealTimes).map(([k, v]) => [k, HHMM.test(mt[k]) ? mt[k] : v])),
    reminders: { water: rm.water !== false, meals: rm.meals !== false, weigh: rm.weigh !== false, summary: rm.summary !== false,
      weighDay: Math.round(n(rm.weighDay, 0, 6, bs.reminders.weighDay)) },
    ai: { consent: obj(st.ai).consent === true, consentAt: n(obj(st.ai).consentAt, 0, 9e15, 0), health: obj(st.ai).health !== false }
  };

  const pu = obj(src.push);
  const push = {
    on: pu.on === true, asked: pu.asked === true, cardDone: pu.cardDone === true,
    endpoint: typeof pu.endpoint === 'string' && /^https:\/\//.test(pu.endpoint) && pu.endpoint.length < 1000 ? pu.endpoint : '' };

  const meal = m => {
    m = obj(m);
    const name = s(m.name, 80), kcal = n(m.kcal, 0, 10000);
    if (!name || kcal === null) return null;
    return { id: ID.test(m.id) ? m.id : uid(), foodId: ID.test(m.foodId) ? m.foodId : '', name, unit: s(m.unit, 40) || '1 hidangan',
      qty: n(m.qty, 0.1, 50, 1), kcal: Math.round(kcal), plate: oneOf(m.plate, PLATES, 'lain'), meal: oneOf(m.meal, MEAL_IDS, 'snek'), t: n(m.t, 0, 9e15, 0) };
  };
  const days = {};
  for (const [k, v] of Object.entries(obj(src.days)).slice(-3660)) {
    if (!DATE.test(k)) continue;
    days[k] = { meals: arr(obj(v).meals, 100).map(meal).filter(Boolean), water: Math.round(n(obj(v).water, 0, 20000, 0)) };
  }
  const weights = arr(src.weights, 3000).map(w => ({ date: DATE.test(obj(w).date) ? w.date : '', kg: n(obj(w).kg, 30, 300) }))
    .filter(w => w.date && w.kg !== null).map(w => ({ ...w, kg: Math.round(w.kg * 10) / 10 }));
  const customFoods = arr(src.customFoods, 500).map(f => {
    f = obj(f);
    const name = s(f.name, 60), kcal = n(f.kcal, 0, 5000);
    if (!ID.test(f.id) || !name || kcal === null) return null;
    const out = { id: f.id, name, kcal: Math.round(kcal), unit: s(f.unit, 40) || '1 hidangan', plate: oneOf(f.plate, PLATES, 'lain') };
    const water = n(f.water, 0, 5000); if (water) out.water = Math.round(water);
    return out;
  }).filter(Boolean);
  const bk = obj(src.backup);
  const backup = { lastAt: n(bk.lastAt, 0, 9e15, 0), snoozeAt: n(bk.snoozeAt, 0, 9e15, 0) };
  const dm = obj(src.dismissed);
  const out = { profile, settings, push, days, weights, customFoods, backup,
    dismissed: { date: DATE.test(dm.date) ? dm.date : '', ids: arr(dm.ids, 50).filter(x => typeof x === 'string' && ID.test(x)) } };
  const sp = obj(src.sugPrefs);
  if (src.sugPrefs) out.sugPrefs = { loc: oneOf(sp.loc, ['rumah', 'luar'], 'rumah'),
    venue: oneOf(sp.venue, ['gerai', 'mamak', 'campur', 'kopitiam', 'segera', 'kenduri', 'kedai'], 'mamak') };
  return out;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('Tak dapat simpan – storan penuh?'); }
  if (typeof syncPush === 'function') syncPush();
}


/* ============================================================
   ICONS — one line-icon set (24×24, stroke), used instead of emoji
   ============================================================ */
const IC = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/>',
  plusSquare: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>',
  dots: '<circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/>',
  bell: '<path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 003.4 0"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.9 1 6.7 2.7L21 8"/><path d="M21 3v5h-5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  sunrise: '<path d="M12 2v6M4.9 10.9l1.4 1.4M2 18h2M20 18h2M19.1 10.9l-1.4 1.4M22 22H2M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  apple: '<path d="M12 21c1.5 0 2.7 1 4 1 3 0 6-8 6-12.2A4.9 4.9 0 0 0 17 5c-2.2 0-4 1.4-5 2-1-.6-2.8-2-5-2a4.9 4.9 0 0 0-5 4.8C2 14 5 22 8 22c1.3 0 2.5-1 4-1Z"/><path d="M10 2c1 .5 2 2 2 5"/>',
  utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  scale: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8.5 9.5a5 5 0 0 1 7 0M12 12l1.5-2.5"/>',
  heartPulse: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/><path d="M3.2 12h6.3l.5-1 2 4.5 2-7 1.5 3.5h5.3"/>',
  alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  // symptoms
  dizzy: '<path d="M21 12a9 9 0 1 1-6.2-8.6"/><path d="M16.5 12a4.5 4.5 0 1 1-3.2-4.3"/><circle cx="12" cy="12" r="1"/>',
  pulse: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  wind: '<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2"/>',
  snowflake: '<path d="M2 12h20M12 2v20M20 16l-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4"/>',
  waves: '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  // venues
  tent: '<path d="M3.5 21 14 3M20.5 21 10 3M15.5 21 12 15l-3.5 6M2 21h20"/>',
  store: '<path d="M3 9l1.5-5h15L21 9M3 9h18v1.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 13v8h14v-8M10 21v-5h4v5"/>',
  bowl: '<path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9ZM7 21h10M9 3c.3.1.8.5.8 1.4S8.9 5.6 8.8 6.4c0 .8.3 1.2.7 1.6M14 3c.3.1.8.5.8 1.4s-.9 1.2-1 2c0 .8.3 1.2.7 1.6"/>',
  coffee: '<path d="M10 2v2M14 2v2M6 2v2M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/>',
  burger: '<path d="M4 11h16a1 1 0 0 0 1-1 8 8 0 0 0-18 0 1 1 0 0 0 1 1zM3 15h18M4 19h16a1 1 0 0 0 1-1v-1H3v1a1 1 0 0 0 1 1z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4ZM3 6h18M16 10a4 4 0 0 1-8 0"/>'
};
function icon(name, cls = 'w-5 h-5', sw = 2) {
  return `<svg class="${cls} shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[name] || ''}</svg>`;
}
const MEAL_ICON = { sarapan: 'sunrise', tengahari: 'sun', malam: 'moon', snek: 'apple' };

/* ============================================================
   HELPERS
   ============================================================ */
function todayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function day(k = todayKey()) { if (!S.days[k]) S.days[k] = { meals: [], water: 0 }; return S.days[k]; }
function peekDay(k) { return S.days[k] || { meals: [], water: 0 }; }
function kcalOf(d) { return Math.round(d.meals.reduce((a, m) => a + m.kcal, 0)); }
function guessMeal() {
  const mt = mealTimes(), n = new Date(), now = n.getHours() * 60 + n.getMinutes();
  const s = mins(mt.sarapan), t = mins(mt.tengahari), m = mins(mt.malam);
  return now < (s + t) / 2 ? 'sarapan' : now < t + 120 ? 'tengahari' : now < m - 60 ? 'snek' : 'malam';
}
function fmt(n) { return Math.round(n).toLocaleString('ms-MY'); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function allFoods() { return [...FOODS, ...S.customFoods.map(f => ({ ...f, cat: 'Sendiri' }))]; }
function findFood(id) { return allFoods().find(f => f.id === id); }
function sortedWeights() { return [...S.weights].sort((a, b) => a.date.localeCompare(b.date)); }
function currentWeight() { const w = sortedWeights(); return w.length ? w[w.length - 1].kg : (S.profile.startWeight || 0); }
function bmi(kg) { const h = (S.profile.height || 170) / 100; return kg / (h * h); }
const BULAN = ['Jan','Feb','Mac','Apr','Mei','Jun','Jul','Ogo','Sep','Okt','Nov','Dis'];
const HARI = ['Ahad','Isnin','Selasa','Rabu','Khamis','Jumaat','Sabtu'];
function niceDate(k) { const d = parseKey(k); return d.getDate() + ' ' + BULAN[d.getMonth()]; }
function streak() {
  let n = 0; const d = new Date();
  if (!peekDay(todayKey(d)).meals.length) d.setDate(d.getDate() - 1);
  while (peekDay(todayKey(d)).meals.length) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function toast(msg) {
  const t = document.getElementById('toast'); t.innerHTML = `<span class="text-green-400">${icon('check', 'w-4 h-4', 2.5)}</span><span>${esc(msg)}</span>`; t.classList.remove('hidden'); t.classList.add('flex');
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.classList.add('hidden'); t.classList.remove('flex'); }, 2200);
}
function plateCounts(d) {
  const c = { serat: 0, protein: 0, karbo: 0, lain: 0 };
  d.meals.forEach(m => { c[m.plate || 'lain'] += (m.qty || 1); });
  return c;
}
// What today's plate is missing: 'sayur', 'protein' or ''. Mixed dishes (nasi lemak, mee goreng…) are
// logged as 'lain', so a day with one isn't nagged about protein — we can't tell what's inside it.
function plateGap(d, pc = plateCounts(d)) {
  const mains = pc.karbo + pc.protein;
  if (mains >= 2 && pc.serat < 1) return 'sayur';
  const hasDish = d.meals.some(m => (m.plate || 'lain') === 'lain' && m.kcal >= 200);
  if (pc.karbo >= 2 && pc.protein < 1 && !hasDish) return 'protein';
  return '';
}

/* ============================================================
   AI COACH (rule-based)
   ============================================================ */
function coach() {
  const h = new Date().getHours();
  const d = peekDay(todayKey()); const k = kcalOf(d); const p = S.profile;
  const greet = h < 12 ? 'Selamat pagi' : h < 15 ? 'Selamat tengah hari' : h < 19 ? 'Selamat petang' : 'Selamat malam';
  const name = p.name ? ', ' + esc(p.name) : '';
  const expectedWater = Math.max(0, Math.min(1, (h - 7) / 14)) * p.waterGoal;
  const pc = plateCounts(d), gap = plateGap(d, pc);
  let msg, mood = '';

  if (k > p.kcalMax) { msg = `Hari ini lebih ${fmt(k - p.kcalMax)} kcal dari sasaran. Tak apa — ini bahagian "20" dalam 80/20. Esok sambung macam biasa, tak perlu ganti dengan makan terlalu sikit.`; }
  else if (h >= 19 && k > 0 && k < 1200) { msg = `Kalori hari ini baru ${fmt(k)} kcal — terlalu rendah boleh buat pening. Makan malam yang cukup ya: nasi 1 senduk + lauk + sayur.`; }
  else if (!d.meals.length && h < 11) { msg = 'Mulakan hari dengan sarapan berprotein — contoh 2 biji telur rebus + 2 keping roti gandum. Jangan skip sarapan, nanti lapar teruk waktu tengah hari.'; }
  else if (!S.settings.reminders.water && d.water < expectedWater - 500) { msg = `Air baru ${fmt(d.water)} ml. Minum segelas sekarang — kurang air antara punca pening dan rasa lapar palsu.`; }
  else if (k >= p.kcalMin && k <= p.kcalMax) {
    msg = gap === 'sayur' ? `${fmt(k)} kcal — dalam sasaran. Tapi hari ini belum ada sayur lagi. ${h < 19 ? 'Tambah sayur atau ulam waktu makan seterusnya — kalorinya rendah.' : 'Esok cuba isi separuh pinggan dengan sayur, ulam pun dikira!'}`
      : gap === 'protein' ? `${fmt(k)} kcal — dalam sasaran. Tapi protein hari ini masih kurang. Esok pilih lauk protein — telur, ikan, ayam atau tauhu — supaya lebih kenyang.`
      : `Mantap! ${fmt(k)} kcal — tepat dalam sasaran, pinggan pun seimbang. Konsisten macam ni yang bawa hasil.`;
  }
  else if (gap === 'sayur') { msg = 'Hari ini belum ada sayur lagi. Separuh pinggan sayur — ulam pun dikira!'; }
  else if (gap === 'protein') { msg = 'Protein hari ini masih kurang. Waktu makan seterusnya, tambah telur, ikan, ayam atau tauhu — lebih kenyang dan jaga otot.'; }
  else { msg = `Baki ${fmt(Math.max(0, p.kcalMax - k))} kcal untuk hari ini. Makan perlahan, dahulukan sayur dan protein.`; }
  return { greet: greet + name, msg, mood };
}

/* ============================================================
   VIEWS
   ============================================================ */
// If saved data ever makes a screen fail, show a way out (save a copy / clear) instead of a blank app.
function render() {
  try { renderApp(); }
  catch (e) {
    console.error('render failed', e);
    document.querySelector('nav')?.classList.add('hidden');
    document.getElementById('avatarBtn')?.classList.add('hidden');
    document.getElementById('view').innerHTML = `<div class="pt-8 pb-10 text-center">
      <h1 class="text-xl font-extrabold">Ada masalah dengan data DietPal</h1>
      <p class="text-[14px] text-slate-500 mt-2">Simpan salinan data dulu, kemudian padam dan mula semula (anda boleh pulihkan dari backup lain).</p>
      <button data-act="export" class="tap mt-5 w-full btn btn-secondary py-3">Simpan data saya</button>
      <button data-act="reset" class="tap mt-2 w-full btn btn-primary py-3">Padam data & mula semula</button></div>`;
  }
}
function renderApp() {
  const now = new Date();
  document.getElementById('appHdr').classList.remove('hidden');
  if (!appAllowed()) {   // DietPal runs only as an installed app
    document.querySelector('nav').classList.add('hidden');
    document.getElementById('avatarBtn').classList.add('hidden');
    document.getElementById('installBtn')?.classList.add('hidden');
    document.getElementById('hdrDate').textContent = 'Coach diet anda';
    document.getElementById('view').innerHTML = `<div class="fade">${viewGate()}</div>`;
    return;
  }
  const ready = S.profile.setupDone;
  if (ready && !notifReady()) {   // reminders are required to use DietPal
    document.querySelector('nav').classList.add('hidden');
    document.getElementById('avatarBtn').classList.add('hidden');
    document.getElementById('hdrDate').textContent = 'Coach diet anda';
    document.getElementById('view').innerHTML = `<div class="fade pt-4 pb-10">${notifBody(false)}</div>`;
    return;
  }
  document.querySelector('nav').classList.toggle('hidden', !ready);
  const av = document.getElementById('avatarBtn'); av.classList.toggle('hidden', !ready); av.textContent = initials();
  if (!ready) {
    document.getElementById('hdrDate').textContent = 'Coach diet anda';
    const obAnim = UI._obLast !== UI.ob.step ? 'fade' : ''; UI._obLast = UI.ob.step;
    document.getElementById('view').innerHTML = `<div class="${obAnim}">${viewOnboard()}</div>`;
    return;
  }
  document.getElementById('hdrDate').textContent = `${HARI[now.getDay()]}, ${now.getDate()} ${BULAN[now.getMonth()]} ${now.getFullYear()}`;
  const tabs = [ ['home','Utama',iconHome], ['food','Makan',iconFood], ['weight','Berat',iconScale], ['guide','Panduan',iconBook] ];
  document.getElementById('nav').innerHTML = tabs.map(([id, l, ic]) => `
    <button data-act="tab" data-tab="${id}" class="tap min-h-[52px] rounded-full flex flex-col items-center justify-center gap-0.5 ${UI.tab === id ? 'bg-brand-700 text-white' : 'text-mute'}" ${UI.tab === id ? 'aria-current="page"' : ''}>
      ${ic(UI.tab === id)}<span class="text-[12px] font-bold">${l}</span>
    </button>`).join('');
  document.getElementById('appHdr').classList.toggle('hidden', UI.tab === 'home');
  const v = { home: viewHome, food: viewFood, weight: viewWeight, guide: viewGuide, profile: viewProfile }[UI.tab]();
  const anim = UI._last !== UI.tab ? 'fade ' : ''; UI._last = UI.tab;
  document.getElementById('view').innerHTML = `<div class="${anim}space-y-4 ${UI.tab === 'home' ? '' : 'pt-2 '}pb-6">${v}</div>`;
}

const card = (inner, cls = '') => `<section class="bg-white rounded-2xl shadow-card p-4 ${cls}">${inner}</section>`;

/* ---------- HOME ---------- */
function viewHome() {
  const p = S.profile, d = peekDay(todayKey()), k = kcalOf(d), c = coach(), st = streak(), now = new Date();
  const pc = plateCounts(d);
  const pct = Math.min(100, (k / p.kcalMax) * 100), minPct = (p.kcalMin / p.kcalMax) * 100;
  const barColor = k > p.kcalMax ? '#d97706' : '#1e6b4a';
  const legend = (key, label) => `<span class="flex items-center gap-1.5 ${pc[key] ? '' : 'text-mute'}"><span class="w-2.5 h-2.5 rounded-full" style="background:${PLATE[key].color};${pc[key] ? '' : 'opacity:.3'}"></span>${label} ${pc[key]}</span>`;
  return `
  <section class="home-hero relative overflow-hidden bg-brand-700 text-white -mx-4 px-5 pb-20 rounded-b-[2rem]">
    <svg class="absolute inset-0 w-full h-full opacity-10" aria-hidden="true"><defs><pattern id="songket" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M16 0 L32 16 L16 32 L0 16 Z" fill="none" stroke="#fff" stroke-width="1"/><circle r="3" cx="16" cy="16" fill="#fff"/></pattern></defs><rect fill="url(#songket)" width="100%" height="100%"/></svg>
    <div class="relative max-w-md mx-auto flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-[14px] opacity-80">${HARI[now.getDay()]}, ${now.getDate()} ${BULAN[now.getMonth()]}</p>
        <h1 class="font-heading text-[24px] font-bold mt-0.5 leading-tight">${c.greet}</h1>
        <span class="inline-flex items-center gap-1.5 mt-3 rounded-full bg-white/15 px-3 py-1 text-[13px] font-semibold">${ph('fire-fill', 16)}${st ? `${st} hari berturut-turut` : 'Log makan untuk mula streak'}</span>
      </div>
      <button data-act="tab" data-tab="profile" class="tap w-12 h-12 shrink-0 rounded-full bg-white text-brand-700 font-heading text-[20px] font-bold grid place-items-center" aria-label="Profil & tetapan">${initials()}</button>
    </div>
  </section>

  <section class="relative -mt-14 bg-paper rounded-3xl p-5 shadow-card">
    <div class="flex items-center gap-4">
      ${plateRing(k, pc)}
      <div class="flex-1 min-w-0 space-y-3">
        <div>
          <p class="text-[13px] text-mute">Sasaran</p>
          <p class="font-heading font-bold text-[16px] tnum whitespace-nowrap">${fmt(p.kcalMin)}–${fmt(p.kcalMax)} kcal</p>
          <p class="text-[14px] font-bold mt-0.5 ${k > p.kcalMax ? 'text-amber-700' : 'text-brand-700'}">${statusText(k)}</p>
          <div class="relative h-2 rounded-full bg-sand mt-2 overflow-hidden" role="img" aria-label="${fmt(k)} daripada ${fmt(p.kcalMax)} kcal">
            <div class="absolute inset-y-0 left-0 rounded-full transition-all" style="width:${pct}%;background:${barColor}"></div>
            <div class="absolute inset-y-0 w-0.5 bg-white/80" style="left:${minPct}%"></div>
          </div>
        </div>
        <div class="flex flex-wrap gap-x-3 gap-y-1 text-[13px] font-semibold">
          ${legend('serat', 'Sayur')}${legend('protein', 'Protein')}${legend('karbo', 'Karbo')}
        </div>
      </div>
    </div>
    <button data-act="quickMeal" data-meal="${guessMeal()}" class="tap mt-5 w-full btn btn-primary h-12 text-[15px]">${ph('plus-bold', 20)}Log makan</button>
    <div class="grid grid-cols-4 gap-2 mt-4">
      ${MEALS.map(m => { const mk = d.meals.filter(x => x.meal === m.id).reduce((a, x) => a + x.kcal, 0);
        return `<button data-act="quickMeal" data-meal="${m.id}" class="tap rounded-2xl px-1 py-2.5 text-center ${mk ? 'bg-brand-100' : 'border-2 border-dashed border-line'}">
          <p class="text-[12px] text-mute whitespace-nowrap">${m.short || m.label}</p>
          <p class="font-heading font-bold tnum ${mk ? '' : 'text-mute'}">${mk ? fmt(mk) : '–'}</p></button>`; }).join('')}
    </div>
  </section>

  ${remindersBlock()}

  ${homeSuggest(c)}

  ${waterCard()}

  ${weightCard()}

  <button data-act="rescue" class="tap w-full flex items-center gap-3 rounded-3xl bg-sand p-4 text-left min-h-14">
    <span class="text-brand-700">${ph('heart-bold', 24)}</span>
    <span class="flex-1"><span class="block font-bold">Rasa tak selesa?</span><span class="block text-[14px] text-mute">Panduan ringkas untuk rasa lebih baik</span></span>
    <span class="text-mute">${ph('caret-right-bold', 20)}</span>
  </button>`;
}

// Calorie hero drawn as a top-down plate: ring split by today's food groups.
function plateRing(k, pc) {
  const r = 50, C = 2 * Math.PI * r, keys = ['serat', 'protein', 'karbo'];
  const tot = keys.reduce((a, x) => a + pc[x], 0);
  const gap = tot > 1 ? 4 : 0;
  let off = 0;
  const segs = tot ? keys.map(x => {
    const len = (pc[x] / tot) * C; const el = len > 0 ? `<circle r="${r}" cx="60" cy="60" fill="none" stroke="${PLATE[x].color}" stroke-width="14" stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-off}"/>` : '';
    off += len; return el; }).join('') : '';
  return `
  <div class="relative w-[140px] h-[140px] shrink-0">
    <svg viewBox="0 0 120 120" class="w-full h-full -rotate-90" aria-hidden="true">
      <circle r="${r}" cx="60" cy="60" fill="none" stroke="#f1eadb" stroke-width="14" class="plate-base"/>${segs}
    </svg>
    <div class="absolute inset-0 flex flex-col items-center justify-center">
      <span class="font-heading text-[34px] font-extrabold tnum leading-none">${fmt(k)}</span>
      <span class="text-[13px] text-mute mt-1">kcal dimakan</span>
    </div>
  </div>`;
}

/* ---------- COACH SUGGESTION (home) ---------- */
function homeSuggest(c) {
  const s = UI.sug;
  if (!UI.sugPicked) {   // default to the next meal that hasn't been logged yet
    const logged = new Set(peekDay(todayKey()).meals.map(x => x.meal));
    const i = MEAL_FLOW.indexOf(guessMeal());
    const open = MEAL_FLOW.slice(Math.max(0, i)).find(m => !logged.has(m) && m !== 'snek');
    if (open && open !== s.meal) { s.meal = open; s.seed = 0; }
  }
  const vs = venuesFor(s.meal);
  const venue = vs.includes(s.venue) ? s.venue : vs[0];
  const { list, t } = suggestMenus(venue);
  const mealInfo = MEALS.find(m => m.id === s.meal);
  const logged = peekDay(todayKey()).meals.some(x => x.meal === s.meal);
  const start = list.length > 1 ? s.seed % list.length : 0;
  const top = list[start];
  const seg = `<div class="seg grid-cols-2">${Object.entries({ rumah: 'Di rumah', luar: 'Di luar' }).map(([k, l]) => `<button data-act="sugLoc" data-loc="${k}" class="tap seg-btn h-10 ${s.loc === k ? 'seg-on' : ''}">${l}</button>`).join('')}</div>`;
  const mealTabs = `<div class="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4">${MEALS.map(m => `<button data-act="sugMeal" data-meal="${m.id}" class="tap shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-bold ${s.meal === m.id ? 'bg-brand-100 text-brand-800' : 'text-mute'}">${m.short || m.label}</button>`).join('')}</div>`;
  let body;
  if (!top) {
    body = `<p class="text-[14px] text-mute text-center py-2">Tiada menu yang sesuai dengan pilihan makanan anda di sini. Cuba tempat lain atau ubah pilihan di Profil.</p>`;
  } else {
    const { m, kc } = top, its = menuItems(m), fit = Math.abs(kc - t.ideal) <= t.ideal * 0.2;
    body = `
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-[13px] text-mute">${mealInfo.label} · <span class="tnum">${fmt(kc)}</span> kcal${logged ? ' · dah log' : ''}</p>
          <h3 class="font-heading text-[18px] font-bold leading-snug">${esc(m.name)}</h3>
        </div>
        ${fit ? '<span class="shrink-0 mt-0.5 rounded-full bg-brand-100 text-brand-800 px-2.5 py-1 text-[12px] font-bold whitespace-nowrap">Sesuai</span>' : ''}
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1.5 text-[14px]">
        ${its.map(x => `<span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full" style="background:${PLATE[x.f.plate || 'lain'].color}"></span>${x.qty !== 1 ? x.qty + '× ' : ''}${esc(x.f.name)}</span>`).join('')}
      </div>
      <p class="rounded-2xl bg-sand p-3 text-[14px]">${esc(m.tip)}</p>
      <div class="grid grid-cols-2 gap-2">
        <button data-act="logMenu" data-id="${m.id}" class="tap btn btn-primary h-12 text-[14px]">Log menu ini</button>
        <button data-act="sugShuffle" class="tap btn btn-secondary h-12 text-[14px]" ${list.length > 1 ? '' : 'disabled'}>${ph('arrows-clockwise-bold', 16)}Cadangan lain</button>
      </div>`;
  }
  return `
  <section class="space-y-3 pt-2">
    <h2 class="font-heading text-[20px] font-bold">Cadangan Coach</h2>
    <p class="text-[15px] leading-snug">${c.msg}</p>
    ${mealTabs}
    ${seg}
    ${s.loc === 'luar' ? `<div class="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">${vs.map(v => `<button data-act="sugVenue" data-v="${v}" class="tap chip ${venue === v ? 'chip-on' : ''}">${icon(VENUES[v].ic, 'w-4 h-4')}${VENUES[v].label}</button>`).join('')}</div>` : ''}
    ${t.note ? `<p class="text-[13px] bg-amber-50 text-amber-800 rounded-2xl px-3 py-2">${t.note}</p>` : ''}
    <div class="rounded-3xl bg-paper p-5 space-y-4 shadow-card">
      ${body}
      ${AI_ENDPOINT ? `<button data-act="askAI" class="tap w-full h-11 btn btn-text text-[14px]">${ph('sparkle', 18)}Tanya Coach AI</button>` : ''}
    </div>
  </section>`;
}

function statusText(k) {
  const p = S.profile;
  if (k === 0) return 'Belum log makanan hari ini';
  if (k < p.kcalMin) return `Baki ~${fmt(p.kcalMax - k)} kcal`;
  if (k <= p.kcalMax) return 'Dalam sasaran';
  return `Lebih ${fmt(k - p.kcalMax)} kcal — tak apa, 80/20`;
}
function statusColor(k) { const p = S.profile; return k > p.kcalMax ? 'text-amber-600' : k >= p.kcalMin ? 'text-green-600' : 'text-slate-600'; }


function lostText() {
  const diff = S.profile.startWeight - currentWeight();
  return diff > 0 ? `↓ ${diff.toFixed(1)} kg sejak mula` : diff < 0 ? `+${(-diff).toFixed(1)} kg dari berat mula` : 'Berat mula';
}

/* ---------- WATER ---------- */
const litres = (ml) => String(+(ml / 1000).toFixed(2));
function waterCard() {
  const p = S.profile, d = peekDay(todayKey()), w = d.water;
  const pct = Math.min(100, (w / p.waterGoal) * 100);
  const left = p.waterGoal - w;
  return `
  <section class="rounded-3xl bg-paper p-5 space-y-4 shadow-card">
    <div class="flex items-end justify-between gap-3">
      <div>
        <h2 class="font-heading text-[18px] font-bold">Air hari ini</h2>
        <p class="text-[14px] text-mute mt-0.5">${w >= p.waterIdeal ? 'Cukup untuk hari ini' : left <= 0 ? 'Sasaran dicapai' : `${litres(left)} L lagi`}</p>
      </div>
      <p class="font-heading text-[26px] font-extrabold tnum leading-none"><span class="text-water">${litres(w)}</span><span class="text-[16px] text-mute"> / ${(p.waterGoal / 1000).toFixed(1)} L</span></p>
    </div>
    <div class="h-2.5 rounded-full bg-sand overflow-hidden"><div class="h-full rounded-full bg-water transition-all" style="width:${pct}%"></div></div>
    <div class="grid grid-cols-[1fr_1fr_auto] gap-2">
      <button data-act="water" data-ml="250" class="tap btn btn-water h-11 text-[14px]">+ Gelas 250 ml</button>
      <button data-act="water" data-ml="500" class="tap btn btn-water h-11 text-[14px]">+ Botol 500 ml</button>
      <button data-act="water" data-ml="-250" class="tap h-11 px-2 text-[14px] font-bold text-mute disabled:opacity-40" ${w <= 0 ? 'disabled' : ''} aria-label="Undo 250 ml">Undo</button>
    </div>
  </section>`;
}

/* ---------- WEIGHT (home) ---------- */
function weightCard() {
  const p = S.profile, ws = sortedWeights().slice(-8), cur = currentWeight();
  const diff = (p.startWeight || cur) - cur;
  let spark = '';
  if (ws.length >= 2) {
    const v = ws.map(x => x.kg), lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
    const pts = v.map((kg, i) => [Math.round(i / (v.length - 1) * 100), Math.round(6 + (hi - kg) / span * 38)]);
    const [lx, ly] = pts[pts.length - 1];
    spark = `<svg viewBox="-4 0 108 50" class="w-28 h-14 shrink-0 text-brand-700" aria-hidden="true"><polyline fill="none" points="${pts.map(x => x.join(',')).join(' ')}" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle r="4" cx="${lx}" cy="${ly}" fill="currentColor"/></svg>`;
  }
  return `
  <section class="rounded-3xl bg-paper p-5 flex items-center justify-between gap-4 shadow-card">
    <div class="space-y-1">
      <p class="text-[14px] text-mute">Berat semasa</p>
      <p class="font-heading text-[30px] font-extrabold tnum leading-none">${cur.toFixed(1)} <span class="text-[16px]">kg</span></p>
      <p class="text-[14px]">${diff > 0 ? `<span class="text-brand-700 font-bold">↓ ${diff.toFixed(1)} kg</span> sejak mula` : diff < 0 ? `<span class="font-bold">+${(-diff).toFixed(1)} kg</span> dari berat mula` : 'Berat mula'}</p>
      ${p.targetWeight ? `<p class="text-[14px] text-mute">Sasaran ${fmt(p.targetWeight)} kg</p>` : ''}
      <button data-act="tab" data-tab="weight" class="tap min-h-11 text-[14px] font-bold text-brand-700 inline-flex items-center gap-1">Log berat ${ph('caret-right-bold', 14)}</button>
    </div>
    ${spark}
  </section>`;
}

/* ---------- PLATE ---------- */
function plateSVG(size = 150) {
  return `
  <svg viewBox="0 0 200 200" width="${size}" height="${size}" class="shrink-0">
    <circle cx="100" cy="100" r="96" fill="#fff" stroke="#e2e8f0" stroke-width="4"/>
    <path d="M100 18 A82 82 0 0 0 100 182 Z" fill="#6ba539"/>
    <path d="M100 18 A82 82 0 0 1 182 100 L100 100 Z" fill="#e0573f"/>
    <path d="M182 100 A82 82 0 0 1 100 182 L100 100 Z" fill="#e9b21c"/>
    <line x1="100" y1="16" x2="100" y2="184" stroke="#fff" stroke-width="4"/>
    <line x1="100" y1="100" x2="184" y2="100" stroke="#fff" stroke-width="4"/>
    ${size >= 150 ? `
    <text x="58" y="96" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">Sayur</text>
    <text x="58" y="118" text-anchor="middle" font-size="18" font-weight="800" fill="#fff">50%</text>
    <text x="139" y="62" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">Protein</text>
    <text x="139" y="80" text-anchor="middle" font-size="15" font-weight="800" fill="#fff">25%</text>
    <text x="139" y="130" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">Karbo</text>
    <text x="139" y="148" text-anchor="middle" font-size="15" font-weight="800" fill="#fff">25%</text>` : `
    <text x="58" y="108" text-anchor="middle" font-size="26" font-weight="800" fill="#fff">½</text>
    <text x="139" y="72" text-anchor="middle" font-size="22" font-weight="800" fill="#fff">¼</text>
    <text x="139" y="142" text-anchor="middle" font-size="22" font-weight="800" fill="#fff">¼</text>`}
  </svg>`;
}
/* ---------- FOOD ---------- */
function foodRow(f) {
  const c = foodConflicts(f);
  return `
    <button data-act="pickFood" data-id="${esc(f.id)}" class="tap w-full flex items-center gap-3 py-2.5 text-left">
      <div class="flex-1 min-w-0">
        <div class="text-[14px] font-semibold truncate">${esc(f.name)}</div>
        <div class="text-[12px] text-slate-500 flex items-center gap-1.5"><span class="w-2 h-2 rounded-full shrink-0" style="background:${PLATE[f.plate || 'lain'].color}"></span>${esc(f.unit)}${c.length ? ` · <span class="text-amber-700 font-semibold">Ada ${c.map(t => TAG_LABEL[t]).join(', ')}</span>` : ''}</div>
      </div>
      <div class="text-[14px] font-bold text-slate-700">${esc(f.kcal)}<span class="text-[12px] text-slate-500 font-medium"> kcal</span></div>
      <div class="w-8 h-8 rounded-full border border-slate-200 text-brand-700 grid place-items-center">${icon('plus', 'w-4 h-4', 2.5)}</div>
    </button>`;
}

/* ---------- MAKAN: today's log first; adding happens in a sheet ---------- */
function viewFood() {
  const d = peekDay(todayKey()), k = kcalOf(d), p = S.profile;
  const pct = Math.min(100, k / p.kcalMax * 100);
  const barColor = k > p.kcalMax ? '#d97706' : k >= p.kcalMin ? '#16a34a' : '#1e6b4a';
  return `
  <div class="px-1">
    <div class="flex items-baseline justify-between">
      <h1 class="text-xl font-extrabold">Makan hari ini</h1>
      <div class="text-[14px] font-bold">${fmt(k)} <span class="text-slate-500 font-semibold">/ ${fmt(p.kcalMax)} kcal</span></div>
    </div>
    <div class="h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden"><div class="h-full rounded-full transition-all" style="width:${pct}%;background:${barColor}"></div></div>
    <div class="text-[13px] font-semibold mt-1.5 ${statusColor(k)}">${statusText(k)}</div>
  </div>

  ${MEALS.map(m => {
    const items = d.meals.filter(x => x.meal === m.id);
    const mk = items.reduce((a, x) => a + x.kcal, 0);
    return card(`
      <div class="flex items-center justify-between">
        <div class="font-bold text-[16px] flex items-center gap-2"><span class="text-slate-500">${icon(MEAL_ICON[m.id], 'w-5 h-5')}</span>${m.label}</div>
        <div class="text-[14px] font-bold ${mk ? 'text-slate-700' : 'text-slate-400'}">${mk ? fmt(mk) + ' kcal' : '–'}</div>
      </div>
      ${items.length ? `<div class="mt-1">${items.map(x => `
        <div class="flex items-center gap-2 py-2 border-t border-slate-100">
          <span class="w-2 h-2 rounded-full shrink-0" style="background:${PLATE[x.plate || 'lain'].color}"></span>
          <div class="flex-1 min-w-0 text-[14px] text-slate-700 leading-snug">${esc(x.name)} <span class="text-slate-500 text-[13px]">· ${x.qty !== 1 ? x.qty + ' × ' : ''}${esc(x.unit || '')}</span></div>
          <div class="text-[14px] font-semibold">${fmt(x.kcal)}</div>
          <button data-act="delMeal" data-id="${esc(x.id)}" class="tap w-8 h-8 grid place-items-center text-slate-400 hover:text-red-600" aria-label="Padam">${icon('x', 'w-4 h-4')}</button>
        </div>`).join('')}</div>` : ''}
      <div class="flex items-center gap-2 mt-2">
        <button data-act="openAdd" data-meal="${m.id}" class="tap btn btn-secondary py-2 px-4 text-[14px]">${icon('plus', 'w-4 h-4')}Tambah</button>
        ${!items.length ? `<button data-act="ideaMenu" data-meal="${m.id}" class="tap btn btn-text py-2 text-[14px]">Idea menu${icon('chevR', 'w-4 h-4')}</button>` : ''}
      </div>`, 'py-3');
  }).join('')}

  <p class="text-[12px] text-slate-500 text-center px-4">Nilai kalori ialah anggaran purata. Saiz hidangan kedai berbeza-beza.</p>`;
}

// The add sheet: search first, then frequent items, one category filter, one flat list
function addResultsHtml() {
  const q = UI.q.trim().toLowerCase();
  let list = allFoods();
  if (UI.cat !== 'Semua') list = list.filter(f => f.cat === UI.cat);
  if (q) list = list.filter(f => (f.name + ' ' + f.unit).toLowerCase().includes(q));
  return list.length
    ? `<div class="divide-y divide-slate-100">${list.map(foodRow).join('')}</div>`
    : `<div class="py-6 text-center text-[14px] text-slate-500">Tiada padanan untuk "${esc(UI.q)}".</div>`;
}
function addSheetBody() {
  const m = MEALS.find(x => x.id === UI.meal), freq = frequentFoods();
  const showFreq = freq.length && !UI.q.trim() && UI.cat === 'Semua';
  return `
  <div class="sticky top-0 bg-white z-10 px-5 pt-4 pb-3 border-b border-slate-100">
    <div class="flex items-center justify-between">
      <div class="font-bold text-xl">Tambah ke ${m.label}</div>
      <button data-act="closeSheet" class="tap w-9 h-9 grid place-items-center rounded-xl text-slate-500" aria-label="Tutup">${icon('x')}</button>
    </div>
    <div class="relative mt-3">
      <input id="addSearch" value="${esc(UI.q)}" placeholder="Cari makanan… (cth: nasi, ayam, teh)" autocomplete="off" class="w-full bg-slate-50 rounded-xl px-4 py-3 pl-10 text-[16px] outline-none focus:ring-2 focus:ring-brand-500">
      <span class="absolute left-3.5 top-3.5 text-slate-500">${icon('search', 'w-5 h-5')}</span>
    </div>
    <div class="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 mt-3">
      ${CATS.map(c => `<button data-act="addCat" data-cat="${c}" class="tap chip ${UI.cat === c ? 'chip-on' : ''}">${c}</button>`).join('')}
    </div>
  </div>
  <div class="px-5 pb-6">
    ${showFreq ? `<div id="addFreq">
      <div class="text-[12px] font-semibold text-slate-500 mt-3 mb-2">Kerap dimakan</div>
      <div class="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
        ${freq.map(f => `<button data-act="pickFood" data-id="${esc(f.id)}" class="tap shrink-0 bg-white rounded-xl border border-slate-200 px-3 py-2 text-left">
          <div class="text-[13px] font-semibold whitespace-nowrap">${esc(f.name)}</div><div class="text-[12px] text-slate-500">${esc(f.kcal)} kcal</div></button>`).join('')}
      </div></div>` : ''}
    <div id="addResults" class="mt-2">${addResultsHtml()}</div>
    <button data-act="customFood" class="tap mt-3 w-full btn btn-secondary border-dashed py-3 text-[14px]">${icon('plus', 'w-4 h-4')}Tambah makanan sendiri</button>
  </div>`;
}
function openAdd(meal) {
  UI.meal = meal; UI.q = ''; UI.cat = 'Semua';
  openSheet(addSheetBody, true);
}

function frequentFoods() {
  const cnt = {};
  Object.values(S.days).forEach(d => d.meals.forEach(m => { if (m.foodId) cnt[m.foodId] = (cnt[m.foodId] || 0) + 1; }));
  return Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => findFood(id)).filter(Boolean);
}

function sheetFood(id) {
  const f = findFood(id); if (!f) return;
  UI.pick = { id, qty: 1 };
  openSheet(() => {
    const q = UI.pick.qty;
    return `
    <div class="p-5">
      <button data-act="backToAdd" class="tap btn btn-text text-[14px] -ml-1 mb-2">${icon('chevL', 'w-4 h-4')}Kembali</button>
      <div>
        <div class="text-[12px] font-semibold text-brand-700">Tambah ke ${MEALS.find(m => m.id === UI.meal).label}</div>
        <div class="font-bold text-xl leading-tight">${esc(f.name)}</div>
        <div class="text-[14px] text-slate-500">${esc(f.unit)} · ${esc(f.kcal)} kcal</div>
        <div class="text-[12px] font-semibold mt-1 flex items-center gap-1.5 text-slate-600"><span class="w-2 h-2 rounded-full" style="background:${PLATE[f.plate || 'lain'].color}"></span>${PLATE[f.plate || 'lain'].label}</div>
      </div>
      <div class="mt-5 flex items-center justify-between bg-slate-50 rounded-xl p-2">
        <button data-act="qty" data-d="-0.5" class="tap w-12 h-12 rounded-xl bg-white border border-slate-200 grid place-items-center" aria-label="Kurang">${icon('minus')}</button>
        <div class="text-center"><div class="text-2xl font-extrabold">${q}</div><div class="text-[12px] text-slate-500">hidangan</div></div>
        <button data-act="qty" data-d="0.5" class="tap w-12 h-12 rounded-xl bg-white border border-slate-200 grid place-items-center" aria-label="Tambah">${icon('plus')}</button>
      </div>
      ${f.plate === 'karbo' && /nasi/i.test(f.name) ? `<div class="mt-4 text-[13px] bg-amber-50 text-amber-800 rounded-xl p-3"><b>Tip:</b> Nasi tak perlu dipotong terus — 1 senduk (¼ pinggan) cukup untuk tenaga & elak pening.</div>` : ''}
      <button data-act="addFood" class="tap mt-5 w-full btn btn-primary py-3.5 text-[16px]">Tambah · ${fmt(f.kcal * q)} kcal</button>
    </div>`;
  });
}

function sheetCustom() {
  openSheet(() => `
    <div class="p-5">
      <button data-act="backToAdd" class="tap btn btn-text text-[14px] -ml-1 mb-2">${icon('chevL', 'w-4 h-4')}Kembali</button>
      <div class="font-bold text-xl">Tambah makanan sendiri</div>
      <p class="text-[13px] text-slate-500">Akan disimpan dalam kategori "Sendiri" untuk guna semula.</p>
      <label class="block mt-4 text-[12px] font-semibold text-slate-500">Nama makanan</label>
      <input id="cfName" class="w-full mt-1 bg-slate-50 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-500" placeholder="cth: Nasi kerabu">
      <div class="grid grid-cols-2 gap-3 mt-3">
        <div><label class="block text-[12px] font-semibold text-slate-500">Kalori (kcal)</label>
          <input id="cfKcal" type="number" inputmode="numeric" class="w-full mt-1 bg-slate-50 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-500" placeholder="350"></div>
        <div><label class="block text-[12px] font-semibold text-slate-500">Hidangan</label>
          <input id="cfUnit" class="w-full mt-1 bg-slate-50 rounded-xl px-3 py-3 outline-none focus:ring-2 focus:ring-brand-500" placeholder="1 pinggan"></div>
      </div>
      <label class="block mt-3 text-[12px] font-semibold text-slate-500">Jenis (untuk imbangan pinggan)</label>
      <select id="cfPlate" class="w-full mt-1 bg-slate-50 rounded-xl px-3 py-3 outline-none">
        <option value="lain">Lain-lain / hidangan campur</option><option value="serat">Sayur & serat</option><option value="protein">Protein</option><option value="karbo">Karbo</option>
      </select>
      <button data-act="saveCustom" class="tap mt-5 w-full btn btn-primary py-3.5">Simpan & log ke ${MEALS.find(m => m.id === UI.meal).label}</button>
    </div>`);
}

/* ---------- WEIGHT ---------- */
function viewWeight() {
  const p = S.profile, ws = sortedWeights(), cur = currentWeight(), b = bmi(cur);
  const wk = weeklyChange();
  return `
  ${card(`
    <div class="grid grid-cols-3 gap-2 text-center">
      <div><div class="text-[12px] text-slate-500">Semasa</div><div class="text-xl font-extrabold">${cur.toFixed(1)}</div><div class="text-[12px] text-slate-500">kg</div></div>
      <div><div class="text-[12px] text-slate-500">Dah turun</div><div class="text-xl font-extrabold text-brand-700">${Math.max(0, p.startWeight - cur).toFixed(1)}</div><div class="text-[12px] text-slate-500">dari ${p.startWeight} kg</div></div>
      <div><div class="text-[12px] text-slate-500">BMI</div><div class="text-xl font-extrabold">${b.toFixed(1)}</div><div class="text-[12px] text-slate-500">${bmiLabel(b)}</div></div>
    </div>
    ${wk !== null ? `<div class="mt-3 text-[13px] text-center rounded-xl py-2 ${wk <= 0 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}">7 hari lepas: ${wk <= 0 ? '↓' : '↑'} ${Math.abs(wk).toFixed(1)} kg ${wk > 0 ? '— biasa naik turun sebab air & garam, tengok trend minggu ke minggu' : wk < -1.2 ? `— laju! Pastikan makan cukup, jangan bawah ${fmt(kcalFloor())} kcal selalu` : '— kadar sihat'}</div>` : ''}`)}

  ${card(`
    <div class="font-bold text-[16px] mb-3">Log berat</div>
    <div class="flex gap-2">
      <div class="relative flex-1">
        <input id="wKg" type="number" step="0.1" inputmode="decimal" value="${cur.toFixed(1)}" class="w-full bg-slate-50 rounded-xl px-3 py-3 pr-10 text-xl font-bold outline-none focus:ring-2 focus:ring-brand-500">
        <span class="absolute right-3 top-3.5 text-slate-500 text-[14px]">kg</span>
      </div>
      <input id="wDate" type="date" value="${todayKey()}" max="${todayKey()}" class="bg-slate-50 rounded-xl px-2 py-3 text-[14px] outline-none w-[140px]">
    </div>
    <button data-act="saveWeight" class="tap mt-3 w-full btn btn-primary py-3">Simpan berat</button>
    <p class="text-[12px] text-slate-500 mt-2">Tip: timbang waktu pagi, lepas ke tandas, sebelum makan — supaya bacaan konsisten.</p>`)}

  ${card(`
    <div class="flex justify-between items-center mb-2"><div class="font-bold text-[16px]">Trend berat</div><div class="text-[12px] text-slate-500">${ws.length} catatan</div></div>
    ${weightChart(ws)}`)}

  ${card(`
    <div class="font-bold text-[16px] mb-3">Milestone</div>
    <div class="space-y-4">${p.milestones.map((m, i) => milestoneRow(m, i)).join('')}</div>`)}

  ${ws.length ? card(`
    <div class="font-bold text-[16px] mb-1">Sejarah</div>
    <div class="divide-y divide-slate-100">
      ${[...ws].reverse().slice(0, 14).map((w, i, arr) => { const prev = arr[i + 1]; const dlt = prev ? w.kg - prev.kg : 0;
        return `<div class="flex items-center py-2.5 text-[14px]"><div class="flex-1 text-slate-600">${niceDate(w.date)}</div>
        <div class="w-16 text-right text-[12px] ${dlt < 0 ? 'text-green-600' : dlt > 0 ? 'text-amber-600' : 'text-slate-500'}">${prev ? (dlt > 0 ? '+' : '') + dlt.toFixed(1) : ''}</div>
        <div class="w-20 text-right font-bold">${w.kg.toFixed(1)} kg</div>
        <button data-act="delWeight" data-date="${esc(w.date)}" class="tap w-8 h-8 grid place-items-center text-slate-500 hover:text-red-600" aria-label="Padam">${icon('x', 'w-4 h-4')}</button></div>`; }).join('')}
    </div>`) : ''}`;
}

function bmiLabel(b) { return b < 18.5 ? 'kurang' : b < 23 ? 'normal' : b < 27.5 ? 'berlebihan' : 'obes'; } // Asian cut-offs (KKM)
function weeklyChange() {
  const ws = sortedWeights(); if (ws.length < 2) return null;
  const last = ws[ws.length - 1]; const target = parseKey(last.date); target.setDate(target.getDate() - 7);
  let ref = null;
  for (const w of ws) { if (parseKey(w.date) <= target) ref = w; }
  if (!ref) return null;
  return last.kg - ref.kg;
}
function milestoneRow(m, i) {
  const p = S.profile, cur = currentWeight();
  const from = i === 0 ? p.startWeight : p.milestones[i - 1].kg;
  const done = cur <= m.kg;
  const pct = Math.max(0, Math.min(100, ((from - cur) / (from - m.kg)) * 100));
  const left = cur - m.kg;
  const active = !done && (i === 0 || cur <= p.milestones[i - 1].kg);
  return `
  <div class="${!done && !active ? 'opacity-60' : ''}">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2"><div class="w-7 h-7 rounded-full grid place-items-center text-[14px] ${done ? 'bg-green-500 text-white' : active ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-500'}">${done ? icon('check', 'w-4 h-4', 3) : i + 1}</div>
      <div><div class="font-semibold text-[14px]">${esc(m.name)}: ${esc(m.kg)} kg</div>
      <div class="text-[12px] text-slate-500">${done ? 'Tercapai' : `${left.toFixed(1)} kg lagi · anggaran ${Math.ceil(left / 1)}–${Math.ceil(left / 0.5)} minggu`}</div></div></div>
      <div class="text-[13px] font-bold ${done ? 'text-green-600' : 'text-slate-500'}">${Math.round(done ? 100 : pct)}%</div>
    </div>
    <div class="h-2 bg-slate-100 rounded-full mt-2 overflow-hidden"><div class="h-full rounded-full ${done ? 'bg-green-500' : 'bg-brand-500'}" style="width:${done ? 100 : pct}%"></div></div>
  </div>`;
}
function weightChart(ws) {
  if (ws.length < 2) return `<div class="h-36 grid place-items-center text-center text-[14px] text-slate-500 bg-slate-50 rounded-2xl px-6">Log berat sekurang-kurangnya 2 kali untuk lihat graf trend.</div>`;
  const pts = ws.slice(-30);
  const W = 320, H = 170, pl = 34, pr = 12, pt = 14, pb = 24;
  const t0 = parseKey(pts[0].date).getTime(), t1 = parseKey(pts[pts.length - 1].date).getTime() || t0 + 1;
  const next = S.profile.milestones.find(m => currentWeight() > m.kg);
  const kgs = pts.map(p => p.kg);
  let lo = Math.min(...kgs), hi = Math.max(...kgs);
  if (next && next.kg > lo - 6) lo = Math.min(lo, next.kg);
  lo = Math.floor(lo - 0.5); hi = Math.ceil(hi + 0.5); if (hi - lo < 3) hi = lo + 3;
  const x = t => pl + ((t - t0) / Math.max(1, t1 - t0)) * (W - pl - pr);
  const y = kg => pt + (1 - (kg - lo) / (hi - lo)) * (H - pt - pb);
  const coords = pts.map(p => [x(parseKey(p.date).getTime()), y(p.kg)]);
  const line = coords.map((c, i) => (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ');
  const area = line + ` L${coords[coords.length - 1][0]} ${H - pb} L${coords[0][0]} ${H - pb} Z`;
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const last = coords[coords.length - 1];
  return `
  <svg viewBox="0 0 ${W} ${H}" class="w-full h-auto">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f8a60" stop-opacity=".25"/><stop offset="1" stop-color="#2f8a60" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map(t => `<line x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}" stroke="#eef2f1"/><text x="${pl - 6}" y="${y(t) + 4}" text-anchor="end" font-size="10" fill="#94a3b8">${t}</text>`).join('')}
    ${next && next.kg >= lo ? `<line x1="${pl}" x2="${W - pr}" y1="${y(next.kg)}" y2="${y(next.kg)}" stroke="#6ba539" stroke-dasharray="4 4"/><text x="${W - pr}" y="${y(next.kg) - 4}" text-anchor="end" font-size="10" font-weight="700" fill="#16a34a">${esc(next.name)} ${next.kg} kg</text>` : ''}
    <path d="${area}" fill="url(#g)"/>
    <path d="${line}" fill="none" stroke="#1e6b4a" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${coords.map(c => `<circle cx="${c[0]}" cy="${c[1]}" r="3" fill="#fff" stroke="#1e6b4a" stroke-width="2"/>`).join('')}
    <circle cx="${last[0]}" cy="${last[1]}" r="5" fill="#1e6b4a"/>
    <text x="${pl}" y="${H - 6}" font-size="10" fill="#94a3b8">${niceDate(pts[0].date)}</text>
    <text x="${W - pr}" y="${H - 6}" text-anchor="end" font-size="10" fill="#94a3b8">${niceDate(pts[pts.length - 1].date)}</text>
  </svg>`;
}

/* ---------- GUIDE ---------- */
function viewGuide() {
  const p = S.profile;
  return `
  ${card(`
    <div class="text-center"><div class="font-extrabold text-xl text-brand-900">Pinggan Suku-Suku Separuh</div>
    <p class="text-[13px] text-slate-500">Guna pinggan biasa — tak perlu timbang makanan.</p></div>
    <div class="flex justify-center my-3">${plateSVG(200)}</div>
    <div class="space-y-2.5">
      ${guideRow('#6ba539', '½ pinggan — Sayur & serat', 'Ulam, kangkung, kobis, bayam, timun, kacang panjang, sup sayur. Makan ini dulu supaya cepat kenyang.')}
      ${guideRow('#e0573f', '¼ pinggan — Protein', 'Ayam (buang kulit), ikan bakar/kukus, telur, tempe, tauhu. Sebesar tapak tangan.')}
      ${guideRow('#e9b21c', '¼ pinggan — Karbo kompleks', 'Nasi 1 senduk (perang lebih baik), ubi, roti gandum, oat. Sebesar penumbuk.')}
    </div>`)}

  ${card(`
    <div class="font-bold text-[16px]">Prinsip 80/20</div>
    <p class="text-[14px] text-slate-600 mt-1 leading-relaxed">80% masa ikut pinggan sihat, 20% boleh santai — nasi lemak hujung minggu atau kenduri. Yang penting <b>konsisten</b>, bukan sempurna. Satu hari terlebih tak rosakkan progres.</p>`)}

  ${card(`
    <div class="font-bold text-[16px] mb-2">Elak diet ekstrem</div>
    <ul class="space-y-2 text-[14px] text-slate-600">
      <li class="flex gap-2"><span class="text-red-600 mt-0.5">${icon('x', 'w-4 h-4', 2.5)}</span><span>Jangan potong <b>garam atau karbohidrat sepenuhnya</b> secara mendadak (cold turkey). Badan boleh hilang elektrolit — pening, sakit kepala, perut kembung.</span></li>
      <li class="flex gap-2"><span class="text-green-600 mt-0.5">${icon('check', 'w-4 h-4', 2.5)}</span><span>Kurangkan <b>sikit-sikit</b> dalam 2–3 minggu — contohnya nasi: 1 pinggan → 1½ senduk → 1 senduk.</span></li>
      <li class="flex gap-2"><span class="text-green-600 mt-0.5">${icon('check', 'w-4 h-4', 2.5)}</span><span>Garam secukup rasa masih perlu. Kurangkan makanan proses & kuah pekat, bukan buang garam sepenuhnya.${hasHealth('bp') ? ' <b>Ada darah tinggi? Ikut had garam yang doktor tetapkan.</b>' : ''}</span></li>
      <li class="flex gap-2"><span class="text-green-600 mt-0.5">${icon('check', 'w-4 h-4', 2.5)}</span><span>Jangan makan bawah <b>${fmt(p.kcalMin)} kcal</b> selalu — defisit terlalu besar buat badan lemah & cepat give up.</span></li>
      <li class="flex gap-2"><span class="text-sky-600 mt-0.5">${icon('droplet', 'w-4 h-4')}</span><span>Minum ${(p.waterGoal / 1000).toFixed(1)}–${(p.waterIdeal / 1000).toFixed(1)} L air sehari. Kadang-kadang "lapar" sebenarnya dahaga.</span></li>
    </ul>`)}

  ${eatOutCard()}

  ${sourcesCard()}


  <button data-act="tab" data-tab="profile" class="tap w-full bg-white rounded-2xl shadow-card p-4 flex items-center gap-3 text-left">
    <div class="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 grid place-items-center">${icon('sliders')}</div>
    <div class="flex-1"><div class="font-bold text-[14px]">Profil & Tetapan</div><div class="text-[13px] text-slate-500">Sasaran, milestone, pilihan makanan, peringatan, backup data</div></div>
    <span class="text-slate-500">${icon('chevR')}</span>
  </button>

  <p class="text-[12px] text-slate-500 text-center px-6 pb-2">App ini panduan gaya hidup, bukan nasihat perubatan. Rujuk doktor atau pegawai dietetik untuk keadaan kesihatan tertentu.</p>`;
}
const guideRow = (c, t, d) => `<div class="flex gap-3 items-start"><span class="w-3 h-3 rounded-full mt-1 shrink-0" style="background:${c}"></span><div><div class="font-semibold text-[14px]">${t}</div><div class="text-[13px] text-slate-500 leading-snug">${d}</div></div></div>`;
// Only what the app actually uses.
const SOURCES = [
  { title: 'Pinggan Sihat Malaysia (KKM)', use: 'Suku-Suku Separuh',
    url: 'https://iku.moh.gov.my/images/teknikal-report/album-makanan-malaysia-edisi-kedua-2024-1.pdf' },
  { title: 'CPG Pengurusan Obesiti 2023 (KKM)', use: 'kategori BMI',
    url: 'https://medic.usm.my/images/Anaesthesiology%20and%20Intensive%20Care%20Unit/Guidelines/CPG%20Management%20of%20Obesity%20230518.pdf' },
  { title: 'Formula Mifflin-St Jeor (1990)', use: 'sasaran kalori',
    url: 'https://agris.fao.org/search/ar/records/65de26fe7c7033e84be9ee76' },
  { title: 'Panduan hipoglisemia antarabangsa', use: 'nota kencing manis',
    url: 'https://ruor.uottawa.ca/bitstreams/25132578-f3be-4701-96d9-702abc7eb43b/download' }
];
function sourcesCard() {
  return card(`
    <div class="font-bold text-[16px] mb-2">Sumber rujukan</div>
    <ul class="space-y-2">
      ${SOURCES.map(x => `<li class="text-[14px] leading-snug"><a href="${x.url}" target="_blank" rel="noopener" class="font-semibold text-brand-700 underline decoration-brand-200 underline-offset-2">${x.title}</a></li>`).join('')}
    </ul>
    <p class="text-[12px] text-slate-500 mt-3">Nilai kalori makanan dan sasaran air ialah anggaran.</p>
    <button data-act="privacy" class="tap mt-2 text-[13px] font-semibold text-brand-700">Privasi & data →</button>`);
}
// "Makan di luar dengan bijak": kcal saved is computed from the food presets so it always matches the log
const EAT_OUT_RULES = [
  'Pilih bakar, kukus atau sup berbanding goreng',
  'Minta kuah, sambal & sos diasingkan',
  'Pilih minuman kosong atau kurang manis'
];
const EAT_OUT_SWAPS = [
  { from: [['tehtarik', 1]], to: [['kopio', 1]], fromLabel: 'Teh tarik', toLabel: 'Teh O / kopi O kosong' },
  { from: [['rcanai', 1]], to: [['tosai', 1]], fromLabel: 'Roti canai', toLabel: 'Tosai kosong' },
  { from: [['agoreng', 1]], to: [['agrill', 1]], fromLabel: 'Ayam goreng', toLabel: 'Ayam bakar / grill' },
  { from: [['mgoreng', 1]], to: [['msup', 1], ['sayurr', 1]], fromLabel: 'Mee goreng', toLabel: 'Mee sup + sayur' },
  { from: [['nlemak', 1]], to: [['nlemak', 0.5], ['telurr', 1]], fromLabel: 'Nasi lemak', toLabel: 'Nasi lemak separuh + telur rebus' }
];
function itemsKcal(items) { return items.reduce((a, [id, q]) => a + (findFood(id)?.kcal || 0) * q, 0); }
function eatOutCard() {
  const swaps = EAT_OUT_SWAPS
    .filter(x => ![...x.from, ...x.to].some(([id]) => { const f = findFood(id); return f && foodConflicts(f).length; }))
    .map(x => ({ ...x, saved: Math.round((itemsKcal(x.from) - itemsKcal(x.to)) / 5) * 5 }))
    .filter(x => x.saved > 0);
  return card(`
    <div class="font-bold text-[16px]">Makan di luar dengan bijak</div>
    <p class="text-[14px] text-slate-600 mt-1">Ubah sikit cara pesan — tak perlu elak makanan kegemaran.</p>

    <div class="text-[12px] font-semibold text-slate-500 mt-4 mb-2">3 cara mudah</div>
    <ul class="space-y-2 text-[14px] text-slate-700">
      ${EAT_OUT_RULES.map(r => `<li class="flex gap-2"><span class="text-green-600 mt-0.5">${icon('check', 'w-4 h-4', 2.5)}</span><span>${r}</span></li>`).join('')}
    </ul>

    ${swaps.length ? `
    <div class="text-[12px] font-semibold text-slate-500 mt-5 mb-1">Tukar kecil, jimat besar</div>
    <div class="divide-y divide-slate-100">
      ${swaps.map(x => `
        <div class="flex items-center gap-3 py-2.5">
          <div class="flex-1 min-w-0 text-[14px] leading-snug">
            <span class="text-slate-500">${x.fromLabel}</span>
            <span class="inline-block align-middle text-slate-400 mx-0.5">${icon('chevR', 'w-4 h-4')}</span>
            <span class="font-semibold text-slate-800">${x.toLabel}</span>
          </div>
          <div class="shrink-0 text-right"><div class="text-[12px] text-slate-500">jimat</div><div class="text-[14px] font-bold text-green-700">~${fmt(x.saved)} kcal</div></div>
        </div>`).join('')}
    </div>` : ''}

    <button data-act="eatOutMenus" class="tap mt-3 w-full btn btn-secondary py-2.5 text-[14px]">Lihat cadangan menu di luar${icon('chevR', 'w-4 h-4')}</button>`);
}
const field = (id, label, val, type = 'number') => `<div><label class="block text-[12px] font-semibold text-slate-500">${label}</label><input id="${id}" type="${type}" ${type === 'number' ? 'inputmode="decimal" step="any"' : ''} value="${esc(val ?? '')}" class="w-full mt-1 bg-slate-50 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-brand-500"></div>`;


/* ============================================================
   RESCUE ASSISTANT
   ============================================================ */
const SYMPTOMS = {
  pening:  { label: 'Pening', ic: 'dizzy' },
  kepala:  { label: 'Sakit kepala', ic: 'pulse' },
  angin:   { label: 'Masuk angin / kembung', ic: 'wind' },
  lemah:   { label: 'Lemah / menggigil', ic: 'snowflake' },
  loya:    { label: 'Loya', ic: 'waves' },
  kejang:  { label: 'Kejang otot', ic: 'zap' }
};

function sheetRescue() {
  UI.sym = new Set(); UI.rescueDone = false;
  openSheet(rescueBody);
}
function rescueBody() {
  if (UI.rescueDone) return rescueResult();
  return `
  <div class="p-5">
    <div class="w-10 h-1.5 rounded-full bg-slate-200 mx-auto mb-4"></div>
    <div class="flex items-center gap-3"><div class="w-11 h-11 rounded-xl bg-red-50 text-red-600 grid place-items-center">${icon('heartPulse', 'w-6 h-6')}</div>
      <div><div class="font-extrabold text-xl leading-tight">Rasa tak selesa</div><div class="text-[13px] text-slate-500">Pilih apa yang anda rasa</div></div></div>
    ${redFlags()}
    <div class="grid grid-cols-2 gap-2 mt-4">
      ${Object.entries(SYMPTOMS).map(([k, s]) => `<button data-act="sym" data-s="${k}" class="tap rounded-xl border-2 px-3 py-3 text-left flex items-center gap-2.5 ${UI.sym.has(k) ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-600'}">
        ${icon(s.ic, 'w-5 h-5')}<span class="text-[14px] font-semibold text-slate-800 leading-tight">${s.label}</span></button>`).join('')}
    </div>
    <button data-act="rescueGo" class="tap mt-5 w-full btn btn-primary py-3.5 disabled:opacity-40" ${UI.sym.size ? '' : 'disabled'}>Lihat panduan</button>
  </div>`;
}
function redFlags() {
  return `<div class="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 text-[13px] text-red-800 leading-snug flex gap-2.5">
    <span class="text-red-600 mt-0.5">${icon('alert', 'w-5 h-5')}</span><div><b>Segera dapatkan rawatan / hubungi 999</b> jika ada sakit dada, sesak nafas, pengsan, muka/badan sebelah lemah, cakap pelat, penglihatan kabur tiba-tiba, atau sakit kepala yang paling teruk pernah rasa.</div></div>`;
}
function rescueResult() {
  const d = peekDay(todayKey()), k = kcalOf(d), h = new Date().getHours(), s = UI.sym;
  const lowFood = (h >= 12 && k < 600) || (h >= 17 && k < 1000);
  const lowWater = d.water < Math.max(750, ((h - 7) / 14) * S.profile.waterGoal * 0.6);
  const carbsToday = d.meals.filter(m => m.plate === 'karbo' || /nasi|roti|mee|kuey/i.test(m.name)).length;

  const insights = [];
  if (lowFood) insights.push(`Hari ini anda baru makan <b>${fmt(k)} kcal</b>. Ini mungkin terlalu sikit — badan kekurangan tenaga.`);
  if (lowWater) insights.push(`Air hari ini baru <b>${fmt(d.water)} ml</b>. Kurang air ialah punca biasa pening & sakit kepala.`);
  if (h >= 13 && carbsToday === 0) insights.push('Belum ada karbohidrat hari ini. Potong karbo terlalu banyak secara mendadak boleh cetuskan "keto flu".');

  const steps = [
    ['Berhenti & duduk', 'Duduk atau baring dalam tempat sejuk. Jangan memandu atau buat kerja berat sekarang.']];
  if (hasHealth('diabetes')) steps.push(['Semak gula darah dulu', 'Anda ada kencing manis. Jika ada glucometer, semak sekarang. Bacaan <b>bawah 4.0 mmol/L</b> = gula rendah: ambil sumber gula cepat (cth: ½ gelas jus buah atau 3 sudu teh gula dalam air), semak semula selepas 15 minit.']);
  steps.push(
    ['Ganti elektrolit', hasHealth('bp')
      ? 'Minum <b>air kosong</b> perlahan-lahan. Anda ada darah tinggi — elak tambah garam atau minuman tinggi natrium tanpa nasihat doktor. Semak tekanan darah jika ada alat.'
      : s.has('angin')
      ? 'Minum segelas air suam dengan secubit garam, perlahan-lahan. Perut kembung? Elak minuman bergas buat masa ini.'
      : 'Minum <b>minuman elektrolit tanpa gula</b> (minuman isotonik atau garam rehidrasi oral), atau segelas air suam dengan secubit garam. Hirup perlahan-lahan.'],
    ['Makan sesuatu ringan', (s.has('lemah') || lowFood)
      ? 'Makan sesuatu yang cepat beri tenaga — contohnya <b>buah-buahan</b> atau <b>sekeping roti</b> — kemudian makanan ringan yang lain.'
      : 'Makan <b>snek ringan</b> yang ada sedikit karbohidrat — contohnya biskut kosong, sekeping roti atau buah-buahan.']
  );
  if (hasHealth('gastrik') && (s.has('angin') || s.has('loya') || lowFood)) steps.push(['Jaga gastrik', 'Jangan biar perut kosong lama — makan sedikit sekarang. Elak kopi, minuman bergas dan makanan pedas buat sementara.']);
  if (s.has('kepala') || s.has('pening')) steps.push(['Rehatkan mata & kepala', 'Tutup mata 10–15 minit, jauhkan skrin. Kalau biasa ambil ubat tahan sakit (cth: paracetamol) dan sesuai dengan anda, ikut dos pada label.']);
  if (s.has('angin')) steps.push(['Lega perut', 'Minum air halia suam (tanpa gula), sapu minyak angin di perut, dan jalan perlahan 5–10 minit. Elak baring terus lepas makan.']);
  if (s.has('loya')) steps.push(['Hirup sikit-sikit', 'Ambil air dalam teguk kecil. Makanan kering yang ringan (cth: biskut kosong atau roti) lebih senang diterima perut berbanding makanan berminyak.']);
  if (s.has('kejang')) steps.push(['Kalium & magnesium', 'Makanan tinggi kalium (cth: buah-buahan, sayur hijau) dan sedikit garam membantu kejang otot. Regangkan otot perlahan-lahan.']);
  if (lowFood) steps.push(['Waktu makan seterusnya', 'Makan hidangan penuh: <b>nasi 1 senduk</b> + lauk protein + sayur. Jangan skip — nasi dalam kadar betul OK.']);
  steps.push(['Tunggu 15–20 minit', 'Kebanyakan simptom keto flu lega selepas ini. Kalau tak lega dalam sejam atau makin teruk, jumpa doktor.']);

  return `
  <div class="p-5">
    <div class="w-10 h-1.5 rounded-full bg-slate-200 mx-auto mb-4"></div>
    <div class="font-extrabold text-xl">Langkah yang boleh dicuba</div>
    <p class="text-[13px] text-slate-500">${[...s].map(x => SYMPTOMS[x].label).join(' · ')}</p>

    ${insights.length ? `<div class="mt-3 bg-amber-50 rounded-xl p-3 space-y-1.5 text-[13px] text-amber-900">
      <div class="font-bold text-[12px] uppercase tracking-wide text-amber-800">Coach perasan</div>${insights.map(i => `<div>• ${i}</div>`).join('')}</div>` : ''}

    <ol class="mt-4 space-y-3">
      ${steps.map(([t, dsc], i) => `<li class="flex gap-3"><div class="w-7 h-7 shrink-0 rounded-full bg-brand-700 text-white grid place-items-center text-[13px] font-bold">${i + 1}</div>
        <div><div class="font-semibold text-[14px]">${t}</div><div class="text-[13px] text-slate-600 leading-snug">${dsc}</div></div></li>`).join('')}
    </ol>

    <div class="mt-4 text-[12px] font-semibold text-slate-500 mb-2">Dah ambil sesuatu? Tekan untuk log terus:</div>
    <div class="grid grid-cols-2 gap-2">
      <button data-act="rescueLog" data-id="${hasHealth('bp') ? 'airkosong' : 'p100z'}" class="tap btn btn-secondary py-2.5 text-[13px]">${hasHealth('bp') ? 'Air kosong' : 'Minuman elektrolit'}</button>
      <button data-act="rescueLog" data-id="kraker" class="tap btn btn-secondary py-2.5 text-[13px]">Biskut kosong</button>
      <button data-act="rescueLog" data-id="buah" class="tap btn btn-secondary py-2.5 text-[13px]">Buah-buahan</button>
      <button data-act="rescueOther" class="tap btn btn-secondary py-2.5 text-[13px]">${icon('search', 'w-4 h-4')}Lain-lain</button>
    </div>

    <div class="mt-4 bg-brand-50 rounded-xl p-3 text-[13px] text-brand-900 leading-snug">
      <b>Tip:</b> Gejala ini biasa berlaku bila kalori, karbohidrat atau garam dikurangkan terlalu banyak secara mendadak. Kurangkan sikit-sikit — progres perlahan tapi selamat lebih baik dari pening hari-hari.
    </div>
    <p class="text-[12px] text-slate-500 mt-3">${(S.profile.health || []).length
      ? `Langkah di atas mengambil kira nota kesihatan anda (${S.profile.health.map(h => HEALTH[h]).join(', ')}). Ikut nasihat doktor jika berbeza.`
      : 'Ada kencing manis atau ambil ubat darah tinggi? Simptom ini mungkin berkaitan ubat atau gula rendah — semak bacaan dan rujuk doktor. Boleh tambah nota kesihatan di Profil.'}</p>
    <button data-act="closeSheet" class="tap mt-4 w-full btn btn-primary py-3.5">Dah rasa lebih baik</button>
  </div>`;
}

/* ============================================================
   MENU SUGGESTION ENGINE (Enjin A — rule-based, offline)
   ============================================================ */
// Vercel function that calls OpenAI (key is stored as OPENAI_API_KEY in Vercel, never in this file).
// Set to '' to hide the "Tanya Coach AI" button; Enjin A keeps working offline either way.
const AI_ENDPOINT = '/api/coach';

const VENUES = {
  gerai:    { label: 'Gerai / warung', ic: 'tent' },
  mamak:    { label: 'Mamak', ic: 'utensils' },
  campur:   { label: 'Nasi campur', ic: 'bowl' },
  kopitiam: { label: 'Kopitiam', ic: 'coffee' },
  segera:   { label: 'Makanan segera', ic: 'burger' },
  kenduri:  { label: 'Kenduri', ic: 'users' },
  kedai:    { label: 'Kedai serbaneka', ic: 'bag' }
};

// items: [foodId, qty]   meals: s=sarapan t=tengahari m=malam n=snek
const MENUS = [
  // ---------- RUMAH: sarapan ----------
  { id:'r1', loc:'rumah', meals:'s', name:'Telur rebus & roti gandum', items:[['telurr',2],['rotig',1],['salad',0.5],['kopio',1]], tip:'Protein pagi buat kenyang lebih lama — kurang craving tengah hari.' },
  { id:'r2', loc:'rumah', meals:'s', name:'Oat pisang', items:[['oat',1],['pisang',0.5]], tip:'Guna oat biasa (rolled oats), bukan oat segera berperisa.' },
  { id:'r3', loc:'rumah', meals:'s', name:'Capati, dal & telur', items:[['capati',1],['dal',1],['telurr',1]], tip:'Capati beku pun boleh — panaskan tanpa minyak.' },
  { id:'r4', loc:'rumah', meals:'s', name:'Nasi goreng kampung sikit + telur mata', items:[['nasigoreng',1],['telurg',1],['salad',0.5]], tip:'Guna nasi semalam, minyak 1 sudu sahaja, banyakkan sayur.' },
  { id:'r5', loc:'rumah', meals:'s', name:'Ubi keledek & telur rebus', items:[['ubi',1],['telurr',2],['kopio',1]], tip:'Ubi keledek ialah karbo kompleks — tenaga stabil sampai tengah hari.' },
  { id:'r6', loc:'rumah', meals:'s', name:'Roti tuna', items:[['rotig',1],['tunatin',1],['salad',0.5]], tip:'Pilih tuna dalam air, bukan dalam minyak atau mayonis.' },
  { id:'r7', loc:'rumah', meals:'st', name:'Bihun goreng sayur + telur', items:[['bihun',1.5],['telurg',1],['sayurc',1]], tip:'Masukkan sayur lebih dari bihun.' },
  // ---------- RUMAH: tengah hari / malam ----------
  { id:'r10', loc:'rumah', meals:'tm', name:'Nasi + ikan bakar + ulam', items:[['nasi1',1],['ikanb',1],['ulam',1],['sayurc',1]], tip:'Klasik suku-suku separuh. Makan ulam dulu.' },
  { id:'r11', loc:'rumah', meals:'tm', name:'Nasi perang + ayam grill + sayur', items:[['nasib',1],['agrill',1],['sayurr',1]], tip:'Perap ayam dengan kunyit, garam & lada — tak perlu sos manis.' },
  { id:'r12', loc:'rumah', meals:'tm', name:'Asam pedas & kangkung', items:[['nasi1',1],['asampedas',1],['kangkung',1]], tip:'Ambil isi ikan, kuah secukupnya sahaja.' },
  { id:'r13', loc:'rumah', meals:'tm', name:'Nasi + sup ayam + sayur', items:[['nasi1',1],['ayamsup',1],['sayurc',1]], tip:'Sup ayam sesuai bila badan rasa lemah atau masuk angin.' },
  { id:'r14', loc:'rumah', meals:'tm', name:'Telur dadar, tempe & sayur', items:[['nasi1',1],['telurdadar',1],['tempe',1],['sayurc',1]], tip:'Menu jimat & tinggi protein. Goreng tempe guna sedikit minyak.' },
  { id:'r15', loc:'rumah', meals:'m', name:'Ikan kukus + ubi + sayur rebus', items:[['ikanb',1],['ubi',1],['sayurr',1]], tip:'Makan malam ringan tapi cukup — tidur lebih selesa.' },
  { id:'r16', loc:'rumah', meals:'tm', name:'Salad ayam & telur', items:[['salad',1],['agrill',1],['telurr',1],['rotig',0.5]], tip:'Dressing: perahan limau + sedikit minyak zaitun, elak mayonis.' },
  { id:'r17', loc:'rumah', meals:'m', name:'Tauhu, telur & kangkung', items:[['nasib',1],['tauhu',1],['telurr',1],['kangkung',1]], tip:'Tauhu sumber protein murah dan ringan untuk malam.' },
  { id:'r18', loc:'rumah', meals:'t', name:'Daging masak kicap + ulam', items:[['nasi1',1],['dagingm',1],['sayurc',1],['ulam',1]], tip:'Pilih daging tanpa lemak, kicap sikit.' },
  // ---------- RUMAH: snek ----------
  { id:'n1', loc:'rumah', meals:'n', name:'Pisang', items:[['pisang',1]], tip:'Kalium dalam pisang bantu elak kejang & pening.' },
  { id:'n2', loc:'rumah', meals:'n', name:'Epal / oren', items:[['epal',1]], tip:'Makan buah, bukan jus — seratnya buat kenyang.' },
  { id:'n3', loc:'rumah', meals:'n', name:'Yogurt + betik', items:[['yogurt',1],['betik',0.5]], tip:'Yogurt plain bagus untuk perut yang selalu kembung.' },
  { id:'n4', loc:'rumah', meals:'n', name:'Biskut kosong + kopi O', items:[['kraker',1],['kopio',1]], tip:'Snek petang klasik yang ringan.' },
  { id:'n5', loc:'rumah', meals:'n', name:'Telur rebus + timun', items:[['telurr',1],['salad',0.5]], tip:'Snek protein — tahan lapar sampai makan malam.' },
  { id:'n6', loc:'rumah', meals:'n', name:'Kurma + susu rendah lemak', items:[['kurma',1],['susu',1]], tip:'Sesuai bila rasa lemah atau sebelum aktiviti.' },
  { id:'n7', loc:'rumah', meals:'n', name:'Kacang separuh genggam', items:[['kacang',0.5]], tip:'Kacang tinggi kalori — separuh genggam cukup.' },
  { id:'n8', loc:'rumah', meals:'n', name:'Jagung rebus', items:[['jagung',1]], tip:'Tak perlu mentega & susu pekat.' },
  // ---------- LUAR: gerai / warung ----------
  { id:'g1', loc:'luar', venue:'gerai', meals:'s', name:'Nasi lemak biasa + kopi O', items:[['nlemak',1],['kopio',1]], tip:'Minta sambal sikit, tak payah tambah ayam goreng.' },
  { id:'g2', loc:'luar', venue:'gerai', meals:'s', name:'Nasi lemak separuh + telur rebus', items:[['nlemak',0.5],['telurr',1],['kopio',1]], tip:'Kongsi atau minta "nasi sikit" — protein dari telur.' },
  { id:'g3', loc:'luar', venue:'gerai', meals:'s', name:'Kuih 1 biji + 2 telur rebus', items:[['karipap',1],['telurr',2],['kopio',1]], tip:'Satu kuih je — pilih yang tak bergoreng kalau ada.' },
  { id:'g4', loc:'luar', venue:'gerai', meals:'m', name:'Sate 5 cucuk + timun', items:[['sate',1],['kuahkacang',1],['salad',1]], tip:'Kuah kacang 2 sudu je, skip nasi impit kalau dah makan nasi siang.' },
  { id:'g5', loc:'luar', venue:'gerai', meals:'tm', name:'Mee sup tambah sayur', items:[['msup',1],['kopio',1]], tip:'Minta tambah sayur & ayam, kurangkan mee.' },
  // ---------- LUAR: mamak ----------
  { id:'m1', loc:'luar', venue:'mamak', meals:'s', name:'Tosai + dal + teh O', items:[['tosai',1],['dal',1],['kopio',1]], tip:'Tosai lebih ringan dari roti canai.' },
  { id:'m2', loc:'luar', venue:'mamak', meals:'sm', name:'Capati 2 keping + dal', items:[['capati',2],['dal',1],['kopio',1]], tip:'Capati tiada minyak — pilihan paling selamat di mamak.' },
  { id:'m3', loc:'luar', venue:'mamak', meals:'s', name:'Roti canai 1 + telur separuh masak', items:[['rcanai',1],['telurr',2],['kopio',1]], tip:'Satu keping je. Minta kuah dal, bukan kari.' },
  { id:'m4', loc:'luar', venue:'mamak', meals:'tm', name:'Ikan bakar + nasi sikit + sayur', items:[['ikanb',1],['nasi1',1],['sayurc',1],['kopio',1]], tip:'Minta kuah asing supaya boleh kawal.' },
  { id:'m5', loc:'luar', venue:'mamak', meals:'tm', name:'Ayam tandoori + capati + salad', items:[['tandoori',1],['capati',1],['salad',1]], tip:'Tukar naan ke capati — jimat ~150 kcal.' },
  { id:'m6', loc:'luar', venue:'mamak', meals:'tm', name:'Mee sup / mee hoon sup', items:[['msup',1],['kopio',1]], tip:'Minta tambah sayur.' },
  { id:'m7', loc:'luar', venue:'mamak', meals:'t', name:'Nasi kandar ringan', items:[['nasi1',1.5],['agrill',1],['sayurc',1],['kuahkari',1]], tip:'Kuah campur sikit sahaja, minta asing.' },
  // ---------- LUAR: nasi campur ----------
  { id:'c1', loc:'luar', venue:'campur', meals:'tm', name:'Nasi + ikan goreng + 2 sayur', items:[['nasi1',1],['ikang',1],['sayurc',2]], tip:'Formula mudah: 1 senduk nasi, 1 lauk, 2 sayur.' },
  { id:'c2', loc:'luar', venue:'campur', meals:'tm', name:'Nasi + ayam masak merah + ulam', items:[['nasi1',1],['ayammerah',1],['ulam',1],['sayurc',1]], tip:'Ambil isi ayam, kurangkan kuah merah.' },
  { id:'c3', loc:'luar', venue:'campur', meals:'tm', name:'Nasi + asam pedas + sayur', items:[['nasi1',1],['asampedas',1],['sayurc',1]], tip:'Lauk berkuah lebih ringan dari lauk goreng.' },
  { id:'c4', loc:'luar', venue:'campur', meals:'tm', name:'Nasi + telur dadar + tempe + sayur', items:[['nasi1',1],['telurdadar',1],['tempe',1],['sayurc',1]], tip:'Pilihan jimat & tinggi protein.' },
  { id:'c5', loc:'luar', venue:'campur', meals:'tm', name:'Nasi + sup ayam + sayur', items:[['nasi1',1],['ayamsup',1],['sayurc',1]], tip:'Elok untuk perut — tak berminyak.' },
  // ---------- LUAR: kopitiam ----------
  { id:'k1', loc:'luar', venue:'kopitiam', meals:'s', name:'Roti bakar + telur separuh masak', items:[['rotibakar',1],['telurr',2],['kopio',1]], tip:'Minta kaya sikit, tak nak mentega.' },
  { id:'k2', loc:'luar', venue:'kopitiam', meals:'stm', name:'Mee hoon sup', items:[['msup',1],['kopio',1]], tip:'Minta tambah sayur sawi.' },
  { id:'k3', loc:'luar', venue:'kopitiam', meals:'tm', name:'Yong tau foo sup', items:[['yongtau',1],['sayurr',1]], tip:'Pilih tauhu & sayur, kurangkan yang bergoreng.' },
  { id:'k4', loc:'luar', venue:'kopitiam', meals:'t', name:'Nasi ayam panggang (nasi sikit)', items:[['nasi1',1],['agrill',1],['salad',1]], tip:'Minta nasi sikit & ayam panggang, tambah timun.' },
  { id:'k5', loc:'luar', venue:'kopitiam', meals:'m', name:'Chicken chop grill', items:[['chickenchop',1]], tip:'Sos asing, tukar fries ke salad.' },
  // ---------- LUAR: makanan segera ----------
  { id:'f1', loc:'luar', venue:'segera', meals:'tm', name:'Ayam panggang + coleslaw', items:[['agrill',1],['coleslaw',1],['airkosong',1]], tip:'Pilih menu panggang/grill, minum air kosong atau minuman tanpa gula.' },
  { id:'f2', loc:'luar', venue:'segera', meals:'tm', name:'Burger ayam grill tanpa fries', items:[['burger',1],['airkosong',1]], tip:'Skip fries & air manis — jimat ~450 kcal.' },
  { id:'f3', loc:'luar', venue:'segera', meals:'tm', name:'1 ketul ayam goreng + kentang lenyek', items:[['agoreng',1],['mashed',1]], tip:'Buang kulit ayam — jimat ~90 kcal.' },
  // ---------- LUAR: kenduri ----------
  { id:'e1', loc:'luar', venue:'kenduri', meals:'tm', name:'Nasi minyak 1 senduk + ayam merah + acar', items:[['nasiminyak',1],['ayammerah',1],['acar',1],['dal',1]], tip:'Guna pinggan kecil, isi acar & sayur dulu.' },
  { id:'e2', loc:'luar', venue:'kenduri', meals:'tm', name:'Nasi putih + rendang + sayur', items:[['nasi1',1],['rendang',1],['sayurc',1],['acar',1]], tip:'Pilih nasi putih kalau ada — lebih ringan dari nasi minyak.' },
  { id:'e3', loc:'luar', venue:'kenduri', meals:'tm', name:'Pinggan ringan kenduri', items:[['nasiminyak',1],['ayammerah',0.5],['dal',1],['acar',1]], tip:'Separuh ketul ayam, tak perlu tambah pinggan kedua.' },
  // ---------- LUAR: kedai serbaneka (snek) ----------
  { id:'s1', loc:'luar', venue:'kedai', meals:'n', name:'Pisang', items:[['pisang',1]], tip:'Ada di kebanyakan kedai serbaneka.' },
  { id:'s2', loc:'luar', venue:'kedai', meals:'n', name:'Telur rebus 2 biji', items:[['telurr',2]], tip:'Snek protein paling mudah dibeli.' },
  { id:'s3', loc:'luar', venue:'kedai', meals:'n', name:'Yogurt / susu rendah lemak', items:[['yogurt',1]], tip:'Semak label — pilih kurang gula.' },
  { id:'s4', loc:'luar', venue:'kedai', meals:'n', name:'Kacang + air kosong', items:[['kacang',0.5],['airkosong',1]], tip:'Beli paket kecil, jangan paket besar.' },
  { id:'s5', loc:'luar', venue:'kedai', meals:'n', name:'Biskut kosong', items:[['kraker',1]], tip:'Pilih biskut biasa, bukan yang berkrim atau bersalut.' },
  { id:'s6', loc:'luar', venue:'gerai', meals:'n', name:'Jagung rebus', items:[['jagung',1]], tip:'Minta tanpa mentega & susu pekat.' }
];

const MEAL_CODE = { sarapan:'s', tengahari:'t', malam:'m', snek:'n' };
const MEAL_SHARE = { sarapan:0.25, tengahari:0.35, snek:0.10, malam:0.30 };
const MEAL_FLOW = ['sarapan', 'tengahari', 'snek', 'malam'];

function menuItems(m) { return m.items.map(([id, qty]) => ({ f: findFood(id), qty })).filter(x => x.f); }
function menuKcal(m) { return Math.round(menuItems(m).reduce((a, x) => a + x.f.kcal * x.qty, 0)); }
function seeded(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
function nextMeal(meal) { const i = MEAL_FLOW.indexOf(meal); return MEAL_FLOW[Math.min(i + 1, MEAL_FLOW.length - 1)]; }

// How many kcal should this meal be, given what's been eaten and which meals are still to come?
function mealTarget(meal) {
  const p = S.profile, d = peekDay(todayKey()), k = kcalOf(d);
  const remaining = p.kcalMax - k;
  const logged = new Set(d.meals.map(x => x.meal));
  const idx = MEAL_FLOW.indexOf(meal);
  const future = MEAL_FLOW.slice(idx + 1).filter(m => !logged.has(m) && m !== 'snek');
  const futureShare = future.reduce((a, m) => a + MEAL_SHARE[m], 0);
  const isSnack = meal === 'snek';
  let ideal = remaining * MEAL_SHARE[meal] / (MEAL_SHARE[meal] + futureShare);
  let note = '';
  const [lo, hi] = isSnack ? [60, 200] : [300, 700];
  if (remaining <= (isSnack ? 60 : 300)) {
    ideal = lo;
    note = isSnack
      ? 'Kalori hari ini dah hampir cukup. Kalau lapar, pilih buah atau telur rebus.'
      : 'Kalori hari ini dah hampir/lebih sasaran — tak apa. Makan ringan tapi seimbang, jangan skip makan.';
  } else if (!isSnack && ideal > hi) {
    note = k === 0
      ? 'Belum ada makanan dilog hari ini. Kalau terlepas makan, makan dengan cukup ya — jangan terlalu sikit.'
      : `Hari ini baru ${fmt(k)} kcal — makan dengan cukup ya, jangan terlalu sikit.`;
  }
  ideal = Math.round(Math.max(lo, Math.min(hi, ideal)) / 10) * 10;
  return { ideal, remaining, note };
}

function suggestMenus(venue) {
  const s = UI.sug, code = MEAL_CODE[s.meal], t = mealTarget(s.meal);
  const d = peekDay(todayKey()), pc = plateCounts(d);
  const eatenToday = new Set(d.meals.map(x => x.foodId));
  const needVeg = pc.serat < Math.max(1, (pc.protein + pc.karbo) / 2);
  const avoid = avoidSet();
  let pool = MENUS.filter(m => m.meals.includes(code) && m.loc === s.loc && (s.loc === 'rumah' || m.venue === venue)
    && !menuItems(m).some(x => foodTags(x.f).some(t => avoid.has(t))));
  const scored = pool.map(m => {
    const kc = menuKcal(m), its = menuItems(m);
    let score = -Math.abs(kc - t.ideal) / t.ideal * 100;
    if (kc > t.ideal * 1.4) score -= 25;
    if (needVeg && its.some(x => x.f.plate === 'serat')) score += 15;
    if (s.meal !== 'snek' && its.some(x => x.f.plate === 'protein')) score += 6;
    its.forEach(x => { if (eatenToday.has(x.f.id) && x.f.plate !== 'serat' && x.f.id !== 'kopio') score -= 8; });
    if (hasHealth('diabetes')) its.forEach(x => { if (['kurma', 'tehtarik', 'milo', 'sirap', 'rotibakar'].includes(x.f.id)) score -= 40; if (x.f.id === 'nasib') score += 6; });
    if (hasHealth('gastrik')) its.forEach(x => { if (foodTags(x.f).includes('pedas')) score -= 10; });
    score += seeded(todayKey() + s.meal + s.loc + venue + m.id) * 22; // daily variety
    return { m, kc, score };
  }).sort((a, b) => b.score - a.score);
  return { list: scored, t, needVeg };
}

function venuesFor(meal) {
  const code = MEAL_CODE[meal];
  return Object.keys(VENUES).filter(v => MENUS.some(m => m.venue === v && m.meals.includes(code)));
}

function suggestBlock(inSheet = false) {
  const s = UI.sug;
  const vs = venuesFor(s.meal);
  const venue = vs.includes(s.venue) ? s.venue : vs[0];   // don't overwrite the saved choice
  const { list, t, needVeg } = suggestMenus(venue);
  const mealInfo = MEALS.find(m => m.id === s.meal);
  const logged = peekDay(todayKey()).meals.some(x => x.meal === s.meal);
  const showAll = inSheet || UI.sugAll;
  const per = showAll ? 3 : 1, start = list.length > per ? (s.seed * per) % list.length : 0;
  const shown = [...list, ...list].slice(start, start + Math.min(per, list.length));
  const seg = (act, key, cur, opts) => `<div class="seg grid-cols-${Object.keys(opts).length}">${Object.entries(opts).map(([k, l]) => `<button data-act="${act}" data-${key}="${k}" class="tap seg-btn ${cur === k ? 'seg-on' : ''}">${l}</button>`).join('')}</div>`;
  return `
  <div class="flex items-start justify-between gap-2">
    <div><div class="text-[12px] font-semibold text-brand-700">Cadangan menu</div>
      <div class="font-bold text-[16px]">${mealInfo.label}${logged ? ' <span class="text-[12px] font-semibold text-green-700 align-middle">· dah log</span>' : ''}</div></div>
    <div class="text-right shrink-0"><div class="text-[12px] text-slate-500">Sasaran</div><div class="font-extrabold text-[16px]">~${fmt(t.ideal)} <span class="text-[12px] font-semibold text-slate-500">kcal</span></div></div>
  </div>

  <div class="mt-3">${seg('sugMeal', 'meal', s.meal, Object.fromEntries(MEALS.map(m => [m.id, m.short || m.label])))}</div>
  <div class="mt-2">${seg('sugLoc', 'loc', s.loc, { rumah: 'Di rumah', luar: 'Di luar' })}</div>

  ${s.loc === 'luar' ? `<div class="flex gap-2 overflow-x-auto no-scrollbar mt-2 -mx-4 px-4">
    ${vs.map(v => `<button data-act="sugVenue" data-v="${v}" class="tap chip ${venue === v ? 'chip-on' : ''}">${icon(VENUES[v].ic, 'w-4 h-4')}${VENUES[v].label}</button>`).join('')}
  </div>` : ''}

  ${t.note ? `<div class="mt-3 text-[13px] bg-amber-50 text-amber-800 rounded-xl px-3 py-2">${t.note}</div>`
    : needVeg && s.meal !== 'snek' ? `<div class="mt-3 text-[13px] bg-green-50 text-green-800 rounded-xl px-3 py-2">Hari ini kurang sayur — cadangan diutamakan yang ada sayur.</div>` : ''}

  <div class="space-y-2.5 mt-3">
    ${shown.map(({ m, kc }, i) => {
      const its = menuItems(m); const fit = Math.abs(kc - t.ideal) <= t.ideal * 0.2;
      return `
      <div class="rounded-xl border ${i === 0 ? 'border-brand-200 bg-brand-50/40' : 'border-slate-200'} p-3">
        <div class="flex items-start gap-2.5">
          <div class="flex-1 min-w-0">
            ${i === 0 && start === 0 ? '<div class="text-[12px] font-semibold text-brand-700 mb-0.5">Pilihan utama</div>' : ''}
            <div class="font-semibold text-[14px] leading-snug">${esc(m.name)}</div>
            <div class="mt-1 text-[13px] text-slate-500 leading-relaxed">
              ${its.map(x => `<span class="inline-flex items-center gap-1 whitespace-nowrap mr-2"><span class="w-1.5 h-1.5 rounded-full" style="background:${PLATE[x.f.plate || 'lain'].color}"></span>${x.qty !== 1 ? x.qty + '× ' : ''}${esc(x.f.name)}</span>`).join('')}
            </div>
          </div>
          <div class="text-right shrink-0"><div class="font-extrabold text-[16px]">${fmt(kc)}</div><div class="text-[12px] ${fit ? 'text-green-700 font-semibold' : 'text-slate-500'}">${fit ? 'sesuai' : 'kcal'}</div></div>
        </div>
        <div class="text-[13px] text-slate-600 mt-2"><b class="font-semibold">Tip:</b> ${esc(m.tip)}</div>
        <button data-act="logMenu" data-id="${m.id}" class="tap mt-2.5 w-full btn ${i === 0 ? 'btn-primary' : 'btn-secondary'} py-2 text-[14px]">${icon('plus', 'w-4 h-4')}Log menu ini</button>
      </div>`; }).join('') || `<div class="text-center text-[14px] text-slate-500 py-4">Tiada menu yang sesuai dengan pilihan makanan anda di sini. Cuba tempat lain atau ubah pilihan di Profil.</div>`}
  </div>

  <div class="flex gap-2 mt-3">
    ${!showAll && list.length > 1 ? `<button data-act="sugMore" class="tap flex-1 btn btn-secondary py-2.5 text-[14px]">Lihat ${Math.min(2, list.length - 1)} lagi</button>` : ''}
    ${list.length > per ? `<button data-act="sugShuffle" class="tap flex-1 btn btn-secondary py-2.5 text-[14px]">${icon('refresh', 'w-4 h-4')}Cadangan lain</button>` : ''}
  </div>
  ${AI_ENDPOINT ? `<button data-act="askAI" class="tap mt-2 w-full btn btn-secondary py-2.5 text-[14px]">${icon('lightbulb', 'w-4 h-4')}Tanya Coach AI — soalan bebas</button>` : ''}`;
}

// Context the AI coach (Enjin B) will receive later — no name, no weight history.
function buildAIContext(extra = {}, meal = UI.sug.meal) {
  const d = peekDay(todayKey()), p = S.profile, general = meal === 'umum';
  const t = mealTarget(general ? 'snek' : meal);
  return {
    meal, location: general ? null : UI.sug.loc, venue: !general && UI.sug.loc === 'luar' ? UI.sug.venue : null,
    remainingKcal: (p.kcalMax || 0) - kcalOf(d),
    nowMeal: guessMeal(), mealTargets: Object.fromEntries(MEALS.map(m => [m.id, mealTarget(m.id).ideal])), dailyRange: [p.kcalMin, p.kcalMax], minDailyKcal: kcalFloor(p),
    eatenToday: d.meals.map(m => ({ meal: m.meal, name: m.name, kcal: m.kcal, plate: m.plate || 'lain', qty: m.qty || 1 })),
    avoid: p.avoid || [], allergies: p.allergies || [], noSpicy: !!p.noSpicy,
    health: S.settings.ai?.health === false ? [] : (p.health || []),   // user can choose not to share health notes
    // The app presets (foods.js) already live on the server; only the user's own foods are sent.
    catalog: S.customFoods.filter(f => !foodConflicts(f).length).slice(0, 60).map(f => ({ name: f.name, unit: f.unit, kcal: f.kcal })), ...extra
  };
}


/* ---------- COACH AI (Enjin B) ---------- */
const AI_CHIPS = [
  'Apa yang sesuai saya makan sekarang?',
  'Ada telur, kobis & ayam di rumah. Nak masak apa?',
  'Saya kat kenduri. Apa pilihan terbaik?',
  'Snek sihat bawah 150 kcal?'
];
const AI_CHIPS_GENERAL = [
  'Nasi lemak biasa berapa kalori?',
  'Boleh makan buah waktu malam?',
  'Teh tarik kurang manis okay tak?',
  'Macam mana nak kurangkan nasi sikit-sikit?'
];
const AI_ERRORS = {
  offline: 'Tiada internet. Coach AI perlukan sambungan — cadangan menu biasa masih berfungsi offline.',
  not_configured: 'Coach AI belum disediakan di server.',
  rate_limited: 'Terlalu banyak soalan dalam masa singkat. Cuba lagi dalam beberapa minit.',
  quota_unavailable: 'Coach AI rehat sekejap. Cuba lagi dalam beberapa minit — cadangan menu biasa masih boleh digunakan.',
  default: 'Coach AI tak dapat dihubungi sekarang. Cuba lagi sekejap lagi.'
};
// Coach AI has a usage limit per phone (checked on the server). The id is random and holds no personal data.
function deviceId() {
  try {
    let id = localStorage.getItem('dietpal.device');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('dietpal.device', id); }
    return id;
  } catch { return ''; }
}
const waitText = s => s > 3600 ? 'esok' : `dalam ${Math.max(1, Math.ceil(s / 60))} minit`;
function quotaError(d) {
  return d.scope === 'day' ? 'Had Coach AI untuk hari ini dah habis. Boleh tanya lagi esok.'
    : `Coach AI rehat sekejap. Boleh tanya lagi ${waitText(d.retry_after)}.`;
}
function quotaNote(q) {
  if (!q || q.left > 0.3) return '';
  return `<div class="mt-3 text-[13px] text-slate-500 flex items-center gap-1.5">${icon('alert', 'w-4 h-4')}${q.left <= 0
    ? `Had Coach AI dah habis buat masa ini. Boleh tanya lagi ${waitText(q.reset_in)}.`
    : `Had Coach AI hampir habis. Reset ${waitText(q.reset_in)}.`}</div>`;
}
UI.ai = { q: '', loading: false, result: null, error: '', logged: {} };
// Safety net: flag AI items whose names hint at something the user avoids
// Whole words / phrases only ("tuna" won't match inside another word). Dishes that usually hide an
// ingredient are listed too (nasi lemak → ikan bilis, sate → kuah kacang, teh tarik → susu pekat).
const TAG_WORDS = {
  ayam: ['ayam', 'chicken'],
  daging: ['daging', 'lembu', 'kambing', 'beef', 'mutton', 'rendang', 'kurma daging', 'burger daging', 'bebola daging'],
  ikan: ['ikan', 'tuna', 'sardin', 'bilis', 'salmon', 'keli', 'tilapia', 'kembung', 'yong tau', 'nasi lemak', 'laksa', 'asam pedas'],
  laut: ['udang', 'sotong', 'ketam', 'kerang', 'belacan', 'cencaru', 'seafood', 'sambal belacan', 'cincalok', 'budu', 'mee udang'],
  kacang: ['kacang', 'badam', 'peanut', 'gajus', 'sate', 'satay', 'kuah kacang', 'gado-gado', 'rojak', 'pecal'],
  telur: ['telur', 'egg', 'mayonis', 'mayo', 'roti telur', 'kuey teow goreng'],
  susu: ['susu', 'yogurt', 'keju', 'cheese', 'mentega', 'butter', 'teh tarik', 'milo', 'latte', 'cappuccino', 'aiskrim', 'kopi susu', 'teh susu'],
  pedas: ['pedas', 'sambal', 'cili', 'chili', 'masak merah', 'kari', 'asam pedas', 'tomyam', 'tom yam']
};
// A word only counts when the dish isn't clearly something else: "rendang ayam" is chicken, not beef.
const TAG_UNLESS = { daging: /\b(ayam|ikan|udang|sotong|tauhu|tempe|sayur|telur)\b/ };
const TAG_RE = Object.fromEntries(Object.entries(TAG_WORDS).map(([t, ws]) =>
  [t, new RegExp(`(^|[^a-z])(${ws.map(w => w.replace(/[-]/g, '\\$&')).join('|')})(?=$|[^a-z])`, 'i')]));
function nameTags(name) {
  const n = String(name).toLowerCase();
  return Object.keys(TAG_RE).filter(t => {
    if (!TAG_RE[t].test(n)) return false;
    // daging matched only through "rendang"/"kurma": skip when another protein is named
    if (TAG_UNLESS[t] && !/\b(daging|lembu|kambing|beef|mutton)\b/.test(n) && TAG_UNLESS[t].test(n)) return false;
    return true;
  });
}
function aiConflicts(name) { const a = avoidSet(); return nameTags(name).filter(t => a.has(t)); }

function sheetAI(meal = UI.sug.meal) {
  UI.ai = { q: '', meal, loading: false, result: null, error: '', logged: {}, pickFor: null };
  openSheet(aiBody, true);
}
const AI_MEALS = [...MEALS.map(m => [m.id, m.short || m.label]), ['umum', 'Umum']];
// Asked once before the first Coach AI question (health notes are sensitive personal data).
function aiConsentHtml() {
  const hasHealth = (S.profile.health || []).length > 0;
  return `<div class="px-5 pb-6 pt-4">
    <div class="font-bold text-[16px]">Sebelum bertanya</div>
    <p class="text-[14px] text-slate-600 mt-1 leading-relaxed">Coach AI dijana oleh <b>OpenAI</b> (Amerika Syarikat). Bila anda tanya, maklumat ini dihantar:</p>
    <ul class="mt-2 space-y-1.5 text-[14px] text-slate-700">
      <li class="flex gap-2">${icon('check', 'w-4 h-4 mt-0.5 shrink-0 text-brand-700', 2.5)}Soalan anda dan makanan yang dilog hari ini</li>
      <li class="flex gap-2">${icon('check', 'w-4 h-4 mt-0.5 shrink-0 text-brand-700', 2.5)}Sasaran kalori, pantang & alahan, makanan sendiri</li>
      ${hasHealth ? `<li class="flex gap-2">${icon('check', 'w-4 h-4 mt-0.5 shrink-0 text-brand-700', 2.5)}Nota kesihatan (jika dibenarkan di bawah)</li>` : ''}
    </ul>
    <p class="text-[13px] text-slate-500 mt-2">Nama dan berat <b>tidak</b> dihantar. OpenAI tidak guna data ini untuk melatih model, dan menyimpannya hingga 30 hari untuk kawalan penyalahgunaan.</p>
    ${hasHealth ? `<div class="mt-3 rounded-xl bg-slate-50 px-3">${toggleRow('aiToggle', 'health', S.settings.ai?.health !== false, 'Kongsi nota kesihatan', 'Supaya cadangan elak gula, garam atau pedas ikut keadaan anda')}</div>` : ''}
    <button data-act="aiConsent" class="tap mt-4 w-full btn btn-primary py-3 text-[16px]">Setuju & teruskan</button>
    <button data-act="privacy" class="tap mt-2 w-full btn btn-text py-2 text-[14px]">Baca notis privasi</button>
    <p class="text-[12px] text-slate-500 mt-1 text-center">Boleh ditukar atau ditarik balik di Tetapan → Privasi.</p>
  </div>`;
}
function privacyBody() {
  const sec = (title, body) => `<div class="mt-4"><div class="font-bold text-[15px]">${title}</div><div class="text-[14px] text-slate-600 mt-1 leading-relaxed space-y-1.5">${body}</div></div>`;
  return `<div class="sticky top-0 bg-white z-10 px-5 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between">
      <div class="font-bold text-xl">Privasi & data</div>
      <button data-act="${sheetBack ? 'privacyBack' : 'closeSheet'}" class="tap w-9 h-9 grid place-items-center rounded-xl text-slate-500" aria-label="Tutup">${icon('x')}</button>
    </div>
    <div class="px-5 pb-8">
    ${sec('Dalam telefon anda', '<p>Profil, makanan, air, berat dan tetapan disimpan dalam telefon ini sahaja. DietPal tiada akaun dan tiada salinan di server. Padam bila-bila masa: Tetapan → <b>Padam semua data</b>.</p>')}
    ${sec('Notifikasi (Supabase, Singapura)', '<p>Untuk hantar peringatan pada masa yang betul: alamat notifikasi telefon, zon waktu, waktu makan & pilihan peringatan, dan status hari ini (waktu makan yang dah dilog — ya/tidak, jumlah air, jumlah kalori, tarikh timbang terakhir).</p><p>Nama, berat dan senarai makanan <b>tidak</b> dihantar. Data ini dipadam bila notifikasi dimatikan atau data dipadam.</p>')}
    ${sec('Coach AI (OpenAI, Amerika Syarikat)', `<p>Hanya bila anda bertanya: soalan, makanan yang dilog hari ini, sasaran kalori, pantang & alahan, makanan sendiri${(S.profile.health || []).length ? ', dan nota kesihatan jika dibenarkan' : ''}. Nama dan berat tidak dihantar.</p><p>OpenAI tidak guna data API untuk melatih model, dan menyimpannya hingga 30 hari untuk kawalan penyalahgunaan sebelum dipadam.</p>`)}
    ${sec('Had penggunaan Coach AI', '<p>Untuk had soalan, server simpan ID rawak telefon (bukan nama atau nombor telefon) dan alamat IP dalam bentuk hash, bersama kiraan token. Rekod dipadam selepas 2 hari tidak digunakan.</p>')}
    ${sec('Hosting (Vercel)', '<p>Seperti laman web biasa, pelayan mencatat log akses teknikal (cth alamat IP) untuk keselamatan.</p>')}
    ${sec('Pilihan anda', `<p>Tukar atau tarik balik persetujuan Coach AI dan perkongsian nota kesihatan di Tetapan → Privasi. Matikan jenis peringatan di Tetapan → Peringatan.</p>`)}
    <p class="text-[12px] text-slate-500 mt-5">DietPal ialah panduan gaya hidup, bukan perkhidmatan perubatan.</p>
    </div>`;
}
let sheetBack = null;   // privacy notice opened from another sheet → close returns there
function openPrivacy() { sheetBack = sheetFn && sheetFn !== privacyBody ? sheetFn : null; openSheet(privacyBody, true); }

function aiBody() {
  const a = UI.ai, s = UI.sug, general = a.meal === 'umum';
  const where = s.loc === 'luar' ? `Di luar${VENUES[s.venue] ? ' · ' + VENUES[s.venue].label : ''}` : 'Di rumah';
  const sub = general ? 'Soalan umum tentang pemakanan' : `${where} · sasaran ~${fmt(mealTarget(a.meal).ideal)} kcal`;
  return `
  <div class="sticky top-0 bg-white z-10 px-5 pt-4 pb-3 border-b border-slate-100">
    <div class="flex items-center justify-between">
      <div class="font-bold text-xl">Tanya Coach AI</div>
      <button data-act="closeSheet" class="tap w-9 h-9 grid place-items-center rounded-xl text-slate-500" aria-label="Tutup">${icon('x')}</button>
    </div>
    <div class="seg grid-cols-5 mt-2">
      ${AI_MEALS.map(([id, l]) => `<button data-act="aiMeal" data-meal="${id}" class="tap seg-btn ${a.meal === id ? 'seg-on' : ''}">${l}</button>`).join('')}
    </div>
    <div class="text-[13px] text-slate-500 mt-2">${sub}</div>
  </div>
  ${!S.settings.ai?.consent ? aiConsentHtml() : `<div class="px-5 pb-6 pt-3">
    <textarea id="aiQ" maxlength="300" rows="3" placeholder="${general ? 'Cth: Nasi lemak berapa kalori? Boleh makan buah waktu malam?' : 'Cth: Saya kat kenduri, ada nasi minyak & dalca. Apa patut ambil?'}" class="w-full bg-slate-50 rounded-xl px-4 py-3 text-[16px] outline-none focus:ring-2 focus:ring-brand-500 resize-none">${esc(a.q)}</textarea>
    <div class="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 mt-2">
      ${(general ? AI_CHIPS_GENERAL : AI_CHIPS).map((c, i) => `<button data-act="aiChip" data-i="${i}" class="tap chip">${c}</button>`).join('')}
    </div>
    <button data-act="aiAsk" class="tap mt-3 w-full btn btn-primary py-3 text-[16px]" ${a.loading ? 'disabled' : ''}>${a.loading ? 'Coach sedang fikir…' : 'Tanya'}</button>
    <p class="text-[12px] text-slate-500 mt-2">Soalan anda, ringkasan makanan hari ini, pilihan makanan${S.settings.ai?.health === false ? '' : ' & nota kesihatan'} dihantar ke OpenAI untuk jawapan. Nama dan berat tidak dihantar. <button data-act="privacy" class="font-semibold text-brand-700 underline underline-offset-2">Privasi</button></p>

    ${a.loading ? `<div class="mt-4 space-y-2">${[1, 2].map(() => '<div class="h-20 rounded-xl bg-slate-100 animate-pulse"></div>').join('')}</div>` : ''}

    ${a.error ? `
      <div class="mt-4 text-[14px] bg-amber-50 text-amber-800 rounded-xl p-3">${a.error}</div>
      <button data-act="aiFallback" class="tap mt-2 w-full btn btn-secondary py-2.5 text-[14px]">Guna cadangan menu biasa</button>` : ''}

    ${a.result ? aiResultHtml(a.result) : ''}
  </div>`}`;
}
function aiResultHtml(r) {
  return `
    <div class="mt-4">
      ${r.safety_note ? `<div class="mb-3 bg-red-50 border border-red-200 rounded-xl p-3 text-[14px] text-red-800 flex gap-2"><span class="text-red-600 mt-0.5">${icon('alert', 'w-5 h-5')}</span><span>${esc(r.safety_note)}</span></div>` : ''}
      ${r.reply ? `<div class="flex gap-3"><img src="icons/icon-192.png" alt="" class="w-9 h-9 rounded-xl shrink-0"><p class="text-[14px] text-slate-700 leading-relaxed">${esc(r.reply)}</p></div>` : ''}
      <div class="space-y-2.5 mt-3">
        ${(r.menus || []).map((m, i) => `
          <div class="rounded-xl border border-slate-200 p-3">
            <div class="flex items-start gap-2.5">
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-[14px] leading-snug">${esc(m.name)}</div>
                <div class="mt-1 text-[13px] text-slate-500 leading-relaxed">
                  ${m.items.map(x => `<span class="inline-flex items-center gap-1 whitespace-nowrap mr-2"><span class="w-1.5 h-1.5 rounded-full" style="background:${PLATE[x.plate || 'lain'].color}"></span>${esc(x.name)} <span class="text-slate-400">${(x.qty || 1) !== 1 ? x.qty + ' × ' : ''}${esc(x.unit)}</span></span>`).join('')}
                </div>
                ${(() => { const c = [...new Set(m.items.flatMap(x => aiConflicts(x.name)))]; return c.length ? `<div class="mt-1.5 text-[13px] font-semibold text-amber-700 flex items-center gap-1">${icon('alert', 'w-4 h-4')}Ada ${c.map(t => TAG_LABEL[t]).join(', ')} — tak sesuai dengan pilihan anda</div>` : ''; })()}
              </div>
              <div class="text-right shrink-0"><div class="font-extrabold text-[16px]">~${fmt(m.kcal)}</div>
                <div class="text-[12px] ${m.offTarget ? 'text-amber-700 font-semibold' : r.range ? 'text-green-700 font-semibold' : 'text-slate-500'}">${m.offTarget === 'low' ? 'bawah sasaran' : m.offTarget === 'high' ? 'atas sasaran' : r.range ? 'sesuai' : 'kcal'}</div></div>
            </div>
            ${m.tip ? `<div class="text-[13px] text-slate-600 mt-2"><b class="font-semibold">Tip:</b> ${esc(m.tip)}</div>` : ''}
            ${m.adjusted ? `<div class="text-[12px] text-slate-500 mt-1">Sukatan dilaraskan ikut sasaran kalori anda.</div>` : ''}
            ${UI.ai.logged[i]
              ? `<div class="mt-2.5 text-[14px] font-semibold text-green-700 flex items-center justify-center gap-1.5 py-2">${icon('check', 'w-4 h-4', 2.5)}Dah dilog ke ${MEALS.find(x => x.id === UI.ai.logged[i]).label}</div>`
              : UI.ai.pickFor === i
                ? `<div class="mt-2.5"><div class="text-[12px] font-semibold text-slate-500 mb-1.5">Log ke waktu makan:</div>
                    <div class="grid grid-cols-4 gap-1.5">${MEALS.map(x => `<button data-act="aiLogTo" data-i="${i}" data-meal="${x.id}" class="tap btn btn-secondary py-2 text-[12px]">${x.short || x.label}</button>`).join('')}</div></div>`
                : `<button data-act="aiLog" data-i="${i}" class="tap mt-2.5 w-full btn btn-secondary py-2 text-[14px]">${icon('plus', 'w-4 h-4')}${(() => { const lm = MEALS.find(x => x.id === (r.meal || UI.ai.meal)); return lm ? 'Log ke ' + lm.label : 'Log menu ini'; })()}</button>`}
          </div>`).join('')}
      </div>
      <p class="text-[12px] text-slate-500 mt-3">Jawapan dijana oleh AI. Kalori ialah anggaran — semak semula jika ada alahan.</p>
      ${quotaNote(r.quota)}
    </div>`;
}
async function aiAsk() {
  const box = document.getElementById('aiQ'); if (box) UI.ai.q = box.value.trim().slice(0, 300);
  if (UI.ai.loading) return;
  if (!navigator.onLine) { UI.ai.error = AI_ERRORS.offline; UI.ai.result = null; refreshSheet(); return; }
  UI.ai.loading = true; UI.ai.error = ''; UI.ai.result = null; UI.ai.logged = {}; refreshSheet();
  try {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 30000);
    const r = await fetch(AI_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ question: UI.ai.q, device: deviceId(), context: buildAIContext({}, UI.ai.meal) }) });
    clearTimeout(timer);
    const data = await r.json().catch(() => ({}));
    if (r.status === 429 && data.error === 'quota') { UI.ai.error = quotaError(data); }
    else if (!r.ok) throw new Error(data.error || 'default');
    else UI.ai.result = data;
  } catch (e) {
    UI.ai.error = AI_ERRORS[e.message] || AI_ERRORS.default;
  }
  UI.ai.loading = false;
  if (sheetFn === aiBody) refreshSheet();
}
function aiLog(i, meal = UI.ai.result?.meal || UI.ai.meal) {
  const m = UI.ai.result?.menus?.[i]; if (!m || UI.ai.logged[i]) return;
  if (meal === 'umum') { UI.ai.pickFor = i; refreshSheet(); return; }   // ask which meal first
  m.items.forEach(x => addMeal({ id: 'ai_' + uid(), name: x.name, unit: x.unit, kcal: x.kcal, plate: x.plate }, x.qty || 1, meal));
  UI.ai.logged[i] = meal; UI.ai.pickFor = null; render(); refreshSheet();
  toast(`${m.name} dilog ke ${MEALS.find(x => x.id === meal).label}`);
}

function sheetSuggest() {
  openSheet(() => `<div class="p-5"><div class="w-10 h-1.5 rounded-full bg-slate-200 mx-auto mb-4"></div>${suggestBlock(true)}</div>`);
}

/* ============================================================
   PROFILE, TARGETS, FOOD PREFERENCES, HEALTH, SETTINGS
   ============================================================ */
const APP_VERSION = '1.6.6';
const ACTIVITY = {
  rendah:    { label: 'Kurang aktif', d: 'Kerja pejabat, jarang bersenam', f: 1.2 },
  sederhana: { label: 'Sederhana', d: 'Banyak berjalan / senam ringan 1–3 kali seminggu', f: 1.375 },
  aktif:     { label: 'Aktif', d: 'Kerja fizikal / bersenam 4+ kali seminggu', f: 1.55 }
};
const PACE = {
  '0.25': { label: 'Perlahan', d: '0.25 kg seminggu' },
  '0.5':  { label: 'Sederhana', d: '0.5 kg seminggu · disyorkan' },
  '0.75': { label: 'Laju', d: '0.75 kg seminggu' }
};
const AVOID = { daging: 'Daging lembu / kambing', ayam: 'Ayam', ikan: 'Ikan', laut: 'Makanan laut & belacan' };
const ALLERGY = { kacang: 'Kacang', telur: 'Telur', susu: 'Susu / laktosa' };
const HEALTH = { diabetes: 'Kencing manis', bp: 'Darah tinggi', gastrik: 'Gastrik' };
const TAG_LABEL = { daging: 'daging', ayam: 'ayam', ikan: 'ikan', laut: 'makanan laut', kacang: 'kacang', telur: 'telur', susu: 'susu', pedas: 'pedas' };
const HARI_PENUH = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];

// Ingredients/allergens per food id (used for filtering menus and flagging foods)
const FOOD_TAGS = {
  agrill: 'ayam', agoreng: 'ayam', nayam: 'ayam', ayamsup: 'ayam', ayammerah: 'ayam,pedas', tandoori: 'ayam', sate: 'ayam',
  chickenchop: 'ayam', burger: 'ayam', dagingm: 'daging', rendang: 'daging,pedas',
  ikanb: 'ikan', ikang: 'ikan', asampedas: 'ikan,pedas', tunatin: 'ikan', yongtau: 'ikan,laut',
  kangkung: 'laut,pedas', ulam: 'laut,pedas', nlemak: 'ikan,telur,kacang,pedas', mgoreng: 'telur,laut,pedas', ktgoreng: 'telur,laut',
  telurr: 'telur', telurg: 'telur', telurdadar: 'telur', rtelur: 'telur', rotibakar: 'telur,susu', coleslaw: 'telur',
  susu: 'susu', yogurt: 'susu', oat: 'susu', tehtarik: 'susu', kopisusu: 'susu', milo: 'susu', sirap: 'susu', mashed: 'susu',
  kacang: 'kacang', kuahkacang: 'kacang', kuahkari: 'pedas'
};
function foodTags(f) { return (FOOD_TAGS[f.id] || f.tags || '').split(',').filter(Boolean); }
function avoidSet() {
  const p = S.profile;
  return new Set([...(p.avoid || []), ...(p.allergies || []), ...(p.noSpicy ? ['pedas'] : [])]);
}
function foodConflicts(f) { const a = avoidSet(); return foodTags(f).filter(t => a.has(t)); }
function hasHealth(k) { return (S.profile.health || []).includes(k); }

// ---------- targets ----------
function kcalFloor(p = S.profile) { return p.sex === 'P' ? 1200 : 1500; }
function canAuto(p = S.profile) { return !!(p.sex && p.age > 0 && p.height > 0 && p.activity); }
function autoWater(kg) { return Math.round(Math.min(3500, Math.max(2000, kg * 30)) / 100) * 100; }
function calcTargets(p = S.profile, kg = currentWeight()) {
  const bmr = 10 * kg + 6.25 * p.height - 5 * p.age + (p.sex === 'L' ? 5 : -161);   // Mifflin-St Jeor
  const tdee = bmr * ACTIVITY[p.activity || 'rendah'].f;
  const deficit = Math.round(parseFloat(p.pace || '0.5') * 7700 / 7);
  const floor = kcalFloor(p), center = tdee - deficit;
  let min = Math.round((center - 100) / 50) * 50, max = Math.round((center + 100) / 50) * 50;
  const floorHit = min < floor;
  min = Math.max(floor, min); max = Math.max(min + 200, max);
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), deficit, min, max, water: autoWater(kg), floorHit };
}
function recalcTargets() {
  const p = S.profile;
  if (p.kcalMode === 'auto' && canAuto(p)) { const t = calcTargets(p); p.kcalMin = t.min; p.kcalMax = t.max; }
  if (p.waterMode === 'auto' && currentWeight()) { p.waterGoal = autoWater(currentWeight()); p.waterIdeal = Math.min(4000, p.waterGoal + 500); }
  p.kcalMin = Math.max(kcalFloor(p), p.kcalMin || 0);   // safety floor applies in manual mode too
  p.kcalMax = Math.max(p.kcalMin, p.kcalMax || 0);
}
function minHealthyWeight(p = S.profile) { const h = p.height / 100; return Math.ceil(18.5 * h * h * 10) / 10; }
function healthyRange(p = S.profile) { const h = p.height / 100; return [Math.ceil(18.5 * h * h), Math.floor(22.9 * h * h)]; }
function autoMilestones(cur, target) {
  const out = []; let m = Math.floor(cur - 10), i = 1;
  while (m > target + 3) { out.push({ name: 'Fasa ' + i, kg: m }); i++; m -= 10; }
  out.push({ name: 'Berat sasaran', kg: target });
  return out;
}
function initials() { const n = (S.profile.name || '').trim(); return n ? esc(n[0].toUpperCase()) : icon('user', 'w-5 h-5'); }

// ---------- meal times ----------
function mins(t) { const [h, m] = String(t || '00:00').split(':').map(Number); return h * 60 + (m || 0); }
function mealTimes() { return (typeof S !== 'undefined' && S.settings?.mealTimes) || DEFAULTS.settings.mealTimes; }

// ---------- theme ----------
function applyTheme() {
  const st = S.settings, mq = window.matchMedia('(prefers-color-scheme: dark)');
  const dark = st.theme === 'dark' || (st.theme === 'auto' && mq.matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.classList.toggle('big', st.textSize === 'big');
  document.querySelector('meta[name=theme-color]').setAttribute('content', dark ? '#101713' : '#1e6b4a');
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (S.settings.theme === 'auto') applyTheme(); });

// ---------- in-app reminders ----------
function dismissedToday() { if (S.dismissed?.date !== todayKey()) S.dismissed = { date: todayKey(), ids: [] }; return S.dismissed.ids; }
function reminders() {
  if (!S.profile.setupDone) return [];
  const r = S.settings.reminders, out = [], now = new Date(), nowM = now.getHours() * 60 + now.getMinutes();
  const d = peekDay(todayKey()), mt = mealTimes(), dis = dismissedToday();
  if (r.weigh && now.getDay() === Number(r.weighDay) && !S.weights.some(w => w.date === todayKey()))
    out.push({ id: 'weigh', icon: 'scale', text: 'Hari timbang berat! Timbang pagi, lepas ke tandas, sebelum makan.', btn: 'Log berat', act: 'data-act="tab" data-tab="weight"' });
  if (r.meals) {
    const sa = S.profile.setupAt ? new Date(S.profile.setupAt) : null;
    const setupM = sa && todayKey(sa) === todayKey() ? sa.getHours() * 60 + sa.getMinutes() : -1;
    const missed = ['malam', 'tengahari', 'sarapan'].find(m => nowM >= mins(mt[m]) + 90 && mins(mt[m]) + 90 > setupM && !d.meals.some(x => x.meal === m));
    if (missed) { const lbl = MEALS.find(x => x.id === missed).label.toLowerCase();
      out.push({ id: 'meal-' + missed, icon: 'utensils', text: `Dah makan ${lbl}? Jangan lupa log — atau tengok cadangan menu.`, btn: 'Log', act: `data-act="quickMeal" data-meal="${missed}"` }); }
  }
  const h = now.getHours();
  if (r.water && h >= 9 && h < 22) {
    const expected = Math.max(0, Math.min(1, (h - 7) / 14)) * S.profile.waterGoal;
    if (d.water < expected - 500) out.push({ id: 'water-' + Math.floor(h / 2), icon: 'droplet', text: `Air baru ${fmt(d.water)} ml. Minum segelas sekarang.`, btn: '+250 ml', act: 'data-act="water" data-ml="250"' });
  }
  if (backupDue()) out.push({ id: 'backup', icon: 'download', text: 'Data hanya ada dalam telefon ini. Simpan backup supaya tak hilang bila tukar atau reset telefon.', btn: 'Backup', act: 'data-act="export"' });
  return out.filter(x => !dis.includes(x.id));
}
// Backup nudge: after a week of use, then every 30 days since the last backup (snoozed 7 days when closed).
function backupDue(now = Date.now()) {
  const b = S.backup || {}, day = 864e5;
  const since = S.profile.setupAt || 0;
  if (!since || now - since < 7 * day) return false;
  if (b.snoozeAt && now - b.snoozeAt < 7 * day) return false;
  return !b.lastAt || now - b.lastAt > 30 * day;
}
function remindersBlock() {
  const list = reminders(); if (!list.length) return '';
  return list.map(x => `
    <div class="flex items-center gap-2.5 bg-white border border-amber-200 rounded-xl px-3 py-2.5 shadow-card">
      <span class="text-amber-700">${icon(x.icon)}</span>
      <div class="flex-1 text-[13px] text-slate-700 leading-snug">${x.text}</div>
      <button ${x.act} class="tap shrink-0 btn btn-primary text-[13px] px-3 py-1.5">${x.btn}</button>
      <button data-act="dismissRem" data-id="${esc(x.id)}" class="tap shrink-0 w-8 h-8 grid place-items-center text-slate-500" aria-label="Tutup">${icon('x', 'w-4 h-4')}</button>
    </div>`).join('');
}
const remShown = new Set();
function checkReminders() {
  if (document.hidden || sheetFn) return;
  const fresh = reminders().filter(x => !remShown.has(x.id));
  fresh.forEach(x => remShown.add(x.id));
  if (fresh.length) { toast(fresh[0].text.split(/[.!—]/)[0]); if (UI.tab === 'home') render(); }
}
setInterval(checkReminders, 60000);

// ---------- shared UI bits ----------
const chip = (act, k, v, on, label, extra = '') => `<button data-act="${act}" data-k="${k}" data-v="${v}" ${extra} class="tap chip ${on ? 'chip-on' : ''}">${on ? icon('check', 'w-4 h-4', 2.5) : ''}${label}</button>`;
const selectField = (id, label, val, opts) => `<div><label class="block text-[12px] font-semibold text-slate-500">${label}</label>
  <select id="${id}" class="w-full mt-1 bg-slate-50 rounded-xl px-3 py-2.5 outline-none">${Object.entries(opts).map(([k, v]) => `<option value="${k}" ${String(val) === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`;
const toggleRow = (act, k, on, label, sub = '') => `
  <button data-act="${act}" data-k="${k}" class="tap w-full flex items-center gap-3 py-2.5 text-left">
    <div class="flex-1"><div class="text-[14px] font-semibold">${label}</div>${sub ? `<div class="text-[12px] text-slate-500">${sub}</div>` : ''}</div>
    <div class="w-11 h-6 rounded-full p-0.5 transition-colors ${on ? 'bg-brand-600' : 'bg-slate-300'}"><div class="w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}"></div></div>
  </button>`;
const val = (id) => document.getElementById(id)?.value;
const numVal = (id) => { const v = parseFloat(val(id)); return isFinite(v) ? v : null; };

/* ---------- ONBOARDING ---------- */
function viewOnboard() {
  const o = UI.ob, d = o.d, steps = 7;
  const dots = `<div class="flex gap-1.5 justify-center mb-5">${Array.from({ length: steps }, (_, i) => `<div class="h-1.5 rounded-full ${i <= o.step ? 'bg-brand-600 w-6' : 'bg-slate-200 w-3'}"></div>`).join('')}</div>`;
  const nav = (next = 'Seterusnya') => `
    <div class="flex gap-2 mt-6">
      ${o.step > 0 ? `<button data-act="obBack" class="tap btn btn-secondary px-5 py-3.5">Kembali</button>` : ''}
      <button data-act="obNext" class="tap flex-1 btn btn-primary py-3.5">${next}</button>
    </div>`;
  let body = '';
  if (o.step === 0) body = `
    <div class="text-center"><img src="icons/icon-192.png" class="w-20 h-20 rounded-2xl mx-auto" alt="">
      <h1 class="text-2xl font-extrabold mt-4 text-brand-900">Selamat datang ke DietPal</h1>
      <p class="text-[14px] text-slate-500 mt-1">Jom kenal diri anda dulu, supaya Coach boleh kira sasaran yang sesuai untuk anda.</p></div>
    <div class="mt-6">${field('obName', 'Nama panggilan', d.name || '', 'text')}</div>
    <p class="text-[13px] text-slate-500 mt-3">Semua maklumat disimpan dalam telefon ini sahaja.</p>${nav('Mula')}
    <label class="tap mt-3 w-full btn btn-text py-2.5 text-[14px] cursor-pointer">${icon('upload', 'w-4 h-4')}Ada fail backup? Pulihkan data<input id="importFile" type="file" accept="application/json" class="hidden"></label>`;
  if (o.step === 1) body = `
    <h2 class="text-xl font-extrabold">Tentang diri anda</h2>
    <div class="text-[12px] font-semibold text-slate-500 mt-4 mb-1.5">Jantina</div>
    <div class="grid grid-cols-2 gap-2">${chip('obSet', 'sex', 'L', d.sex === 'L', 'Lelaki')}${chip('obSet', 'sex', 'P', d.sex === 'P', 'Perempuan')}</div>
    <div class="grid grid-cols-2 gap-3 mt-4">${field('obAge', 'Umur (tahun)', d.age ?? '')}${field('obHeight', 'Tinggi (cm)', d.height ?? '')}</div>
    <p class="text-[12px] text-slate-500 mt-3">Jantina, umur dan tinggi digunakan untuk kira keperluan tenaga harian (TDEE).</p>${nav()}`;
  if (o.step === 2) {
    const [lo, hi] = d.height ? healthyRange(d) : [null, null];
    body = `
    <h2 class="text-xl font-extrabold">Berat & matlamat</h2>
    <div class="grid grid-cols-2 gap-3 mt-4">${field('obWeight', 'Berat semasa (kg)', d.weight ?? '')}${field('obTarget', 'Berat sasaran (kg)', d.target ?? '')}</div>
    ${lo ? `<p class="text-[12px] text-slate-500 mt-2">Julat berat sihat untuk tinggi ${d.height} cm: <b>${lo}–${hi} kg</b> (BMI 18.5–22.9).</p>` : ''}
    <div class="text-[12px] font-semibold text-slate-500 mt-5 mb-1.5">Kadar turun berat</div>
    <div class="space-y-2">${Object.entries(PACE).map(([k, v]) => `<button data-act="obSet" data-k="pace" data-v="${k}" class="tap w-full text-left rounded-2xl border-2 px-4 py-3 ${d.pace === k ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white'}"><div class="font-semibold text-[14px]">${v.label}</div><div class="text-[12px] text-slate-500">${v.d}</div></button>`).join('')}</div>
    ${nav()}`;
  }
  if (o.step === 3) body = `
    <h2 class="text-xl font-extrabold">Tahap aktiviti harian</h2>
    <p class="text-[13px] text-slate-500 mt-1">Pilih yang paling dekat dengan rutin biasa anda.</p>
    <div class="space-y-2 mt-4">${Object.entries(ACTIVITY).map(([k, v]) => `<button data-act="obSet" data-k="activity" data-v="${k}" class="tap w-full text-left rounded-2xl border-2 px-4 py-3 ${d.activity === k ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white'}"><div class="font-semibold text-[14px]">${v.label}</div><div class="text-[12px] text-slate-500">${v.d}</div></button>`).join('')}</div>
    ${nav()}`;
  if (o.step === 4) body = `
    <h2 class="text-xl font-extrabold">Pilihan makanan & kesihatan</h2>
    <p class="text-[13px] text-slate-500 mt-1">Pilihan ini menapis cadangan menu. Boleh langkau dan ubah kemudian.</p>
    ${prefsBlock('obToggle', d)}
    ${nav()}`;
  if (o.step === 5) {
    const t = calcTargets(d, d.weight), ms = autoMilestones(d.weight, d.target);
    body = `
    <h2 class="text-xl font-extrabold">Sasaran anda</h2>
    <p class="text-[13px] text-slate-500 mt-1">Dikira oleh Coach berdasarkan maklumat anda. Boleh ubah bila-bila masa di Profil.</p>
    <div class="grid grid-cols-2 gap-2 mt-4">
      <div class="bg-white rounded-2xl shadow-card p-3"><div class="text-[12px] text-slate-500">Kalori sehari</div><div class="text-xl font-extrabold">${fmt(t.min)}–${fmt(t.max)}</div><div class="text-[12px] text-slate-500">TDEE ~${fmt(t.tdee)} kcal</div></div>
      <div class="bg-white rounded-2xl shadow-card p-3"><div class="text-[12px] text-slate-500">Air sehari</div><div class="text-xl font-extrabold">${(t.water / 1000).toFixed(1)} L</div><div class="text-[12px] text-slate-500">~30 ml setiap kg</div></div>
    </div>
    ${t.floorHit ? `<div class="mt-3 text-[13px] bg-amber-50 text-amber-800 rounded-xl px-3 py-2">Sasaran dinaikkan ke had minimum selamat ${fmt(kcalFloor(d))} kcal. Jangan makan lebih rendah dari ini tanpa nasihat doktor.</div>` : ''}
    <div class="bg-white rounded-2xl shadow-card p-3 mt-2">
      <div class="text-[12px] text-slate-500 mb-1">Milestone</div>
      ${ms.map((m, i) => `<div class="flex justify-between text-[14px] py-1"><span>${i + 1}. ${esc(m.name)}</span><b>${esc(m.kg)} kg</b></div>`).join('')}
      <div class="text-[12px] text-slate-500 mt-1">Anggaran ${Math.ceil((d.weight - d.target) / parseFloat(d.pace))} minggu pada kadar ${PACE[d.pace].d.split(' ·')[0]}.</div>
    </div>
    ${nav()}`;
  }
  if (o.step === 6) body = notifBody(true);
  return `<div class="pt-4 pb-10">${dots}${body}</div>`;
}

function prefsBlock(act, d) {
  const has = (arr, k) => (d[arr] || []).includes(k);
  return `
    <div class="text-[12px] font-semibold text-slate-500 mt-4 mb-1.5">Saya tak makan…</div>
    <div class="flex flex-wrap gap-2">${Object.entries(AVOID).map(([k, l]) => chip(act, 'avoid', k, has('avoid', k), l)).join('')}</div>
    <div class="text-[12px] font-semibold text-slate-500 mt-4 mb-1.5">Alahan</div>
    <div class="flex flex-wrap gap-2">${Object.entries(ALLERGY).map(([k, l]) => chip(act, 'allergies', k, has('allergies', k), l)).join('')}</div>
    <div class="text-[12px] font-semibold text-slate-500 mt-4 mb-1.5">Rasa</div>
    <div class="flex flex-wrap gap-2">${chip(act, 'noSpicy', '1', !!d.noSpicy, 'Tak gemar pedas')}</div>
    <div class="text-[12px] font-semibold text-slate-500 mt-5 mb-1.5">Nota kesihatan (pilihan)</div>
    <div class="flex flex-wrap gap-2">${Object.entries(HEALTH).map(([k, l]) => chip(act, 'health', k, has('health', k), l)).join('')}</div>
    <p class="text-[12px] text-slate-500 mt-2">Digunakan untuk sesuaikan panduan "Rasa tak selesa" & cadangan menu. Disimpan dalam telefon sahaja, dan bukan pengganti nasihat doktor.</p>`;
}

function obCollect() {
  const d = UI.ob.d;
  if (document.getElementById('obName')) d.name = val('obName').trim();
  if (document.getElementById('obAge')) { d.age = numVal('obAge'); d.height = numVal('obHeight'); }
  if (document.getElementById('obWeight')) { d.weight = numVal('obWeight'); d.target = numVal('obTarget'); }
}
function obValidate() {
  const d = UI.ob.d, s = UI.ob.step;
  if (s === 1) {
    if (!d.sex) return 'Pilih jantina dulu';
    if (!(d.age >= 18 && d.age <= 90)) return 'DietPal direka untuk dewasa berumur 18–90 tahun';
    if (!(d.height >= 120 && d.height <= 230)) return 'Masukkan tinggi dalam cm (cth: 170)';
  }
  if (s === 2) {
    if (!(d.weight >= 35 && d.weight <= 300)) return 'Masukkan berat semasa yang betul';
    if (!(d.target > 0)) return 'Masukkan berat sasaran';
    if (d.target >= d.weight) return 'Berat sasaran mesti lebih rendah dari berat semasa';
    if (d.target < minHealthyWeight(d)) return `Berat sasaran terlalu rendah — minimum sihat ${minHealthyWeight(d)} kg (BMI 18.5)`;
  }
  return '';
}
function obFinish() {
  const d = UI.ob.d, p = S.profile;
  Object.assign(p, {
    name: d.name || '', sex: d.sex, age: d.age, height: d.height, startWeight: d.weight, targetWeight: d.target,
    activity: d.activity, pace: d.pace, kcalMode: 'auto', waterMode: 'auto',
    avoid: d.avoid, allergies: d.allergies, noSpicy: !!d.noSpicy, health: d.health,
    milestones: autoMilestones(d.weight, d.target), setupDone: true, setupAt: Date.now()
  });
  S.weights = S.weights.filter(w => w.date !== todayKey()); S.weights.push({ date: todayKey(), kg: d.weight });
  recalcTargets(); save();
  UI.tab = 'home'; render(); window.scrollTo({ top: 0 });
  toast(`Selamat datang${p.name ? ', ' + p.name : ''}!`);
}

/* ---------- PROFILE & SETTINGS PAGE ---------- */
function viewProfile() {
  const seg = `
    <div class="flex items-center gap-2">
      <button data-act="tab" data-tab="home" class="tap w-10 h-10 rounded-xl bg-white border border-slate-200 grid place-items-center" aria-label="Kembali">${icon('chevL')}</button>
      <div class="seg grid-cols-2 flex-1">
        <button data-act="pTab" data-v="profil" class="tap seg-btn ${UI.pTab === 'profil' ? 'seg-on' : ''}">Profil</button>
        <button data-act="pTab" data-v="tetapan" class="tap seg-btn ${UI.pTab === 'tetapan' ? 'seg-on' : ''}">Tetapan</button>
      </div>
    </div>`;
  return seg + (UI.pTab === 'tetapan' ? viewSettings() : viewProfileTab());
}

function viewProfileTab() {
  const p = S.profile, cur = currentWeight(), auto = p.kcalMode === 'auto';
  const t = canAuto(p) ? calcTargets(p) : null;
  const ms = p.milestones || [];
  return `
  ${!canAuto(p) ? `<div class="text-[13px] bg-amber-50 text-amber-800 rounded-2xl px-4 py-3">Lengkapkan <b>jantina, umur & tahap aktiviti</b> supaya Coach boleh kira sasaran kalori secara automatik.</div>` : ''}

  ${card(`
    <div class="flex items-center gap-3 mb-3">
      <div class="w-12 h-12 rounded-2xl bg-brand-700 text-white grid place-items-center text-xl font-extrabold">${initials()}</div>
      <div><div class="font-bold text-[16px]">${esc(p.name || 'Profil saya')}</div><div class="text-[12px] text-slate-500">${cur ? cur.toFixed(1) + ' kg · BMI ' + bmi(cur).toFixed(1) : ''}</div></div>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div class="col-span-2">${field('pName', 'Nama panggilan', p.name, 'text')}</div>
      ${selectField('pSex', 'Jantina', p.sex || '', { '': '— Pilih —', L: 'Lelaki', P: 'Perempuan' })}
      ${field('pAge', 'Umur (tahun)', p.age ?? '')}
      ${field('pHeight', 'Tinggi (cm)', p.height ?? '')}
      ${field('pStart', 'Berat mula (kg)', p.startWeight ?? '')}
      ${field('pTarget', 'Berat sasaran (kg)', p.targetWeight ?? '')}
      <div class="col-span-2">${selectField('pPace', 'Kadar turun berat', p.pace || '0.5', Object.fromEntries(Object.entries(PACE).map(([k, v]) => [k, v.label + ' · ' + v.d.split(' ·')[0]])))}</div>
      <div class="col-span-2">${selectField('pActivity', 'Tahap aktiviti', p.activity || 'rendah', Object.fromEntries(Object.entries(ACTIVITY).map(([k, v]) => [k, v.label])))}
        <p class="text-[12px] text-slate-500 mt-1">${ACTIVITY[p.activity || 'rendah'].d}</p></div>
    </div>
    <p class="text-[12px] text-slate-500 mt-2">Berat semasa diambil dari log berat terkini.</p>
    <button data-act="saveProfile" class="tap mt-3 w-full btn btn-primary py-3">Simpan profil</button>`)}

  ${card(`
    <div class="flex items-center justify-between mb-3"><div class="font-bold text-[16px]">Sasaran harian</div></div>
    <div class="seg grid-cols-2">
      <button data-act="setMode" data-v="auto" class="tap seg-btn ${auto ? 'seg-on' : ''}">Automatik</button>
      <button data-act="setMode" data-v="manual" class="tap seg-btn ${!auto ? 'seg-on' : ''}">Manual</button>
    </div>
    ${auto ? (t ? `
      <div class="grid grid-cols-3 gap-2 mt-3 text-center">
        <div class="bg-slate-50 rounded-xl py-2"><div class="text-[12px] text-slate-500">BMR</div><div class="font-bold">${fmt(t.bmr)}</div></div>
        <div class="bg-slate-50 rounded-xl py-2"><div class="text-[12px] text-slate-500">TDEE</div><div class="font-bold">${fmt(t.tdee)}</div></div>
        <div class="bg-slate-50 rounded-xl py-2"><div class="text-[12px] text-slate-500">Defisit</div><div class="font-bold">−${fmt(t.deficit)}</div></div>
      </div>
      <div class="mt-3 flex justify-between items-center bg-brand-50 rounded-xl px-3 py-2.5"><span class="text-[13px] text-brand-900">Kalori sehari</span><b class="text-brand-900">${fmt(p.kcalMin)}–${fmt(p.kcalMax)} kcal</b></div>
      <div class="mt-2 flex justify-between items-center bg-sky-50 rounded-xl px-3 py-2.5"><span class="text-[13px] text-sky-900">Air sehari</span><b class="text-sky-900">${(p.waterGoal / 1000).toFixed(1)}–${(p.waterIdeal / 1000).toFixed(1)} L</b></div>
      ${t.floorHit ? `<p class="text-[12px] text-amber-700 mt-2">Dinaikkan ke had minimum selamat ${fmt(kcalFloor())} kcal.</p>` : ''}
      <p class="text-[12px] text-slate-500 mt-2">Dikira semula setiap kali berat baru dilog (formula Mifflin-St Jeor).</p>`
      : `<p class="text-[13px] text-slate-500 mt-3">Lengkapkan profil di atas untuk guna kiraan automatik.</p>`) : `
      <div class="grid grid-cols-2 gap-3 mt-3">
        ${field('mMin', 'Kalori min', p.kcalMin)}${field('mMax', 'Kalori maks', p.kcalMax)}
        ${field('mWater', 'Air minimum (ml)', p.waterGoal)}${field('mWaterIdeal', 'Air ideal (ml)', p.waterIdeal)}
      </div>
      <p class="text-[12px] text-slate-500 mt-2">Had minimum selamat: ${fmt(kcalFloor())} kcal sehari. Nilai lebih rendah akan dinaikkan secara automatik.</p>
      <button data-act="saveManual" class="tap mt-3 w-full btn btn-primary py-3">Simpan sasaran</button>`}`)}

  ${card(`
    <div class="flex items-center justify-between mb-2"><div class="font-bold text-[16px]">Milestone</div>
      <button data-act="msAuto" class="tap btn btn-text text-[13px]">Jana automatik</button></div>
    <div class="space-y-2">
      ${ms.map((m, i) => `<div class="flex gap-2 items-center">
        <input id="msName${i}" value="${esc(m.name)}" class="flex-1 min-w-0 bg-slate-50 rounded-xl px-3 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-brand-500">
        <div class="relative w-24"><input id="msKg${i}" type="number" step="0.1" inputmode="decimal" value="${esc(m.kg)}" class="w-full bg-slate-50 rounded-xl px-3 py-2.5 pr-8 text-[14px] font-bold outline-none focus:ring-2 focus:ring-brand-500"><span class="absolute right-2.5 top-3 text-[12px] text-slate-500">kg</span></div>
        <button data-act="msDel" data-i="${i}" class="tap w-8 h-8 grid place-items-center text-slate-500 hover:text-red-600" aria-label="Padam">${icon('x', 'w-4 h-4')}</button></div>`).join('') || '<p class="text-[13px] text-slate-500">Tiada milestone.</p>'}
    </div>
    <div class="grid grid-cols-2 gap-2 mt-3">
      <button data-act="msAdd" class="tap btn btn-secondary py-2.5 text-[14px]">${icon('plus', 'w-4 h-4')}Tambah</button>
      <button data-act="msSave" class="tap btn btn-primary py-2.5 text-[14px]">Simpan milestone</button>
    </div>`)}

  ${card(`<div class="font-bold text-[16px]">Pilihan makanan & kesihatan</div>
    <p class="text-[12px] text-slate-500">Disimpan terus bila ditekan.</p>
    ${prefsBlock('prefToggle', p)}`)}`;
}

function viewSettings() {
  const st = S.settings, r = st.reminders, mt = st.mealTimes;
  const seg3 = (act, cur, opts) => `<div class="seg grid-cols-${Object.keys(opts).length}">${Object.entries(opts).map(([k, l]) => `<button data-act="${act}" data-v="${k}" class="tap seg-btn ${cur === k ? 'seg-on' : ''}">${l}</button>`).join('')}</div>`;
  return `
  ${card(`<div class="font-bold text-[16px] mb-3">Paparan</div>
    <div class="text-[12px] font-semibold text-slate-500 mb-1.5">Tema</div>
    ${seg3('setTheme', st.theme, { light: 'Cerah', dark: 'Gelap', auto: 'Ikut telefon' })}
    <div class="text-[12px] font-semibold text-slate-500 mt-4 mb-1.5">Saiz teks</div>
    ${seg3('setText', st.textSize, { normal: 'Biasa', big: 'Besar' })}`)}

  ${card(`<div class="font-bold text-[16px] mb-1">Waktu makan biasa</div>
    <p class="text-[12px] text-slate-500 mb-3">Untuk kesan waktu makan secara automatik & peringatan log.</p>
    <div class="divide-y divide-slate-100">
      ${['sarapan', 'tengahari', 'malam'].map(m => `<label class="flex items-center justify-between gap-3 py-2">
        <span class="flex items-center gap-2 text-[14px] font-semibold text-slate-700"><span class="text-slate-500">${icon(MEAL_ICON[m], 'w-5 h-5')}</span>${MEALS.find(x => x.id === m).label}</span>
        <input type="time" data-time="${m}" value="${mt[m]}" class="w-[136px] bg-slate-50 rounded-xl px-3 py-2.5 text-[14px] outline-none text-right"></label>`).join('')}
    </div>`)}

  ${card(`<div class="font-bold text-[16px]">Peringatan</div>
    <div class="divide-y divide-slate-100">
      ${toggleRow('remToggle', 'water', r.water, 'Minum air', 'Setiap 2 jam, bila air kurang dari jangkaan')}
      ${toggleRow('remToggle', 'meals', r.meals, 'Log makan', 'Lepas waktu makan biasa, jika belum log')}
      ${toggleRow('remToggle', 'weigh', r.weigh, 'Timbang berat mingguan', 'Sekali seminggu pada hari pilihan')}
      ${toggleRow('remToggle', 'summary', r.summary !== false, 'Ringkasan malam', 'Jumlah kalori hari ini, sekitar 9.30 malam')}
    </div>
    ${r.weigh ? `<div class="mt-2">${selectField('weighDay', 'Hari timbang', String(r.weighDay), Object.fromEntries(HARI_PENUH.map((h, i) => [String(i), h])))}</div>` : ''}
    ${pushSettingsBlock()}`)}

  ${card(`<div class="font-bold text-[16px]">Privasi</div>
    <div class="divide-y divide-slate-100">
      ${toggleRow('aiToggle', 'health', st.ai?.health !== false, 'Kongsi nota kesihatan dengan Coach AI', 'Supaya cadangan elak gula, garam atau pedas ikut keadaan anda')}
    </div>
    <div class="text-[13px] text-slate-600 mt-2">${st.ai?.consent ? `Persetujuan Coach AI: diberi${st.ai.consentAt ? ' pada ' + niceDate(todayKey(new Date(st.ai.consentAt))) : ''}.` : 'Persetujuan Coach AI: belum diberi (akan ditanya sebelum soalan pertama).'}</div>
    <div class="grid grid-cols-2 gap-2 mt-3">
      <button data-act="privacy" class="tap btn btn-secondary py-2.5 text-[14px]">Notis privasi</button>
      <button data-act="aiRevoke" class="tap btn btn-secondary py-2.5 text-[14px]" ${st.ai?.consent ? '' : 'disabled'}>Tarik balik</button>
    </div>`)}

  ${card(`<div class="font-bold text-[16px] mb-3">Data</div>
    <div class="grid grid-cols-2 gap-2">
      <button data-act="export" class="tap btn btn-secondary py-2.5 text-[14px]">${icon('download', 'w-4 h-4')}Backup</button>
      <label class="tap btn btn-secondary py-2.5 text-[14px] cursor-pointer">${icon('upload', 'w-4 h-4')}Restore<input id="importFile" type="file" accept="application/json" class="hidden"></label>
      <button data-act="exportCsv" class="tap col-span-2 btn btn-secondary py-2.5 text-[14px]">${icon('download', 'w-4 h-4')}Export CSV (makanan, air, berat)</button>
    </div>
    <button data-act="reset" class="tap mt-2 w-full btn btn-danger py-2.5 text-[14px]">Padam semua data</button>
    <p class="text-[12px] text-slate-500 mt-1">Semua data disimpan dalam telefon ini sahaja. ${S.backup?.lastAt ? `Backup terakhir: ${niceDate(todayKey(new Date(S.backup.lastAt)))}.` : '<b>Belum pernah backup.</b>'}</p>`)}

  ${card(`<div class="font-bold text-[16px] mb-1">Tentang DietPal</div>
    <div class="text-[13px] text-slate-600">Versi ${APP_VERSION}</div>
    <a href="https://github.com/mdk869/DietPal" target="_blank" rel="noopener" class="text-[13px] font-semibold text-brand-700">github.com/mdk869/DietPal</a>
    <p class="text-[12px] text-slate-500 mt-2">App ini panduan gaya hidup, bukan nasihat perubatan. Nilai kalori adalah anggaran purata. Rujuk doktor atau pegawai dietetik untuk keadaan kesihatan tertentu.</p>`)}`;
}

function toggleIn(arr, v) { const i = arr.indexOf(v); i >= 0 ? arr.splice(i, 1) : arr.push(v); }
function exportCsv() {
  const rows = [['tarikh', 'jenis', 'waktu_makan', 'item', 'kuantiti', 'kcal', 'air_ml', 'berat_kg']];
  Object.keys(S.days).sort().forEach(k => {
    const d = S.days[k];
    d.meals.forEach(m => rows.push([k, 'makanan', m.meal, m.name, m.qty, m.kcal, '', '']));
    if (d.water) rows.push([k, 'air', '', '', '', '', d.water, '']);
  });
  sortedWeights().forEach(w => rows.push([w.date, 'berat', '', '', '', '', '', w.kg]));
  const csv = rows.map(r => r.map(c => /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
  const a = document.createElement('a'); a.href = url; a.download = `dietpal-${todayKey()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function handleProfileAction(a, el) {
  const p = S.profile, st = S.settings;
  switch (a) {
    case 'obSet': obCollect(); UI.ob.d[el.dataset.k] = el.dataset.v; render(); return true;
    case 'obToggle': {
      obCollect(); const d = UI.ob.d, k = el.dataset.k;
      if (k === 'noSpicy') d.noSpicy = !d.noSpicy; else toggleIn(d[k], el.dataset.v);
      render(); return true;
    }
    case 'obBack': obCollect(); UI.ob.step--; render(); window.scrollTo({ top: 0 }); return true;
    case 'obNotif': UI.notifTried = (UI.notifTried || 0) + 1; enablePush(true).then(ok => { if (ok) { obFinish(); toast('Peringatan dihidupkan'); } else render(); }); return true;
    case 'obNext': {
      obCollect(); const err = obValidate(); if (err) { toast(err); return true; }
      if (UI.ob.step === 6) { obFinish(); return true; }
      UI.ob.step++; render(); window.scrollTo({ top: 0 }); return true;
    }
    case 'pTab': UI.pTab = el.dataset.v; render(); return true;
    case 'saveProfile': {
      const age = numVal('pAge'), height = numVal('pHeight'), start = numVal('pStart'), target = numVal('pTarget');
      if (age !== null && !(age >= 18 && age <= 90)) { toast('Umur mesti 18–90 tahun'); return true; }
      if (!(height >= 120 && height <= 230)) { toast('Masukkan tinggi yang betul (cm)'); return true; }
      const minW = minHealthyWeight({ height });
      if (target !== null && target < minW) { toast(`Berat sasaran minimum sihat ialah ${minW} kg`); return true; }
      Object.assign(p, { name: val('pName').trim(), sex: val('pSex'), age, height, startWeight: start ?? p.startWeight,
        targetWeight: target ?? p.targetWeight, pace: val('pPace'), activity: val('pActivity') });
      if (!p.startWeight && currentWeight()) p.startWeight = currentWeight();
      recalcTargets(); save(); render(); toast('Profil disimpan'); return true;
    }
    case 'setMode': {
      p.kcalMode = p.waterMode = el.dataset.v;
      if (p.kcalMode === 'auto' && !canAuto(p)) toast('Lengkapkan jantina, umur & aktiviti dulu');
      recalcTargets(); save(); render(); return true;
    }
    case 'saveManual': {
      const mn = numVal('mMin'), mx = numVal('mMax'), w = numVal('mWater'), wi = numVal('mWaterIdeal');
      if (mn && mn < kcalFloor()) toast(`Dinaikkan ke had minimum ${fmt(kcalFloor())} kcal`);
      p.kcalMin = mn || p.kcalMin; p.kcalMax = mx || p.kcalMax;
      p.waterGoal = Math.max(1000, w || p.waterGoal); p.waterIdeal = Math.max(p.waterGoal, wi || p.waterIdeal);
      recalcTargets(); save(); render(); toast('Sasaran disimpan'); return true;
    }
    case 'msAuto': {
      const cur = currentWeight(), tg = p.targetWeight;
      if (!cur || !tg || tg >= cur) { toast('Isi berat sasaran (lebih rendah dari berat semasa) dulu'); return true; }
      p.milestones = autoMilestones(cur, tg); save(); render(); toast('Milestone dijana'); return true;
    }
    case 'msAdd': msCollect(); p.milestones.push({ name: 'Milestone ' + (p.milestones.length + 1), kg: Math.round((p.targetWeight || currentWeight() - 5)) }); render(); return true;
    case 'msDel': msCollect(); p.milestones.splice(Number(el.dataset.i), 1); save(); render(); return true;
    case 'msSave': {
      msCollect(); const minW = minHealthyWeight();
      if (p.milestones.some(m => !(m.kg >= minW))) { toast(`Setiap milestone mesti ${minW} kg ke atas`); return true; }
      p.milestones.sort((a, b) => b.kg - a.kg); save(); render(); toast('Milestone disimpan'); return true;
    }
    case 'prefToggle': {
      const k = el.dataset.k;
      if (k === 'noSpicy') p.noSpicy = !p.noSpicy; else { p[k] = p[k] || []; toggleIn(p[k], el.dataset.v); }
      save(); render(); return true;
    }
    case 'setTheme': st.theme = el.dataset.v; save(); applyTheme(); render(); return true;
    case 'setText': st.textSize = el.dataset.v; save(); applyTheme(); render(); return true;
    case 'remToggle': st.reminders[el.dataset.k] = !st.reminders[el.dataset.k]; save(); render(); return true;
    case 'dismissRem':
      if (el.dataset.id === 'backup') S.backup = { ...S.backup, snoozeAt: Date.now() };   // ask again in a week
      else dismissedToday().push(el.dataset.id);
      save(); render(); return true;
    case 'exportCsv': exportCsv(); return true;
  }
  return false;
}
function msCollect() {
  S.profile.milestones.forEach((m, i) => {
    const n = document.getElementById('msName' + i), k = document.getElementById('msKg' + i);
    if (n) m.name = n.value.trim() || m.name; if (k && isFinite(parseFloat(k.value))) m.kg = Math.round(parseFloat(k.value) * 10) / 10;
  });
}
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset?.time) { S.settings.mealTimes[t.dataset.time] = t.value; save(); toast('Waktu makan disimpan'); }
  if (t.id === 'pActivity' && t.nextElementSibling) t.nextElementSibling.textContent = ACTIVITY[t.value].d;
  if (t.id === 'weighDay') { S.settings.reminders.weighDay = Number(t.value); save(); toast('Hari timbang disimpan'); }
});

/* ============================================================
   SHEET
   ============================================================ */
let sheetFn = null;
function openSheet(fn, tall = false) { sheetFn = fn; const sh = document.getElementById('sheet'); sh.classList.toggle('h-[92vh]', tall); sh.scrollTop = 0; sh.innerHTML = fn(); document.getElementById('sheetWrap').classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
function refreshSheet() { if (sheetFn) document.getElementById('sheet').innerHTML = sheetFn(); }
function closeSheet() { sheetFn = null; document.getElementById('sheetWrap').classList.add('hidden'); document.body.style.overflow = ''; }

/* ============================================================
   ACTIONS
   ============================================================ */
function addMeal(f, qty, meal) {
  const d = day();
  d.meals.push({ id: uid(), foodId: f.id, name: f.name, unit: f.unit, qty, kcal: Math.round(f.kcal * qty), plate: f.plate || 'lain', meal, t: Date.now() });
  if (f.water) d.water += Math.round(f.water * qty);
  save();
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const a = el.dataset.act;
  if (handleProfileAction(a, el)) return;
  switch (a) {
    case 'tab': UI.tab = el.dataset.tab; if (UI.tab !== 'food') UI.q = ''; render(); window.scrollTo({ top: 0 }); break;
    case 'quickMeal': if (sheetFn) closeSheet(); UI.tab = 'food'; render(); window.scrollTo({ top: 0 }); openAdd(el.dataset.meal); break;
    case 'openAdd': openAdd(el.dataset.meal); break;
    case 'backToAdd': openSheet(addSheetBody, true); break;
    case 'addCat': UI.cat = el.dataset.cat; refreshSheet(); break;
    case 'ideaMenu': UI.sug.meal = el.dataset.meal; UI.sug.seed = 0; sheetSuggest(); break;
    case 'pickFood': sheetFood(el.dataset.id); break;
    case 'qty': UI.pick.qty = Math.max(0.5, Math.min(10, UI.pick.qty + parseFloat(el.dataset.d))); refreshSheet(); break;
    case 'addFood': {
      const f = findFood(UI.pick.id); addMeal(f, UI.pick.qty, UI.meal);
      render(); openSheet(addSheetBody, true); toast(`${f.name} ditambah (${fmt(f.kcal * UI.pick.qty)} kcal)`); break;
    }
    case 'delMeal': { const d = day(); const m = d.meals.find(x => x.id === el.dataset.id);
      if (m) { const f = findFood(m.foodId); if (f?.water) d.water = Math.max(0, d.water - Math.round(f.water * m.qty)); }
      d.meals = d.meals.filter(x => x.id !== el.dataset.id); save(); render(); toast('Dipadam'); break; }
    case 'customFood': sheetCustom(); break;
    case 'saveCustom': {
      const name = document.getElementById('cfName').value.trim(), kcal = parseFloat(document.getElementById('cfKcal').value);
      if (!name || !(kcal >= 0)) { toast('Isi nama & kalori dulu'); return; }
      const f = { id: 'c_' + uid(), name, kcal: Math.round(kcal), unit: document.getElementById('cfUnit').value.trim() || '1 hidangan', plate: document.getElementById('cfPlate').value };
      S.customFoods.push(f); addMeal(f, 1, UI.meal); render(); openSheet(addSheetBody, true); toast('Disimpan & dilog'); break;
    }
    case 'water': { const d = day(); const ml = parseInt(el.dataset.ml, 10);
      const before = d.water; d.water = Math.max(0, d.water + ml); save(); render();
      if (ml > 0 && before < S.profile.waterGoal && d.water >= S.profile.waterGoal) toast('Sasaran air tercapai!'); else if (ml > 0) toast(`+${ml} ml`);
      break; }
    case 'saveWeight': {
      const kg = parseFloat(document.getElementById('wKg').value), date = document.getElementById('wDate').value || todayKey();
      if (!(kg > 30 && kg < 300)) { toast('Masukkan berat yang betul'); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayKey() || date < '2000-01-01') { toast('Tarikh tak boleh selepas hari ini'); return; }
      const before = currentWeight();
      S.weights = S.weights.filter(w => w.date !== date); S.weights.push({ date, kg: Math.round(kg * 10) / 10 }); recalcTargets(); save();
      const hit = S.profile.milestones.find(m => before > m.kg && currentWeight() <= m.kg);
      render(); toast(hit ? `Tahniah! ${hit.name} (${hit.kg} kg) tercapai!` : 'Berat disimpan'); break;
    }
    case 'delWeight': if (confirm('Padam catatan berat ini?')) { S.weights = S.weights.filter(w => w.date !== el.dataset.date); save(); render(); } break;
    case 'rescue': sheetRescue(); break;
    case 'sym': { const k = el.dataset.s; UI.sym.has(k) ? UI.sym.delete(k) : UI.sym.add(k); refreshSheet(); break; }
    case 'rescueGo': UI.rescueDone = true; refreshSheet(); document.getElementById('sheet').scrollTop = 0; break;
    case 'rescueOther': UI.tab = 'food'; render(); window.scrollTo({ top: 0 }); openAdd('snek'); break;
    case 'rescueLog': { const f = findFood(el.dataset.id); addMeal(f, 1, 'snek'); render(); toast(`${f.name} dilog`); el.classList.add('ring-2', 'ring-green-400'); break; }
    case 'closeSheet': closeSheet(); render(); break;
    case 'export': {
      S.backup = { ...S.backup, lastAt: Date.now() }; save();
      const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = `dietpal-backup-${todayKey()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); render(); break;
    }
    case 'reset': if (confirm('Padam SEMUA data? Tindakan ini tak boleh diundur.')) {
      // Stop server reminders first, otherwise the old subscription keeps sending them after the reset
      disablePush().finally(() => { localStorage.removeItem(KEY); S = load(); UI.tab = 'home'; UI.ob.step = 0; render(); toast('Data dipadam'); });
    } break;
    case 'install': installApp(); break;
    case 'pushOn': enablePush(true).then(ok => { if (ok) toast('Peringatan dihidupkan'); render(); }); break;
    case 'pushTest': pushPost({ action: 'test', endpoint: S.push.endpoint }).then(r => toast(r.result === 'ok' ? 'Notifikasi ujian dihantar' : 'Tak dapat hantar — cuba hidupkan semula')).catch(() => toast('Tiada sambungan')); break;
    case 'notifOn': UI.notifTried = (UI.notifTried || 0) + 1; enablePush(true).then(ok => { if (ok) toast('Peringatan dihidupkan'); render(); }); break;
    case 'notifRecheck':
      if (Notification.permission !== 'granted') { toast('Notifikasi masih belum dibenarkan'); render(); break; }
      if (!S.profile.setupDone) { subscribePush(true).catch(() => {}); obFinish(); } else { pushCheck(); render(); }
      break;
    case 'copyLink': navigator.clipboard?.writeText(location.origin + location.pathname).then(() => toast('Link disalin'), () => toast(location.origin)); break;
    case 'sugMeal': UI.sugPicked = true; UI.sug.meal = el.dataset.meal; UI.sug.seed = 0; refreshSheet(); render(); break;
    case 'sugLoc': UI.sug.loc = el.dataset.loc; UI.sug.seed = 0; S.sugPrefs = { loc: UI.sug.loc, venue: UI.sug.venue }; save(); refreshSheet(); render(); break;
    case 'sugVenue': UI.sug.venue = el.dataset.v; UI.sug.seed = 0; S.sugPrefs = { loc: UI.sug.loc, venue: UI.sug.venue }; save(); refreshSheet(); render(); break;
    case 'sugShuffle': UI.sug.seed++; refreshSheet(); render(); break;
    case 'sugMore': UI.sugAll = true; render(); break;
    case 'eatOutMenus': UI.sug.meal = guessMeal(); UI.sug.loc = 'luar'; UI.sug.seed = 0; sheetSuggest(); break;
    case 'logMenu': {
      const m = MENUS.find(x => x.id === el.dataset.id); if (!m) break;
      const meal = UI.sug.meal;
      menuItems(m).forEach(x => addMeal(x.f, x.qty, meal));
      toast(`${m.name} dilog (${fmt(menuKcal(m))} kcal)`);
      UI.sug.meal = nextMeal(meal); UI.sug.seed = 0;
      if (sheetFn) closeSheet();
      render(); break;
    }
    case 'askAI': sheetAI(); break;
    case 'aiAsk': aiAsk(); break;
    case 'aiChip': UI.ai.q = (UI.ai.meal === 'umum' ? AI_CHIPS_GENERAL : AI_CHIPS)[Number(el.dataset.i)]; refreshSheet(); break;
    case 'aiMeal': {   // switching meal changes the target, so earlier answers no longer apply
      const box = document.getElementById('aiQ'); if (box) UI.ai.q = box.value;
      UI.ai.meal = el.dataset.meal; UI.ai.result = null; UI.ai.error = ''; UI.ai.logged = {}; UI.ai.pickFor = null; refreshSheet(); break;
    }
    case 'aiLog': aiLog(Number(el.dataset.i)); break;
    case 'aiLogTo': aiLog(Number(el.dataset.i), el.dataset.meal); break;
    case 'aiFallback': sheetSuggest(); break;
    case 'privacy': openPrivacy(); break;
    case 'privacyBack': { const back = sheetBack; sheetBack = null; back ? openSheet(back, true) : closeSheet(); break; }
    case 'aiConsent': S.settings.ai = { ...S.settings.ai, consent: true, consentAt: Date.now() }; save(); refreshSheet(); break;
    case 'aiToggle': S.settings.ai = { ...S.settings.ai, health: S.settings.ai?.health === false }; save(); render(); refreshSheet(); break;
    case 'aiRevoke': if (confirm('Tarik balik persetujuan Coach AI? Anda akan ditanya semula sebelum soalan seterusnya.')) {
      S.settings.ai = { ...S.settings.ai, consent: false, consentAt: 0 }; save(); render(); toast('Persetujuan ditarik balik'); } break;
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'aiQ') UI.ai.q = e.target.value.slice(0, 300);
  if (e.target.id === 'addSearch') {
    UI.q = e.target.value;
    const box = document.getElementById('addResults'); if (box) box.innerHTML = addResultsHtml();
    const fr = document.getElementById('addFreq'); if (fr) fr.classList.toggle('hidden', !!UI.q.trim());
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'importFile' && e.target.files[0]) {
    const r = new FileReader();
    const file = e.target.files[0]; e.target.value = '';
    if (file.size > 5e6) { toast('Fail backup terlalu besar'); return; }
    r.onload = () => {
      let d;
      try { d = JSON.parse(r.result); } catch { d = null; }
      if (!d || typeof d !== 'object' || !d.profile || typeof d.profile !== 'object' || !d.days || typeof d.days !== 'object') { toast('Fail backup tak sah'); return; }
      delete d.push;   // the backup's push address belongs to the old phone; pushCheck() subscribes this one
      const prev = localStorage.getItem(KEY);
      try {
        localStorage.setItem(KEY, JSON.stringify(d)); S = load();   // load() keeps only known, checked fields
        if (S.profile.setupDone) recalcTargets(); save(); render(); pushCheck(); toast('Data dipulihkan');
      } catch (err) {
        console.warn('restore failed', err);
        if (prev) localStorage.setItem(KEY, prev); else localStorage.removeItem(KEY);
        S = load(); render(); toast('Fail backup tak sah');
      }
    };
    r.readAsText(file);
  }
});
// Re-render when returning to the app (e.g. new day)
document.addEventListener('visibilitychange', () => { if (document.hidden) return; if (!sheetFn) render(); if (typeof pushCheck === 'function') pushCheck(); });

/* ============================================================
   ICONS
   ============================================================ */
// Phosphor icons (via @iconify-json/ph), same set as the Sleek design
const PH = {"fire-fill":"<path fill=\"currentColor\" d=\"M143.38 17.85a8 8 0 0 0-12.63 3.41l-22 60.41l-24.16-23.41a8 8 0 0 0-11.93.89C51 87.53 40 116.08 40 144a88 88 0 0 0 176 0c0-59.45-50.79-108-72.62-126.15m40.51 135.49a57.6 57.6 0 0 1-46.56 46.55a7.7 7.7 0 0 1-1.33.11a8 8 0 0 1-1.32-15.89c16.57-2.79 30.63-16.85 33.44-33.45a8 8 0 0 1 15.78 2.68Z\"/>","plus-bold":"<path fill=\"currentColor\" d=\"M228 128a12 12 0 0 1-12 12h-76v76a12 12 0 0 1-24 0v-76H40a12 12 0 0 1 0-24h76V40a12 12 0 0 1 24 0v76h76a12 12 0 0 1 12 12\"/>","heart-bold":"<path fill=\"currentColor\" d=\"M178 36c-20.09 0-37.92 7.93-50 21.56C115.92 43.93 98.09 36 78 36a66.08 66.08 0 0 0-66 66c0 72.34 105.81 130.14 110.31 132.57a12 12 0 0 0 11.38 0C138.19 232.14 244 174.34 244 102a66.08 66.08 0 0 0-66-66m-5.49 142.36a328.7 328.7 0 0 1-44.51 31.8a328.7 328.7 0 0 1-44.51-31.8C61.82 159.77 36 131.42 36 102a42 42 0 0 1 42-42c17.8 0 32.7 9.4 38.89 24.54a12 12 0 0 0 22.22 0C145.3 69.4 160.2 60 178 60a42 42 0 0 1 42 42c0 29.42-25.82 57.77-47.49 76.36\"/>","caret-right-bold":"<path fill=\"currentColor\" d=\"m184.49 136.49l-80 80a12 12 0 0 1-17-17L159 128L87.51 56.49a12 12 0 1 1 17-17l80 80a12 12 0 0 1-.02 17\"/>","house-line":"<path fill=\"currentColor\" d=\"M240 208h-16v-72l2.34 2.34A8 8 0 0 0 237.66 127l-98.35-98.32a16 16 0 0 0-22.62 0L18.34 127a8 8 0 0 0 11.32 11.31L32 136v72H16a8 8 0 0 0 0 16h224a8 8 0 0 0 0-16M48 120l80-80l80 80v88h-48v-56a8 8 0 0 0-8-8h-48a8 8 0 0 0-8 8v56H48Zm96 88h-32v-48h32Z\"/>","house-line-fill":"<path fill=\"currentColor\" d=\"M240 208h-16v-72l2.34 2.34A8 8 0 0 0 237.66 127l-98.35-98.32a16 16 0 0 0-22.62 0L18.34 127a8 8 0 0 0 11.32 11.31L32 136v72H16a8 8 0 0 0 0 16h224a8 8 0 0 0 0-16m-88 0h-48v-48a4 4 0 0 1 4-4h40a4 4 0 0 1 4 4Z\"/>","bowl-food":"<path fill=\"currentColor\" d=\"M224 104h-8.37a88 88 0 0 0-175.26 0H32a8 8 0 0 0-8 8a104.35 104.35 0 0 0 56 92.28V208a16 16 0 0 0 16 16h64a16 16 0 0 0 16-16v-3.72A104.35 104.35 0 0 0 232 112a8 8 0 0 0-8-8m-24.46 0h-51.42a71.84 71.84 0 0 1 41.27-29.57A71.45 71.45 0 0 1 199.54 104m-26.06-47.77q2.75 2.25 5.27 4.75a87.92 87.92 0 0 0-49.15 43h-29.5A72.26 72.26 0 0 1 168 56c1.83 0 3.66.09 5.48.23M128 40a72 72 0 0 1 19 2.57A88.36 88.36 0 0 0 83.33 104H56.46A72.08 72.08 0 0 1 128 40m36.66 152a8 8 0 0 0-4.66 7.3v8.7H96v-8.7a8 8 0 0 0-4.66-7.3a88.29 88.29 0 0 1-51-72h175.29a88.29 88.29 0 0 1-50.97 72\"/>","bowl-food-fill":"<path fill=\"currentColor\" d=\"M224 104h-8.37a88 88 0 0 0-175.26 0H32a8 8 0 0 0-8 8a104.35 104.35 0 0 0 56 92.28V208a16 16 0 0 0 16 16h64a16 16 0 0 0 16-16v-3.72A104.35 104.35 0 0 0 232 112a8 8 0 0 0-8-8m-50.52-47.77q2.75 2.25 5.27 4.75a87.92 87.92 0 0 0-49.15 43h-29.5A72.26 72.26 0 0 1 168 56c1.83 0 3.66.09 5.48.23M148.12 104a71.84 71.84 0 0 1 41.27-29.57A71.45 71.45 0 0 1 199.54 104ZM128 40a72 72 0 0 1 19 2.57A88.36 88.36 0 0 0 83.33 104H56.46A72.08 72.08 0 0 1 128 40\"/>","scales":"<path fill=\"currentColor\" d=\"m239.43 133l-32-80a8 8 0 0 0-9.16-4.84L136 62V40a8 8 0 0 0-16 0v25.58L54.26 80.19A8 8 0 0 0 48.57 85v.06l-32 79.94a7.9 7.9 0 0 0-.57 3c0 23.31 24.54 32 40 32s40-8.69 40-32a7.9 7.9 0 0 0-.57-3L66.92 93.77L120 82v126h-16a8 8 0 0 0 0 16h48a8 8 0 0 0 0-16h-16V78.42l51-11.32l-26.43 65.9a7.9 7.9 0 0 0-.57 3c0 23.31 24.54 32 40 32s40-8.69 40-32a7.9 7.9 0 0 0-.57-3M56 184c-7.53 0-22.76-3.61-23.93-14.64L56 109.54l23.93 59.82C78.76 180.39 63.53 184 56 184m144-32c-7.53 0-22.76-3.61-23.93-14.64L200 77.54l23.93 59.82C222.76 148.39 207.53 152 200 152\"/>","scales-fill":"<path fill=\"currentColor\" d=\"m239.43 133l-32-80a8 8 0 0 0-7.43-5a8.3 8.3 0 0 0-1.73.21L136 62V40a8 8 0 0 0-16 0v25.58L54.27 80.21a8 8 0 0 0-5.7 4.79l-32 80a7.9 7.9 0 0 0-.57 3c0 23.31 24.54 32 40 32s40-8.69 40-32a7.9 7.9 0 0 0-.57-3L66.92 93.77L120 82v126h-16a8 8 0 0 0 0 16h48a8 8 0 0 0 0-16h-16V78.42l51-11.32l-26.43 65.9a7.9 7.9 0 0 0-.57 3c0 23.31 24.54 32 40 32s40-8.69 40-32a7.9 7.9 0 0 0-.57-3m-160 35H32.62L56 109.54Zm97.24-32L200 77.54L223.38 136Z\"/>","book-open-text":"<path fill=\"currentColor\" d=\"M232 48h-72a40 40 0 0 0-32 16a40 40 0 0 0-32-16H24a8 8 0 0 0-8 8v144a8 8 0 0 0 8 8h72a24 24 0 0 1 24 24a8 8 0 0 0 16 0a24 24 0 0 1 24-24h72a8 8 0 0 0 8-8V56a8 8 0 0 0-8-8M96 192H32V64h64a24 24 0 0 1 24 24v112a39.8 39.8 0 0 0-24-8m128 0h-64a39.8 39.8 0 0 0-24 8V88a24 24 0 0 1 24-24h64ZM160 88h40a8 8 0 0 1 0 16h-40a8 8 0 0 1 0-16m48 40a8 8 0 0 1-8 8h-40a8 8 0 0 1 0-16h40a8 8 0 0 1 8 8m0 32a8 8 0 0 1-8 8h-40a8 8 0 0 1 0-16h40a8 8 0 0 1 8 8\"/>","book-open-text-fill":"<path fill=\"currentColor\" d=\"M232 48h-64a32 32 0 0 0-32 32v87.73a8.17 8.17 0 0 1-7.47 8.25a8 8 0 0 1-8.53-8V80a32 32 0 0 0-32-32H24a8 8 0 0 0-8 8v144a8 8 0 0 0 8 8h72a24 24 0 0 1 24 23.94a7.9 7.9 0 0 0 5.12 7.55A8 8 0 0 0 136 232a24 24 0 0 1 24-24h72a8 8 0 0 0 8-8V56a8 8 0 0 0-8-8m-24 120h-39.73a8.17 8.17 0 0 1-8.25-7.47a8 8 0 0 1 8-8.53h39.73a8.17 8.17 0 0 1 8.25 7.47a8 8 0 0 1-8 8.53m0-32h-39.73a8.17 8.17 0 0 1-8.25-7.47a8 8 0 0 1 8-8.53h39.73a8.17 8.17 0 0 1 8.25 7.47a8 8 0 0 1-8 8.53m0-32h-39.73a8.17 8.17 0 0 1-8.27-7.47a8 8 0 0 1 8-8.53h39.73a8.17 8.17 0 0 1 8.27 7.47a8 8 0 0 1-8 8.53\"/>","arrows-clockwise-bold":"<path fill=\"currentColor\" d=\"M228 48v48a12 12 0 0 1-12 12h-48a12 12 0 0 1 0-24h19l-7.8-7.8a75.55 75.55 0 0 0-53.32-22.26h-.43a75.5 75.5 0 0 0-53.06 21.63a12 12 0 1 1-16.78-17.16a99.38 99.38 0 0 1 69.87-28.47h.52a99.42 99.42 0 0 1 70.2 29.29L204 67V48a12 12 0 0 1 24 0m-44.39 132.43a75.5 75.5 0 0 1-53.09 21.63h-.43a75.55 75.55 0 0 1-53.32-22.26L69 172h19a12 12 0 0 0 0-24H40a12 12 0 0 0-12 12v48a12 12 0 0 0 24 0v-19l7.8 7.8a99.42 99.42 0 0 0 70.2 29.26h.56a99.38 99.38 0 0 0 69.87-28.47a12 12 0 0 0-16.78-17.16Z\"/>","sparkle":"<path fill=\"currentColor\" d=\"M197.58 129.06L146 110l-19-51.62a15.92 15.92 0 0 0-29.88 0L78 110l-51.62 19a15.92 15.92 0 0 0 0 29.88L78 178l19 51.62a15.92 15.92 0 0 0 29.88 0L146 178l51.62-19a15.92 15.92 0 0 0 0-29.88ZM137 164.22a8 8 0 0 0-4.74 4.74L112 223.85L91.78 169a8 8 0 0 0-4.78-4.78L32.15 144L87 123.78a8 8 0 0 0 4.78-4.78L112 64.15L132.22 119a8 8 0 0 0 4.74 4.74L191.85 144ZM144 40a8 8 0 0 1 8-8h16V16a8 8 0 0 1 16 0v16h16a8 8 0 0 1 0 16h-16v16a8 8 0 0 1-16 0V48h-16a8 8 0 0 1-8-8m104 48a8 8 0 0 1-8 8h-8v8a8 8 0 0 1-16 0v-8h-8a8 8 0 0 1 0-16h8v-8a8 8 0 0 1 16 0v8h8a8 8 0 0 1 8 8\"/>","drop-fill":"<path fill=\"currentColor\" d=\"M174 47.75a254.2 254.2 0 0 0-41.45-38.3a8 8 0 0 0-9.18 0A254.2 254.2 0 0 0 82 47.75C54.51 79.32 40 112.6 40 144a88 88 0 0 0 176 0c0-31.4-14.51-64.68-42-96.25m9.85 105.59a57.6 57.6 0 0 1-46.56 46.55a9 9 0 0 1-1.29.11a8 8 0 0 1-1.32-15.89c16.57-2.79 30.63-16.85 33.44-33.45a8 8 0 0 1 15.78 2.68Z\"/>"};
function ph(name, size = 20, cls = '') { return `<svg class="${cls} shrink-0" width="${size}" height="${size}" viewBox="0 0 256 256" aria-hidden="true">${PH[name] || ''}</svg>`; }
function iconHome(a) { return ph(a ? 'house-line-fill' : 'house-line', 22); }
function iconFood(a) { return ph(a ? 'bowl-food-fill' : 'bowl-food', 22); }
function iconScale(a) { return ph(a ? 'scales-fill' : 'scales', 22); }
function iconBook(a) { return ph(a ? 'book-open-text-fill' : 'book-open-text', 22); }

/* ============================================================
   INSTALL GATE — DietPal runs only from the home screen / installed app
   ============================================================ */
const UA = navigator.userAgent;
const isStandaloneMode = () => ['standalone', 'fullscreen', 'minimal-ui'].some(m => window.matchMedia(`(display-mode: ${m})`).matches) || navigator.standalone === true;
// Preview & local builds can be opened in a browser with ?dev=1 (never on the production domain)
const PREVIEW_HOST = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || location.hostname.includes('-git-')
  || /-[a-z0-9]{9}-[a-z0-9-]+\.vercel\.app$/.test(location.hostname);
try { if (PREVIEW_HOST && new URLSearchParams(location.search).has('dev')) sessionStorage.setItem('dietpal.dev', '1'); } catch {}
const devOpen = () => { try { return PREVIEW_HOST && sessionStorage.getItem('dietpal.dev') === '1'; } catch { return false; } };
const appAllowed = () => isStandaloneMode() || devOpen();
function platform() {
  if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|Twitter|Snapchat|WhatsApp|Messenger|Telegram/i.test(UA)) return 'inapp';
  if (/iphone|ipad|ipod/i.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/android/i.test(UA)) return 'android';
  return 'desktop';
}
function viewGate() {
  const p = platform(), hasData = S.profile.setupDone || Object.keys(S.days).length > 0;
  const step = (n, html) => `<li class="flex gap-3 items-start"><span class="shrink-0 w-7 h-7 rounded-full bg-brand-50 text-brand-700 font-bold text-[14px] grid place-items-center">${n}</span><span class="text-[14px] text-slate-700 pt-1 leading-snug">${html}</span></li>`;
  const steps = list => `<ol class="space-y-3 mt-4">${list.map((h, i) => step(i + 1, h)).join('')}</ol>`;
  const ib = name => `<span class="inline-flex align-middle text-brand-700">${icon(name, 'w-4 h-4')}</span>`;
  let how;
  if (UI.installed && p !== 'ios') how = `
    <div class="bg-green-50 text-green-800 rounded-xl px-3 py-3 text-[14px] mt-4 flex gap-2">${icon('check', 'w-5 h-5 shrink-0', 2.5)}<span><b>DietPal dah dipasang.</b> Tutup browser ini dan buka DietPal dari ${p === 'desktop' ? 'senarai app komputer anda' : 'home screen'}.</span></div>`;
  else if (p === 'inapp') how = `
    <p class="text-[14px] text-slate-600 mt-2">Browser dalam app ini tak boleh pasang DietPal. Buka link ini dalam <b>Chrome</b> atau <b>Safari</b>.</p>
    ${steps([`Tekan menu ${ib('dots')} di penjuru skrin`, 'Pilih <b>Buka dalam browser</b> (Open in browser / Open in Chrome / Open in Safari)', 'Atau salin link dan tampal dalam Chrome atau Safari'])}
    <button data-act="copyLink" class="tap mt-5 w-full btn btn-secondary py-3">${icon('copy', 'w-4 h-4')}Salin link</button>`;
  else if (p === 'ios') how = `
    ${steps([`Tekan butang <b>Share</b> ${ib('share')} — di bawah skrin dalam Safari, atau di bar alamat dalam Chrome`,
      `Skrol ke bawah dan pilih <b>Add to Home Screen</b> ${ib('plusSquare')}`, 'Tekan <b>Add</b> di penjuru kanan atas',
      'Buka <b>DietPal</b> dari home screen'])}
    <p class="text-[12px] text-slate-500 mt-4">Perlukan iOS 16.4 atau lebih baru. Jika tiada pilihan Add to Home Screen, buka link ini dalam Safari.</p>`;
  else if (deferredPrompt) how = `
    <p class="text-[14px] text-slate-600 mt-2">Pasang dengan satu tekan — percuma, saiz kecil, tiada akaun.</p>
    <button data-act="install" class="tap mt-5 w-full btn btn-primary py-3.5">${icon('download', 'w-5 h-5')}Pasang DietPal</button>`;
  else if (p === 'android') how = `
    ${steps([`Tekan menu ${ib('dots')} di penjuru kanan atas browser`, 'Pilih <b>Install app</b> atau <b>Add to Home screen</b>', 'Buka <b>DietPal</b> dari home screen'])}
    <p class="text-[12px] text-slate-500 mt-4">Tiada pilihan itu? Buka link ini dalam Chrome.</p>`;
  else how = `
    ${steps(['<b>Chrome atau Edge:</b> tekan ikon pasang di hujung bar alamat, atau menu → <b>Install DietPal</b>',
      '<b>Safari (Mac):</b> menu <b>File → Add to Dock</b>', '<b>Firefox:</b> tak boleh pasang app — buka link ini dalam Chrome atau Edge'])}`;
  const keep = hasData ? card(`<div class="font-bold text-[14px]">Anda dah ada data DietPal di sini</div>
    <p class="text-[13px] text-slate-600 mt-1">${p === 'ios' ? 'Di iPhone, app yang dipasang bermula kosong. Simpan data dulu, kemudian pilih <b>Pulihkan data</b> semasa buka app.' : 'Data anda dibawa bersama ke app yang dipasang. Simpan backup untuk keselamatan.'}</p>
    <button data-act="export" class="tap mt-3 w-full btn btn-secondary py-2.5 text-[14px]">${icon('download', 'w-4 h-4')}Simpan data saya</button>`, 'mt-4') : '';
  return `<div class="pt-6 pb-10">
    <div class="text-center"><img src="icons/icon-192.png" class="w-20 h-20 rounded-2xl mx-auto" alt="">
      <h1 class="text-2xl font-extrabold mt-4 text-brand-900">Pasang DietPal dulu</h1>
      <p class="text-[14px] text-slate-500 mt-1">DietPal berfungsi sebagai app di ${p === 'desktop' ? 'komputer' : 'telefon'} anda — boleh guna offline dan terima peringatan.</p></div>
    ${card(how, 'mt-6')}
    ${keep}
  </div>`;
}

/* ============================================================
   PUSH REMINDERS (Supabase Edge Function "push")
   Server keeps: push address, time zone, reminder settings, and today's status
   (meals logged yes/no, water ml, kcal total, last weigh-in date). No name, weight or food list.
   ============================================================ */
const PUSH_URL = 'https://jlbdtmzccrebjmlrjvgh.supabase.co/functions/v1/push';
const VAPID_PUBLIC = 'BGc5nY8rXYPjvBjFcwHqg3Du5maukBAMJ8G4t1JETqVm9CsiocVg0jyyrO4CiCCpSTsdfY74zxnbgHeMZ8FSYeQ';
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const pushDenied = () => pushSupported() && Notification.permission === 'denied';
const tzName = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kuala_Lumpur'; } catch { return 'Asia/Kuala_Lumpur'; } };
function b64ToBytes(s) { const b = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); }
function pushPrefs() { const r = S.settings.reminders; return { mealTimes: S.settings.mealTimes, meals: r.meals, water: r.water, weigh: r.weigh, summary: r.summary !== false, weighDay: Number(r.weighDay) }; }
function pushStatus() {
  const d = peekDay(todayKey()), p = S.profile;
  return { date: todayKey(), logged: [...new Set(d.meals.map(m => m.meal))], water: d.water || 0, waterGoal: p.waterGoal,
    kcal: kcalOf(d), kcalMin: p.kcalMin, kcalMax: p.kcalMax, weighedOn: S.weights.map(w => w.date).sort().pop() || '' };
}
async function pushPost(body, keepalive = false) {
  const r = await fetch(PUSH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'push_' + r.status);
  return data;
}
async function subscribePush(welcome) {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC) });
  await pushPost({ action: 'subscribe', sub: sub.toJSON(), tz: tzName(), prefs: pushPrefs(), status: pushStatus(), welcome });
  S.push = { ...S.push, on: true, asked: true, endpoint: sub.endpoint }; save();
}
// Must be called straight from a tap: the browser shows its "Allow" prompt.
async function enablePush(welcome = false) {
  if (!pushSupported()) { toast('Telefon ini tak menyokong notifikasi'); return false; }
  const perm = await Notification.requestPermission();
  S.push = { ...S.push, asked: true }; save();
  if (perm !== 'granted') return false;   // the screen explains what to do next
  try { await subscribePush(welcome); return true; }
  catch (e) { console.warn('push subscribe failed', e); toast('Tak dapat hidupkan notifikasi. Cuba lagi bila ada internet.'); return false; }
}
async function disablePush() {
  try {
    // never hang (e.g. no service worker yet): give up after 5 s
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error('sw_timeout')), 5000))]);
    const sub = await reg.pushManager.getSubscription();
    // If the server can't be reached, unsubscribing in the browser still ends it: the server
    // gets 404/410 on its next send and deletes the row.
    if (sub) { await pushPost({ action: 'unsubscribe', endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
  } catch (e) { console.warn('push off', e); }
  S.push = { ...S.push, on: false, endpoint: '' }; save();
}
let pushTimer = null, pushSent = '';
function syncPush(now = false) {
  if (!S.push?.on || !S.push.endpoint || !navigator.onLine) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const body = { action: 'status', endpoint: S.push.endpoint, status: pushStatus(), prefs: pushPrefs(), tz: tzName() };
    const sig = JSON.stringify(body); if (sig === pushSent) return; pushSent = sig;
    pushPost(body, now).then(r => { if (r.known === false) subscribePush(false).catch(() => {}); }).catch(() => { pushSent = ''; });
  }, now ? 0 : 3000);
}
// On launch: keep the server in step if the browser rotated the subscription or permission changed.
async function pushCheck() {
  if (!appAllowed() || !pushSupported() || Notification.permission !== 'granted' || !S.profile.setupDone) return;
  try {
    if (!S.push?.on) { await subscribePush(false); render(); return; }
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (!sub || sub.endpoint !== S.push.endpoint) await subscribePush(false); else syncPush(true);
  } catch (e) { console.warn('push check', e); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) syncPush(true); });

// Notifications are required: the app opens only once the browser permission is granted.
const notifReady = () => pushSupported() && Notification.permission === 'granted';
function notifBody(onboarding) {
  const p = platform(), state = !pushSupported() ? 'unsupported' : Notification.permission;
  const head = (title, sub, ic = 'bell') => `<div class="text-center pt-4">
      <div class="w-16 h-16 rounded-2xl bg-brand-50 text-brand-700 grid place-items-center mx-auto">${icon(ic, 'w-8 h-8')}</div>
      <h2 class="text-xl font-extrabold mt-4">${title}</h2>
      <p class="text-[14px] text-slate-500 mt-1">${sub}</p></div>`;
  if (state === 'unsupported') return head('Telefon ini belum menyokong notifikasi',
    p === 'ios' ? 'DietPal perlukan iOS 16.4 atau lebih baru. Kemas kini iPhone anda di Settings → General → Software Update, kemudian buka DietPal semula.'
      : 'DietPal perlukan browser yang menyokong notifikasi. Pasang semula DietPal menggunakan Chrome terkini.', 'alert');
  const steps = list => `<ol class="bg-white rounded-2xl shadow-card p-4 mt-5 space-y-3">${list.map((h, i) => `<li class="flex gap-3 items-start"><span class="shrink-0 w-7 h-7 rounded-full bg-brand-50 text-brand-700 font-bold text-[14px] grid place-items-center">${i + 1}</span><span class="text-[14px] text-slate-700 pt-1 leading-snug">${h}</span></li>`).join('')}</ol>`;
  // Asked already but still "default": the browser may have hidden its prompt (Chrome's quiet permission UI)
  if (state === 'default' && UI.notifTried >= 2) {
    const how = p === 'ios'
      ? ['Buka <b>Settings</b> iPhone', 'Pilih <b>Notifications</b>, kemudian <b>DietPal</b>', 'Hidupkan <b>Allow Notifications</b>', 'Kembali ke DietPal dan tekan butang di bawah']
      : p === 'android'
      ? ['Tekan lama ikon <b>DietPal</b> di home screen, pilih <b>App info</b> (ⓘ)', 'Pilih <b>Notifications</b> dan hidupkan', 'Kembali ke DietPal dan tekan butang di bawah']
      : ['Klik ikon loceng atau kunci di bar alamat tetingkap DietPal', 'Tukar <b>Notifications</b> kepada <b>Allow</b>', 'Tekan butang di bawah'];
    return `${head('Tiada pertanyaan muncul?', 'Kadang-kadang telefon sembunyikan pertanyaan notifikasi. Hidupkan terus di tetapan:', 'bell')}
      ${steps(how)}
      <button data-act="notifRecheck" class="tap mt-5 w-full btn btn-primary py-3.5">Saya dah hidupkan — teruskan</button>
      <button data-act="${onboarding ? 'obNotif' : 'notifOn'}" class="tap mt-2 w-full btn btn-text py-2.5 text-[14px]">Cuba tanya sekali lagi</button>`;
  }
  if (state === 'denied') {
    const how = p === 'ios'
      ? ['Buka <b>Settings</b> iPhone', 'Pilih <b>Notifications</b>, kemudian <b>DietPal</b>', 'Hidupkan <b>Allow Notifications</b>', 'Kembali ke DietPal dan tekan butang di bawah']
      : p === 'android'
      ? ['Tekan lama ikon <b>DietPal</b> di home screen, pilih <b>App info</b> (ⓘ)', 'Pilih <b>Notifications</b> dan hidupkan', 'Kembali ke DietPal dan tekan butang di bawah']
      : ['Klik ikon kunci di bar alamat tetingkap DietPal', 'Tukar <b>Notifications</b> kepada <b>Allow</b>', 'Tekan butang di bawah'];
    return `${head('Notifikasi disekat', 'DietPal perlukan notifikasi untuk ingatkan anda. Hidupkan semula di tetapan telefon:', 'alert')}
      <ol class="bg-white rounded-2xl shadow-card p-4 mt-5 space-y-3">${how.map((h, i) => `<li class="flex gap-3 items-start"><span class="shrink-0 w-7 h-7 rounded-full bg-brand-50 text-brand-700 font-bold text-[14px] grid place-items-center">${i + 1}</span><span class="text-[14px] text-slate-700 pt-1 leading-snug">${h}</span></li>`).join('')}</ol>
      <button data-act="notifRecheck" class="tap mt-5 w-full btn btn-primary py-3.5">Saya dah hidupkan — teruskan</button>`;
  }
  return `${head(onboarding ? 'Biar DietPal ingatkan anda' : 'Hidupkan peringatan untuk teruskan', 'Supaya anda tak terlupa, walaupun app ditutup.')}
    <div class="bg-white rounded-2xl shadow-card p-4 mt-5 space-y-3 text-[14px] text-slate-700">
      <div class="flex gap-3">${icon('utensils', 'w-5 h-5 text-slate-500 shrink-0')}<span>Log makan ikut waktu makan anda — tak dihantar jika dah log</span></div>
      <div class="flex gap-3">${icon('droplet', 'w-5 h-5 text-slate-500 shrink-0')}<span>Minum air setiap 2 jam, bila air masih kurang</span></div>
      <div class="flex gap-3">${icon('scale', 'w-5 h-5 text-slate-500 shrink-0')}<span>Timbang berat seminggu sekali</span></div>
      <div class="flex gap-3">${icon('moon', 'w-5 h-5 text-slate-500 shrink-0')}<span>Ringkasan kalori setiap malam</span></div>
    </div>
    ${UI.notifTried ? `<div class="mt-3 text-[13px] bg-amber-50 text-amber-800 rounded-xl px-3 py-2">Tekan <b>Allow</b> bila telefon bertanya — DietPal perlukan notifikasi untuk digunakan.</div>`
      : `<p class="text-[12px] text-slate-500 mt-3">Jenis peringatan boleh diubah di Tetapan.</p>`}
    <button data-act="${onboarding ? 'obNotif' : 'notifOn'}" class="tap mt-5 w-full btn btn-primary py-3.5">${icon('bell', 'w-5 h-5')}Hidupkan peringatan</button>`;
}
function pushSettingsBlock() {
  if (!pushSupported()) return `<p class="text-[12px] text-slate-500 mt-3">Telefon ini belum menyokong notifikasi. Peringatan dipaparkan bila app dibuka.</p>`;
  if (pushDenied()) return `<div class="mt-3 text-[13px] bg-amber-50 text-amber-800 rounded-xl px-3 py-2">Notifikasi disekat untuk DietPal. Hidupkan semula di <b>Tetapan telefon → Notifikasi → DietPal</b>, kemudian buka app semula.</div>`;
  if (!S.push?.on) return `<div class="mt-3 rounded-xl bg-slate-50 px-3 py-3">
      <div class="text-[13px] text-slate-600">Notifikasi belum disambung ke server — biasanya kerana tiada internet semasa setup.</div>
      <button data-act="pushOn" class="tap mt-2 w-full btn btn-primary py-2.5 text-[14px]">${icon('bell', 'w-4 h-4')}Hidupkan notifikasi</button></div>`;
  return `<div class="mt-3 rounded-xl bg-green-50 px-3 py-3">
      <div class="text-[13px] text-green-800 flex items-center gap-1.5">${icon('check', 'w-4 h-4', 2.5)}Notifikasi hidup di telefon ini.</div>
      <button data-act="pushTest" class="tap mt-2 w-full btn btn-secondary py-2 text-[13px]">Hantar notifikasi ujian</button></div>
    <p class="text-[12px] text-slate-500 mt-2">Untuk hantar peringatan yang tepat, status ringkas hari ini (dah log atau belum, air, jumlah kalori) dihantar ke server. Nama, berat dan senarai makanan tidak dihantar.</p>`;
}

// Notification taps open the app at the right place (./?meal=… | ?tab=weight | ?water=1)
function openFromLink(search = location.search) {
  const q = new URLSearchParams(search); let used = false;
  if (S.profile.setupDone && q.get('tab') === 'weight') { UI.tab = 'weight'; used = true; }
  if (S.profile.setupDone && q.has('water')) { UI.tab = 'home'; used = true; }
  const meal = q.get('meal');
  if (S.profile.setupDone && MEALS.some(m => m.id === meal)) { UI.tab = 'food'; used = true; setTimeout(() => openAdd(meal), 50); }
  if (used || q.has('dev')) history.replaceState(null, '', location.pathname);
}
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type === 'open' && appAllowed()) { if (sheetFn) closeSheet(); openFromLink(new URL(e.data.url, location.href).search); render(); window.scrollTo({ top: 0 }); }
});

/* ============================================================
   PWA: service worker + install
   ============================================================ */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; if (!appAllowed()) render(); });
window.addEventListener('appinstalled', () => { UI.installed = true; deferredPrompt = null; if (!appAllowed()) render(); });
function installApp() {
  if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.then(c => { if (c.outcome === 'accepted') UI.installed = true; }).finally(() => { deferredPrompt = null; render(); }); return; }
  openSheet(() => `<div class="p-5"><div class="w-10 h-1.5 rounded-full bg-slate-200 mx-auto mb-4"></div>
    <div class="font-bold text-xl">Pasang di iPhone</div>
    <ol class="mt-3 space-y-2 text-[14px] text-slate-600"><li>1. Buka page ini dalam <b>Safari</b></li><li>2. Tekan butang <b>Share</b> (kotak dengan anak panah ↑)</li><li>3. Pilih <b>Add to Home Screen</b></li></ol>
    <button data-act="closeSheet" class="tap mt-5 w-full btn btn-primary py-3">Faham</button></div>`);
}
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(err => console.info('SW not registered:', err.message)); });
}
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

if (S.profile.setupDone) { recalcTargets(); save(); }   // keep auto targets in step with profile & latest weight
applyTheme();
openFromLink();
render();
pushCheck();
setTimeout(checkReminders, 1500);
