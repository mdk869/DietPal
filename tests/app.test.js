const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
const { FOODS, isSweetMeal } = require('../foods.js');

test('sanitizeState: strips markup, junk and unknown fields', () => {
  const { sanitizeState } = load(['PYRAMID', 'PY_KEYS', 'COOKS', 'DEFAULTS', 'uid', 'sanitizeState']);
  const evil = '"><img src=x onerror=alert(1)>';
  const out = sanitizeState({
    profile: { setupDone: true, name: 'Ali', sex: 'L', age: '30', milestones: [{ name: evil, kg: evil }, { name: 'F1', kg: 80 }], avoid: ['ayam', evil] },
    settings: { theme: evil, mealTimes: { sarapan: '25:00', malam: '19:30' }, ai: { consent: 'yes' } },
    push: { on: true, endpoint: 'javascript:x' },
    days: { '2026-11-01': { meals: [{ id: evil, name: 'Nasi', kcal: evil }, { id: 'ok1', name: 'Roti', kcal: '300', plate: evil, qty: 2 }], water: 'x' }, [evil]: { meals: [] } },
    weights: [{ date: evil, kg: 80 }, { date: '2026-11-01', kg: '85.44' }], customFoods: [{ id: evil, name: 'x', kcal: 1 }, { id: 'c_1', name: 'Kuih', kcal: '120' }],
    backup: { lastAt: 'x' }, hacked: 1
  });
  assert(!JSON.stringify(out).includes('onerror'));
  assert.equal(out.profile.age, 30);
  assert.deepEqual(out.profile.avoid, ['ayam']);
  assert.equal(out.profile.milestones.length, 1);
  assert.equal(out.settings.theme, 'light');
  assert.equal(out.settings.mealTimes.sarapan, '07:30');
  assert.equal(out.settings.ai.consent, false);
  assert.equal(out.settings.ai.scanConsent, false);   // old backups: scan consent asked again
  assert.equal(out.push.endpoint, '');
  assert.equal(out.days['2026-11-01'].meals.length, 1);
  assert.equal(Object.keys(out.days).length, 1);
  assert.deepEqual(out.weights, [{ date: '2026-11-01', kg: 85.4 }]);
  assert.equal(out.customFoods.length, 1);
  assert.equal(out.backup.lastAt, 0);
  assert(!('hacked' in out));
});

test('sanitizeState: never throws on garbage', () => {
  const { sanitizeState } = load(['PYRAMID', 'PY_KEYS', 'COOKS', 'DEFAULTS', 'uid', 'sanitizeState']);
  for (const g of [null, 1, 'x', [], { profile: 5, days: [], weights: {}, customFoods: 'a', settings: [] }]) sanitizeState(g);
});

test('sanitizeState: keeps a normal backup exactly', () => {
  const { sanitizeState } = load(['PYRAMID', 'PY_KEYS', 'COOKS', 'DEFAULTS', 'uid', 'sanitizeState']);
  const good = {
    profile: { setupDone: true, setupAt: 1, name: 'Siti', sex: 'P', age: 40, height: 155, startWeight: 80, targetWeight: 60, activity: 'aktif', pace: '0.25', kcalMode: 'manual', waterMode: 'auto', kcalMin: 1300, kcalMax: 1500, waterGoal: 2400, waterIdeal: 2600, milestones: [{ name: 'Fasa 1', kg: 70 }], avoid: ['daging'], allergies: ['susu'], noSpicy: true, health: ['diabetes'] },
    settings: { theme: 'dark', textSize: 'big', mealTimes: { sarapan: '08:00', tengahari: '13:00', malam: '20:00' }, reminders: { water: false, meals: true, weigh: true, summary: false, tips: false, weighDay: 3 }, ai: { consent: true, consentAt: 5, health: false, scanConsent: true } },
    push: { on: true, asked: true, cardDone: true, endpoint: 'https://fcm.googleapis.com/x' }, dismissed: { date: '2026-11-05', ids: ['water-6'] },
    days: { '2026-11-05': { meals: [{ id: 'a1', foodId: 'nasi', name: 'Nasi', unit: '1 senduk', qty: 1.5, kcal: 195, plate: 'karbo', meal: 'sarapan', t: 5 }], water: 750 } },
    weights: [{ date: '2026-11-05', kg: 79.5 }], customFoods: [{ id: 'c_x', name: 'Air', kcal: 0, unit: '1 gelas', plate: 'lain', water: 250 }],
    backup: { lastAt: 9, snoozeAt: 0 }, sugPrefs: { loc: 'luar', venue: 'kenduri' }
  };
  assert.deepEqual(sanitizeState(good), good);
});

