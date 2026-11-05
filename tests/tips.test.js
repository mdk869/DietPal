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

test('tipSeason: dated windows and the year-end window that wraps into January', () => {
  assert.equal(T.tipSeason('2026-11-08').id, 'deepavali');
  assert.equal(T.tipSeason('2026-12-25').id, 'hujungtahun');
  assert.equal(T.tipSeason('2027-01-02').id, 'hujungtahun');
  assert.equal(T.tipSeason('2027-02-15').id, 'cny');   // CNY window wins over the overlapping start of Ramadan
  assert.equal(T.tipSeason('2027-03-01').id, 'ramadan');
  assert.equal(T.tipSeason('2026-11-20'), null);
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
