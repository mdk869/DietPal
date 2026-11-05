const test = require('node:test'), assert = require('node:assert');
const { load } = require('./helpers');
const T = require('../tips.js');
const { FOODS, isSweetMeal } = require('../foods.js');

test('tips: data is complete and short enough for a notification', () => {
  const ids = new Set();
  const seasons = new Set(T.TIP_SEASONS.map(x => x.id));
  for (const x of T.TIPS) {
    assert(/^[a-z0-9-]{1,40}$/.test(x.id), x.id);
    assert(!ids.has(x.id), 'duplicate ' + x.id); ids.add(x.id);
    assert(T.TIP_CATS[x.cat], x.id + ' cat');
    assert(x.t && x.t.length <= 40, x.id + ' title');
    assert(x.s && x.s.length <= 120, x.id + ' short');
    assert(x.b && x.b.length > x.s.length, x.id + ' body');
    assert(x.ask && x.ask.length <= 300, x.id + ' ask');
    (x.on || []).forEach(k => assert(T.TIP_ORDER.includes(k) && T.TIP_WHY[k], x.id + ' on ' + k));
    if (x.season) assert(seasons.has(x.season), x.id + ' season');
    assert(!/[<>]/.test(x.t + x.s + x.b), x.id + ' no markup');
  }
  for (const k of T.TIP_ORDER) if (k !== 'season') assert(T.TIPS.some(x => (x.on || []).includes(k)), 'no tip for signal ' + k);
});

// Official Malaysian public holiday dates (first day). The calculation may differ by one day (rukyah vs Umm al-Qura).
const OFFICIAL = {
  cny: ['2019-02-05', '2020-01-25', '2021-02-12', '2022-02-01', '2023-01-22', '2024-02-10', '2025-01-29', '2026-02-17', '2027-02-06', '2028-01-26'],
  raya: ['2019-06-05', '2020-05-24', '2021-05-13', '2022-05-03', '2023-04-22', '2024-04-10', '2025-03-31', '2026-03-21', '2027-03-10'],
  haji: ['2019-08-11', '2020-07-31', '2021-07-20', '2022-07-10', '2023-06-29', '2024-06-17', '2025-06-07', '2026-05-27'],
  deepavali: ['2018-11-06', '2019-10-27', '2020-11-14', '2021-11-04', '2022-10-24', '2023-11-12', '2024-10-31', '2025-10-20', '2026-11-08', '2027-10-28']
};
test('tipFestivals: calculated dates match official holidays within one day (no yearly update needed)', () => {
  const days = (a, b) => Math.abs(T.tipDayDiff(a, b));
  for (const [k, list] of Object.entries(OFFICIAL)) for (const off of list) {
    const got = T.tipFestivals(Number(off.slice(0, 4)))[k] || [];
    assert(got.some(d => days(d, off) <= 1), `${k} ${off}: got ${got.join(',') || 'nothing'}`);
  }
  // every future year has every festival (Hijri ones may fall twice, or move into the next/previous year)
  for (let y = 2026; y <= 2040; y++) {
    const f = T.tipFestivals(y), near = [y - 1, y, y + 1].map(T.tipFestivals);
    for (const k of ['cny', 'deepavali']) assert.equal((f[k] || []).length, 1, `${k} ${y}`);
    for (const k of ['ramadan', 'raya', 'haji']) assert(near.some(n => (n[k] || []).length), `${k} ~${y}`);
  }
});

test('tipSeason: windows around each festival, the year-end window, and Ramadan crossing New Year', () => {
  assert.equal(T.tipSeason('2026-11-05').id, 'deepavali');
  assert.equal(T.tipSeason('2026-11-20'), null);
  assert.equal(T.tipSeason('2026-12-25').id, 'hujungtahun');
  assert.equal(T.tipSeason('2027-01-02').id, 'hujungtahun');
  assert.equal(T.tipSeason('2027-02-03').id, 'cny');
  assert.equal(T.tipSeason('2027-02-20').id, 'ramadan');   // CNY window over, still Ramadan
  assert.equal(T.tipSeason('2027-03-01').id, 'ramadan');
  assert.equal(T.tipSeason('2027-03-25').id, 'raya');
  assert.equal(T.tipSeason('2027-05-17').id, 'haji');
  assert.equal(T.tipSeason('2027-10-28').id, 'deepavali');
  assert.equal(T.tipSeason('2031-01-10').id, 'ramadan');   // Ramadan 1452 starts late Dec 2030
  assert.equal(T.tipSeason('2035-06-01'), null);
});

