const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
const { FOODS, isSweetMeal } = require('../foods.js');

test('sanitizeState: strips markup, junk and unknown fields', () => {
  const { sanitizeState } = load(['DEFAULTS', 'uid', 'sanitizeState']);
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
  assert.equal(out.push.endpoint, '');
  assert.equal(out.days['2026-11-01'].meals.length, 1);
  assert.equal(Object.keys(out.days).length, 1);
  assert.deepEqual(out.weights, [{ date: '2026-11-01', kg: 85.4 }]);
  assert.equal(out.customFoods.length, 1);
  assert.equal(out.backup.lastAt, 0);
  assert(!('hacked' in out));
});

test('sanitizeState: never throws on garbage', () => {
  const { sanitizeState } = load(['DEFAULTS', 'uid', 'sanitizeState']);
  for (const g of [null, 1, 'x', [], { profile: 5, days: [], weights: {}, customFoods: 'a', settings: [] }]) sanitizeState(g);
});

test('sanitizeState: keeps a normal backup exactly', () => {
  const { sanitizeState } = load(['DEFAULTS', 'uid', 'sanitizeState']);
  const good = {
    profile: { setupDone: true, setupAt: 1, name: 'Siti', sex: 'P', age: 40, height: 155, startWeight: 80, targetWeight: 60, activity: 'aktif', pace: '0.25', kcalMode: 'manual', waterMode: 'auto', kcalMin: 1300, kcalMax: 1500, waterGoal: 2400, waterIdeal: 2600, milestones: [{ name: 'Fasa 1', kg: 70 }], avoid: ['daging'], allergies: ['susu'], noSpicy: true, health: ['diabetes'] },
    settings: { theme: 'dark', textSize: 'big', mealTimes: { sarapan: '08:00', tengahari: '13:00', malam: '20:00' }, reminders: { water: false, meals: true, weigh: true, summary: false, weighDay: 3 }, ai: { consent: true, consentAt: 5, health: false } },
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