test('nameTags: whole words, common hidden ingredients, rendang ayam is not beef', () => {
  const { nameTags } = load(['TAG_WORDS', 'TAG_UNLESS', 'TAG_RE', 'nameTags']);
  const t = n => [...nameTags(n)].sort().join(',');
  assert.equal(t('Rendang ayam'), 'ayam');
  assert.equal(t('Rendang daging'), 'daging');
  assert.equal(t('Sate ayam 5 cucuk'), 'ayam,kacang');
  assert.equal(t('Teh tarik kurang manis'), 'susu');
  assert.equal(t('Nasi lemak'), 'ikan');
  assert.equal(t('Fortuna salad'), '');
  assert.equal(t('Tauhu bakar'), '');
});

test('backupDue: after a week, every 30 days, snooze 7 days', () => {
  const day = 864e5, now = 100 * day;
  const ctx = load(['backupDue'], { S: { profile: { setupAt: now - 3 * day }, backup: {} } });
  assert.equal(ctx.backupDue(now), false);                 // first week: no nag
  ctx.S.profile.setupAt = now - 10 * day;
  assert.equal(ctx.backupDue(now), true);                  // never backed up
  ctx.S.backup = { lastAt: now - 5 * day };
  assert.equal(ctx.backupDue(now), false);
  ctx.S.backup = { lastAt: now - 40 * day, snoozeAt: now - 2 * day };
  assert.equal(ctx.backupDue(now), false);                 // snoozed
  ctx.S.backup = { lastAt: now - 40 * day, snoozeAt: now - 8 * day };
  assert.equal(ctx.backupDue(now), true);
});

test('CSP connect-src allows every host the service worker fetches (it runs under the same CSP)', () => {
  const fs = require('fs'), path = require('path');
  const root = path.join(__dirname, '..');
  const csp = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'))).headers.flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy').value;
  const connect = csp.split(';').map(s => s.trim()).find(s => s.startsWith('connect-src'));
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const hosts = [...html.matchAll(/https:\/\/(fonts\.[a-z.]+)/g)].map(m => m[1]);
  for (const h of new Set([...hosts, 'fonts.gstatic.com'])) assert(connect.includes('https://' + h), `connect-src missing ${h}`);
});

test('plateGap: flags missing veg / protein, but not on mixed-dish days', () => {
  const { plateGap } = load(['mealMix', 'plateCounts', 'plateGap'], { FOODS });
  const day = (...ms) => ({ meals: ms.map(([plate, kcal = 150, qty = 1]) => ({ plate, kcal, qty })) });
  assert.equal(plateGap(day(['karbo'], ['protein'])), 'sayur');
  assert.equal(plateGap(day(['karbo'], ['protein'], ['serat'])), '');
  assert.equal(plateGap(day(['karbo'], ['karbo'], ['serat'])), 'protein');
  assert.equal(plateGap(day(['karbo'], ['karbo'], ['serat'], ['lain', 400])), '');   // nasi lemak: contents unknown
  assert.equal(plateGap(day(['karbo'], ['karbo'], ['serat'], ['lain', 5])), 'protein'); // kopi O doesn't count as a dish
  assert.equal(plateGap(day()), '');
});

test('mixed-dish presets count by their make-up', () => {
  const { plateCounts, plateGap } = load(['mealMix', 'plateCounts', 'plateGap'], { FOODS });
  const log = (...ids) => ({ meals: ids.map(([foodId, qty = 1]) => ({ foodId, plate: 'lain', kcal: 300 * qty, qty })) });
  assert.deepEqual({ ...plateCounts(log(['nlemak', 2])) }, { serat: 0, protein: 1, karbo: 2, lain: 0 });
  assert.equal(plateGap(log(['nlemak'], ['mgoreng'])), 'sayur');           // nasi lemak + mee goreng: no veg
  assert.equal(plateGap(log(['rcanai', 2], ['ulam'])), 'protein');         // 2 roti canai: karbo only
  assert.equal(plateGap(log(['ncampur'], ['ncampur'])), '');               // nasi campur already has lauk + sayur
  assert.equal(plateCounts(log(['pisang'])).serat, 1);                     // fruit counts with sayur & buah
  for (const f of FOODS) if (f.mix) assert(Object.keys(f.mix).every(k => ['serat', 'protein', 'karbo'].includes(k)), f.id);
});