test('pickTip: season first, then signals, then general rotation', () => {
  const s = T.pickTip({ date: '2026-11-05' });
  assert.equal(s.why, 'season'); assert.equal(T.tipById(s.id).season, 'deepavali');
  const p = T.pickTip({ date: '2026-11-20', signals: new Set(['lowProtein', 'newbie']) });
  assert.equal(p.why, 'lowProtein'); assert(T.tipById(p.id).on.includes('lowProtein'));
  const u = T.pickTip({ date: '2026-11-20', signals: new Set(['sweet', 'under']) });
  assert.equal(u.why, 'under');                                       // safety signal outranks the rest
  const g = T.pickTip({ date: '2026-11-20' });
  assert.equal(g.why, ''); assert(!T.tipById(g.id).season);
  assert.deepEqual(T.pickTip({ date: '2026-11-20' }), g);             // same day → same tip
});

test('pickTip: respects dislikes, food conflicts, recent repeats and yesterday\'s reason', () => {
  const on = new Set(['lowProtein']);
  const pool = T.TIPS.filter(x => x.on?.includes('lowProtein'));
  const votes = Object.fromEntries(pool.slice(1).map(x => [x.id, -1]));
  assert.equal(T.pickTip({ date: '2026-11-20', signals: on, votes }).id, pool[0].id);
  // allergic to eggs and no fish: never a tip that mentions them
  for (let d = 1; d <= 28; d++) {
    const x = T.tipById(T.pickTip({ date: `2027-04-${String(d).padStart(2, '0')}`, signals: on, avoid: new Set(['telur', 'ikan']) }).id);
    assert(!(x.tags || []).some(t => t === 'telur' || t === 'ikan'), x.id);
  }
  // all protein tips seen this week → falls through to the general rotation, not a repeat
  const seen = Object.fromEntries(pool.map(x => [x.id, '2026-11-15']));
  const r = T.pickTip({ date: '2026-11-20', signals: on, seen });
  assert(!pool.some(x => x.id === r.id));
  // seen 30+ days ago is allowed again
  assert.equal(T.pickTip({ date: '2026-12-20', signals: on, seen, avoid: new Set() }).why !== undefined, true);
  // yesterday was a protein tip: today prefers another signal when there is one
  assert.equal(T.pickTip({ date: '2026-11-20', signals: new Set(['lowProtein', 'lowVeg']), lastWhy: 'lowProtein' }).why, 'lowVeg');
  assert.equal(T.pickTip({ date: '2026-11-20', signals: on, lastWhy: 'lowProtein' }).why, 'lowProtein');
  // excluded id (today's) never comes back as tomorrow's
  const a = T.pickTip({ date: '2026-11-21' });
  assert.notEqual(T.pickTip({ date: '2026-11-21', exclude: a.id }).id, a.id);
});

test('pickTip: always returns something, even when everything was seen recently', () => {
  const seen = Object.fromEntries(T.TIPS.map(x => [x.id, '2026-11-19']));
  assert(T.pickTip({ date: '2026-11-20', seen }));
});

function signals(days, extra = {}) {
  const S = { profile: { kcalMin: 1400, kcalMax: 1700, waterGoal: 2500, targetWeight: 60, setupAt: Date.parse('2026-01-01'), ...extra.profile }, days, weights: extra.weights || [] };
  const ctx = load(['todayKey', 'parseKey', 'peekDay', 'kcalOf', 'mealMix', 'plateCounts', 'sortedWeights', 'addDays', 'tipSignals'],
    { S, FOODS, isSweetMeal, tipDayDiff: T.tipDayDiff });
  return [...ctx.tipSignals(extra.date || '2026-11-20')].sort();
}
const meal = (foodId, kcal, n = 1) => ({ foodId, name: foodId, kcal, qty: n, plate: 'lain', meal: 'tengahari' });