test('scanned mixed dishes count by their saved make-up', () => {
  const { plateCounts } = load(['mealMix', 'plateCounts'], { FOODS });
  const d = { meals: [
    { foodId: 'scan_x1', plate: 'lain', mix: { karbo: 1, protein: 0.5 }, qty: 0.5, kcal: 150 },
    { foodId: 'scan_x2', plate: 'lain', mix: { karbo: 1, protein: 0.5, serat: 0.5 }, qty: 1, kcal: 320 },
    { foodId: 'scan_x3', plate: 'lain', qty: 1, kcal: 200 }                       // older logs without mix
  ] };
  assert.deepEqual({ ...plateCounts(d) }, { serat: 0.5, protein: 0.75, karbo: 1.5, lain: 1 });
});

test('isSweetMeal: presets by flag, own foods / AI menus by name', () => {
  assert(isSweetMeal({ foodId: 'tehtarik', name: 'Teh tarik' }));
  assert(!isSweetMeal({ foodId: 'kopio', name: 'Kopi O / teh O kosong' }));
  assert(!isSweetMeal({ foodId: 'kopisusu', name: 'Kopi / teh susu kurang manis' }));
  assert(isSweetMeal({ foodId: 'c_1', name: 'Milo ais kaw' }));
  assert(isSweetMeal({ name: 'Jus oren' }));
  assert(!isSweetMeal({ name: 'Teh tarik kurang manis' }));
  assert(!isSweetMeal({ name: 'Teh O kosong' }));
  assert(!isSweetMeal({ name: 'Nasi lemak' }));
  assert(!isSweetMeal({ name: 'Ayam masak kicap' }));
});

test('coach: nudges about sugary drinks after plate gaps', () => {
  const meals = [{ foodId: 'ncampur', plate: 'lain', kcal: 550, qty: 1 }, { foodId: 'ncampur', plate: 'lain', kcal: 550, qty: 1 }, { foodId: 'milo', name: 'Milo ais', plate: 'lain', kcal: 190, qty: 1 }];
  const { coach } = load(['mealMix', 'plateCounts', 'plateGap', 'coach'], { FOODS, isSweetMeal,
    S: { profile: { kcalMin: 1200, kcalMax: 1400, waterGoal: 2000, name: '' }, settings: { reminders: { water: true } } },
    peekDay: () => ({ meals, water: 0 }), todayKey: () => 'x', kcalOf: d => d.meals.reduce((a, m) => a + m.kcal, 0), fmt: String, esc: x => x });
  assert.match(coach().msg, /dalam sasaran, pinggan pun seimbang\. Air manis hari ini ~190 kcal/);
});

test('recent AI menus: newest first, deduped, capped at 10, survive bad storage', () => {
  const store = {};
  const localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
  const { rememberAIMenus, recentAIMenus } = load(['AI_RECENT_KEY', 'recentAIMenus', 'rememberAIMenus'], { localStorage, JSON, Array, Set, String });
  rememberAIMenus([{ name: 'Mee hoon sup' }, { name: 'Nasi lemak separuh' }]);
  rememberAIMenus([{ name: 'Capati + dal' }, { name: 'mee hoon sup' }]);
  assert.deepEqual([...recentAIMenus()], ['Capati + dal', 'mee hoon sup', 'Nasi lemak separuh']);
  rememberAIMenus(Array.from({ length: 15 }, (_, i) => ({ name: 'M' + i })));
  assert.equal(recentAIMenus().length, 10);
  store['dietpal.aiRecent'] = '{bad json';
  assert.deepEqual([...recentAIMenus()], []);
});

test('weeklyChange: compares with ~7 days back, says "since" for older, ignores very old', () => {
  const { weeklyChange } = load(['parseKey', 'sortedWeights', 'weeklyChange'], { S: { weights: [] } });
  const run = ws => { const ctx = load(['parseKey', 'sortedWeights', 'weeklyChange'], { S: { weights: ws } }); return ctx.weeklyChange(); };
  assert.equal(weeklyChange(), null);
  // weekly logger: picks the weigh-in 7 days back, not the one 14 days back
  let r = run([{ date: '2026-11-01', kg: 90 }, { date: '2026-11-08', kg: 89.5 }, { date: '2026-11-15', kg: 89 }]);
  assert.deepEqual({ ...r }, { kg: -0.5, days: 7, date: '2026-11-08' });
  // only an old weigh-in 20 days back: real gap is reported
  r = run([{ date: '2026-10-26', kg: 91 }, { date: '2026-11-15', kg: 89 }]);
  assert.equal(r.days, 20); assert.equal(r.date, '2026-10-26');
  // 2 months back: nothing to compare (used to be shown as "7 hari lepas")
  assert.equal(run([{ date: '2026-09-15', kg: 95 }, { date: '2026-11-15', kg: 89 }]), null);
  // only 2 days apart: too short to call a weekly change
  assert.equal(run([{ date: '2026-11-13', kg: 89.4 }, { date: '2026-11-15', kg: 89 }]), null);
});

test('milestoneRow: weeks follow the chosen pace, no NaN when start is missing or equal', () => {
  const mk = profile => load(['esc', 'icon', 'parseKey', 'sortedWeights', 'currentWeight', 'effPace', 'canAuto', 'milestoneRow'], {
    S: { profile, weights: [{ date: '2026-11-15', kg: 90 }] } });
  let html = mk({ startWeight: 100, pace: '0.25', milestones: [{ name: 'Fasa 1', kg: 85 }] }).milestoneRow({ name: 'Fasa 1', kg: 85 }, 0);
  assert.match(html, /5\.0 kg lagi · anggaran 20 minggu/);
  html = mk({ startWeight: 100, pace: '0.5', milestones: [{ name: 'Fasa 1', kg: 85 }] }).milestoneRow({ name: 'Fasa 1', kg: 85 }, 0);
  assert.match(html, /anggaran 10 minggu/);
  for (const p of [{ startWeight: null, pace: '0.5' }, { startWeight: 85, pace: '0.5' }]) {
    html = mk({ ...p, milestones: [{ name: 'F', kg: 85 }] }).milestoneRow({ name: 'F', kg: 85 }, 0);
    assert(!html.includes('NaN'), html);
  }
});

test('deleting a weight recalculates targets', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(src, /case 'delWeight':[^\n]*recalcTargets\(\)/);
});

test('weightAverage: 7-day trailing average of weigh-ins', () => {
  const { weightAverage } = load(['parseKey', 'weightAverage']);
  const avg = weightAverage([{ date: '2026-11-01', kg: 90 }, { date: '2026-11-03', kg: 89 }, { date: '2026-11-07', kg: 88 }, { date: '2026-11-08', kg: 91 }]);
  assert.deepEqual(avg.map(v => Math.round(v * 100) / 100), [90, 89.5, 89, 89.33]);   // 1 Nov drops out of the window on 8 Nov
});

test('pace 1 kg/week survives backup restore; effPace is limited by the calorie floor', () => {
  const { sanitizeState } = load(['PYRAMID', 'PY_KEYS', 'COOKS', 'DEFAULTS', 'uid', 'sanitizeState']);
  assert.equal(sanitizeState({ profile: { pace: '1.0' } }).profile.pace, '1.0');
  assert.equal(sanitizeState({ profile: { pace: '2' } }).profile.pace, '0.5');
  const mk = profile => load(['ACTIVITY', 'parseKey', 'sortedWeights', 'currentWeight', 'kcalFloor', 'canAuto', 'autoWater', 'calcTargets', 'effPace'],
    { S: { profile, weights: [] } });
  // small woman, low activity: TDEE ~1,540 → floor 1,200 leaves room for ~0.3 kg/week only
  let p = { sex: 'P', age: 40, height: 152, startWeight: 62, activity: 'rendah', pace: '1.0', kcalMin: 1200, kcalMax: 1400 };
  const e = mk(p).effPace(p); assert(e < 0.5 && e > 0.1, String(e));
  // big man: 1 kg/week is reachable
  p = { sex: 'L', age: 35, height: 175, startWeight: 120, activity: 'sederhana', pace: '1.0', kcalMin: 1700, kcalMax: 1900 };
  assert.equal(mk(p).effPace(p), 1);
  assert.equal(mk({ pace: '0.75' }).effPace({ pace: '0.75' }), 0.75);   // no profile data: chosen pace
});