test('tipSignals: reads the 3 days before, ignores days with too little logged', () => {
  const carbsOnly = { meals: [meal('nasip', 900), meal('nasip', 900)], water: 2600 };          // over target, no protein/veg
  assert.deepEqual(signals({ '2026-11-19': carbsOnly, '2026-11-18': carbsOnly }), ['lowProtein', 'lowVeg', 'over']);
  assert.deepEqual(signals({ '2026-11-19': carbsOnly }), []);                                  // one day is not a pattern
  assert.deepEqual(signals({ '2026-11-20': carbsOnly, '2026-11-19': { meals: [meal('nasip', 900)], water: 0 } }), []);   // today & thin days don't count
  const sweet = { meals: [meal('tehtarik', 120), meal('agrill', 300), meal('sayurr', 80), meal('nasip', 130), meal('telurr', 75), meal('agrill', 300), meal('nasip', 130), meal('sayurr', 80), meal('tehtarik', 120), meal('nasip', 130)], water: 500 };
  assert.deepEqual(signals({ '2026-11-19': sweet, '2026-11-17': sweet }), ['lowWater', 'sweet']);
});

test('tipSignals: lapse, weekend, weight gain & plateau, first week', () => {
  const day = { meals: [meal('nasip', 900), meal('agrill', 900)], water: 2500 };
  assert(signals({ '2026-11-10': day }).includes('lapse'));
  assert(signals({ '2026-11-14': day }, { date: '2026-11-20' }).includes('weekend'));          // 20 Nov 2026 is a Friday; 14 Nov the Saturday before
  assert(!signals({ '2026-11-14': day }, { date: '2026-11-19' }).includes('weekend'));         // only on Fri/Sat
  const w = (date, kg) => ({ date, kg });
  assert(signals({}, { weights: [w('2026-11-10', 80), w('2026-11-19', 81.2)] }).includes('gain'));
  assert(signals({}, { weights: [w('2026-11-02', 80), w('2026-11-10', 80.3), w('2026-11-18', 79.9)] }).includes('plateau'));
  assert(!signals({}, { weights: [w('2026-11-02', 80), w('2026-11-10', 79), w('2026-11-18', 78)] }).includes('plateau'));
  assert(!signals({}, { weights: [w('2026-11-02', 60.2), w('2026-11-10', 60.1), w('2026-11-18', 60)] }).includes('plateau'));   // at target: fine
  assert(signals({}, { profile: { setupAt: Date.parse('2026-11-17T10:00:00') } }).includes('newbie'));
});

test('sanitizeState: tips kept when valid, junk dropped, absent stays absent', () => {
  const { sanitizeState } = load(['DEFAULTS', 'uid', 'sanitizeState']);
  assert(!('tips' in sanitizeState({ profile: { setupDone: true } })));
  const evil = '"><img onerror=x>';
  const out = sanitizeState({ tips: {
    day: { date: '2026-11-05', id: 'protein-murah', why: 'lowProtein' }, next: { date: evil, id: 'x' }, hidden: evil,
    seen: { 'protein-murah': '2026-11-05', [evil]: '2026-11-05', 'gula-jus': evil }, votes: { 'gula-jus': -1, 'air-botol': 5 },
    saved: ['air-botol', 'air-botol', evil], fbq: [{ id: 'gula-jus', v: -1, why: 'sweet' }, { id: evil, v: 1 }, { id: 'air-botol', v: 3 }] } });
  assert(!JSON.stringify(out).includes('onerror'));
  assert.deepEqual(out.tips, {
    day: { date: '2026-11-05', id: 'protein-murah', why: 'lowProtein' }, next: null, hidden: '',
    seen: { 'protein-murah': '2026-11-05' }, votes: { 'gula-jus': -1 }, saved: ['air-botol'], fbq: [{ id: 'gula-jus', v: -1, why: 'sweet' }] });
});