test('Makan: foodDay shows today or up to 7 days back, never the future (v1.10)', () => {
  const UI = { fday: null }, S = { days: {} };
  const ctx = load(['todayKey', 'parseKey', 'addDays', 'FOOD_BACK_DAYS', 'foodDay', 'niceDate', 'BULAN', 'HARI', 'dayLabel'], { UI, S });
  const t = ctx.todayKey();
  assert.equal(ctx.foodDay(), t);
  UI.fday = ctx.addDays(t, -3); assert.equal(ctx.foodDay(), UI.fday);
  UI.fday = ctx.addDays(t, -7); assert.equal(ctx.foodDay(), UI.fday);
  UI.fday = ctx.addDays(t, -8); assert.equal(ctx.foodDay(), t);       // too old → back to today
  UI.fday = ctx.addDays(t, 1); assert.equal(ctx.foodDay(), t);        // future → today
  UI.fday = 'junk'; assert.equal(ctx.foodDay(), t);
  assert.equal(ctx.dayLabel(t), 'hari ini');
  assert.equal(ctx.dayLabel(ctx.addDays(t, -1)), 'semalam');
  assert.match(ctx.dayLabel(ctx.addDays(t, -3)), /^(Ahad|Isnin|Selasa|Rabu|Khamis|Jumaat|Sabtu), \d+ \w+$/);
});

test('Makan: "Sama macam semalam" copies items with new ids and the drink water (v1.10)', () => {
  const S = { customFoods: [] };
  const { copyMealItems } = load(['uid', 'allFoods', 'findFood', 'copyMealItems'], { S, FOODS });
  const from = [
    { id: 'a1', foodId: 'airkosong', name: 'Air kosong', unit: '1 gelas', qty: 2, kcal: 0, plate: 'lain', meal: 'sarapan', t: 1 },
    { id: 'a2', foodId: 'scan_x', name: 'Nasi lemak (scan)', unit: '1 bungkus', qty: 1, kcal: 450, plate: 'lain', meal: 'sarapan', t: 1, mix: { karbo: 1, protein: 0.5 } }
  ];
  const d = { meals: [], water: 100 };
  copyMealItems(d, from);
  assert.equal(d.meals.length, 2);
  assert(d.meals.every((m, i) => m.id !== from[i].id && m.meal === 'sarapan' && m.kcal === from[i].kcal));
  assert.deepEqual(d.meals[1].mix, { karbo: 1, protein: 0.5 });
  assert.equal(d.water, 100 + 500);
  assert.equal(from[0].id, 'a1');                                        // source day untouched
});

test('mainMeals: counts different main meals, not snacks', () => {
  const { mainMeals } = load(['mainMeals']);
  const d = (...ws) => ({ meals: ws.map(meal => ({ meal, kcal: 100 })) });
  assert.equal(mainMeals(d('sarapan', 'sarapan', 'snek')), 1);
  assert.equal(mainMeals(d('sarapan', 'malam', 'snek', 'snek')), 2);
  assert.equal(mainMeals(d()), 0);
});

test('"Simpan sebagai makanan sendiri": reuses same name & serving, keeps plate make-up through backup (v1.11)', () => {
  const S = { customFoods: [{ id: 'c_old', name: 'Nasi lemak kedai Kak Ros', unit: '1 bungkus', kcal: 400, plate: 'lain' }] };
  const { keepAsOwnFood } = load(['uid', 'keepAsOwnFood'], { S });
  const a = keepAsOwnFood({ name: 'nasi lemak kedai kak ros', unit: '1  bungkus', kcal: 455.4, plate: 'lain', mix: { karbo: 1.5, protein: 0.5 } });
  assert.equal(a.id, 'c_old'); assert.equal(a.kcal, 455); assert.deepEqual(a.mix, { karbo: 1.5, protein: 0.5 });
  assert.equal(S.customFoods.length, 1);
  const b = keepAsOwnFood({ name: 'Teh O ais kurang manis', unit: '1 gelas', kcal: 60, plate: 'lain' });
  assert.match(b.id, /^c_/); assert.equal(S.customFoods.length, 2); assert(!('mix' in b));
  const { sanitizeState } = load(['PYRAMID', 'PY_KEYS', 'COOKS', 'DEFAULTS', 'uid', 'sanitizeState']);
  const out = sanitizeState({ profile: {}, customFoods: S.customFoods });
  assert.deepEqual(out.customFoods[0].mix, { karbo: 1.5, protein: 0.5 });
});

// ---------- v1.12: Piramid Makanan Malaysia 2020 ----------
test('foods.js: pyramid servings match each preset\'s plate group, cooking/whole/salty flags are valid', () => {
  const PYK = ['karbo', 'sayur', 'buah', 'ikan', 'daging', 'kekacang', 'susu'];
  for (const f of FOODS) {
    Object.entries(f.py || {}).forEach(([k, v]) => { assert(PYK.includes(k), f.id + ' ' + k); assert(v > 0 && v <= 3, f.id); });
    if (f.plate === 'karbo') assert(f.py?.karbo > 0, f.id);
    if (f.plate === 'serat') assert(f.py?.sayur > 0 || f.py?.buah > 0, f.id);
    if (f.plate === 'protein') assert(['ikan', 'daging', 'kekacang', 'susu'].some(k => f.py?.[k] > 0), f.id);
    if (f.cook) assert(['goreng', 'lemak', 'sihat'].includes(f.cook), f.id);
  }
  assert.equal(FOODS.find(f => f.id === 'nasip').py.karbo, 1);              // 1 sajian = 2 senduk nasi
  assert.equal(FOODS.find(f => f.id === 'telurr').py.daging, 0.5);           // 2 biji telur = 1 sajian
});

const pyLoad = (S = { customFoods: [] }) => load(['PYRAMID', 'PY_KEYS', 'COOKS', 'pyOf', 'cookOf', 'pyAdd', 'pyZero', 'pyCounts', 'pyramidGap', 'heavyCount'], { FOODS, S });
test('pyCounts: presets from foods.js, scanned items from the log, times portion; gap leaves out karbo', () => {
  const { pyCounts, pyramidGap, heavyCount } = pyLoad();
  const d = { meals: [
    { foodId: 'nasi1', qty: 2, kcal: 260 }, { foodId: 'agoreng', qty: 1, kcal: 290 }, { foodId: 'pisang', qty: 1, kcal: 100 },
    { foodId: 'scan_x', qty: 2, kcal: 300, py: { ikan: 0.5, sayur: 0.5 }, cook: 'lemak' }, { foodId: 'c_own', qty: 1, kcal: 200 }
  ], water: 1500 };
  const c = pyCounts(d);
  assert.deepEqual({ ...c }, { karbo: 1, sayur: 1, buah: 1, ikan: 1, daging: 1, kekacang: 0, susu: 0 });
  assert.deepEqual([...pyramidGap(d)], ['sayur', 'buah', 'kekacang', 'susu']);
  assert.equal(heavyCount(d), 3);                                             // ayam goreng + 2 × santan
});

test('sanitizeState: pyramid servings & cooking kept for logs and own foods, junk dropped', () => {
  const { sanitizeState } = load(['PYRAMID', 'PY_KEYS', 'COOKS', 'DEFAULTS', 'uid', 'sanitizeState']);
  const out = sanitizeState({ profile: {}, days: { '2026-11-15': { meals: [
    { id: 'a', name: 'Laksa', kcal: 450, qty: 1, py: { karbo: 1.03, ikan: 0.5, bogus: 3, sayur: -1, susu: 'x' }, cook: 'lemak' },
    { id: 'b', name: 'Teh', kcal: 90, qty: 1, py: 'nope', cook: 'rebus' }] } },
    customFoods: [{ id: 'c_1', name: 'Laksa Kak Ros', kcal: 450, py: { karbo: 1, ikan: 9 }, cook: 'sihat' }] });
  const [a, b] = out.days['2026-11-15'].meals;
  assert.deepEqual(a.py, { karbo: 1.05, ikan: 0.5 }); assert.equal(a.cook, 'lemak');
  assert(!('py' in b) && !('cook' in b));
  assert.deepEqual(out.customFoods[0].py, { karbo: 1, ikan: 5 }); assert.equal(out.customFoods[0].cook, 'sihat');
});

test('menuQuality: grilled beats fried, fruit/fish favoured when missing today, salt counts more with darah tinggi', () => {
  const S = { customFoods: [], profile: { health: [] } };
  const ctx = load(['PYRAMID', 'PY_KEYS', 'COOKS', 'pyAdd', 'pyZero', 'hasHealth', 'menuQuality'], { FOODS, S });
  const its = (...ids) => ids.map(id => ({ f: FOODS.find(f => f.id === id), qty: 1 }));
  const none = ctx.pyZero(), full = { karbo: 4, sayur: 3, buah: 2, ikan: 1, daging: 1, kekacang: 1, susu: 2 };
  const grill = ctx.menuQuality(its('nasib', 'agrill', 'sayurr'), full, 'tengahari');
  const fried = ctx.menuQuality(its('nasi1', 'agoreng', 'sayurc'), full, 'tengahari');
  assert(grill.score > fried.score + 10);
  assert.deepEqual(grill.tags.map(t => t[1]), ['Bakar / rebus / sup', 'Bijirin penuh']);
  assert.deepEqual(fried.tags.map(t => t[1]), ['Ada goreng']);
  const fruitNeeded = ctx.menuQuality(its('pisang'), none, 'snek').score, fruitDone = ctx.menuQuality(its('pisang'), full, 'snek').score;
  assert.equal(fruitNeeded - fruitDone, 12);
  assert(ctx.menuQuality(its('ikanb'), none, 'malam').tags.some(t => t[1] === 'Ikan'));
  const salty = ctx.menuQuality(its('dagingm'), full, 'malam').score;
  S.profile.health = ['bp'];
  assert.equal(ctx.menuQuality(its('dagingm'), full, 'malam').score, salty - 5);
});

test('boostPlan: activities follow current weight & BMI, walking plan fills the gap left by the calorie floor', () => {
  const names = ['ACTIVITY', 'parseKey', 'sortedWeights', 'currentWeight', 'kcalFloor', 'canAuto', 'autoWater', 'calcTargets', 'effPace',
    'BOOST_ACTS', 'BOOST_WALK_MET', 'MAX_PACE', 'actKcal', 'paceReach', 'boostPlan'];
  const mk = (profile, kg) => load(names, { S: { profile, weights: [{ date: '2026-11-15', kg }] } });
  assert.equal(load(['actKcal']).actKcal(4.3, 90, 30), 149);   // (4.3 − 1) × 90 kg × 0.5 h
  // obese man, auto targets for 0.5 kg/week: knee-friendly list only, reachable, 30 min walk adds ~0.15 kg/week
  let p = { sex: 'L', age: 35, height: 170, activity: 'rendah', pace: '0.5', kcalMode: 'auto' };
  let c = mk(p, 95); const t = c.calcTargets(p); Object.assign(p, { kcalMin: t.min, kcalMax: t.max });
  let b = c.boostPlan(p);
  assert(b.lowImpact); assert(b.acts.every(a => a.low)); assert.equal(b.extraKcal, 0);
  assert.equal(b.walkGain, 0.15); assert.equal(b.reach1, 0.55);   // TDEE ~2,210: 1 kg/week hits the 1,500 floor
  // same man, BMI < 27.5: higher-impact options appear
  b = mk(p, 75).boostPlan(p); assert(!b.lowImpact); assert(b.acts.some(a => a.n === 'Jogging'));
  // small woman at 1 kg/week: floor limits food to ~0.15, the rest becomes a walking target (flagged when > 60 min)
  p = { sex: 'P', age: 40, height: 152, activity: 'rendah', pace: '1.0', kcalMode: 'auto', kcalMin: 1200, kcalMax: 1400 };
  b = mk(p, 62).boostPlan(p);
  assert(b.reach < 0.3 && b.gap > 0.7, JSON.stringify(b)); assert(b.extraKcal > 700); assert(b.walkMin > 60); assert.equal(b.cardMin, 60);
  assert(b.reach + b.cardGain <= 1);
});
