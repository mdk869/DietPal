const test = require('node:test'), assert = require('node:assert');
Object.assign(process.env, { OPENAI_API_KEY: 'test', SUPABASE_URL: 'https://db.example', SUPABASE_SECRET_KEY: 'sb_secret_test', COACH_QUOTA_SECRET: 'sec' });

// Mock Supabase (atomic like Postgres) and OpenAI.
const rows = new Map(); let openaiCalls = 0, lastOpenAI = null, supabaseUp = true, openaiFail = false, aiOut = null;
global.fetch = async (url, opt) => {
  const b = JSON.parse(opt.body);
  if (url.includes('/rpc/coach_usage_add')) {
    if (!supabaseUp) return { ok: false, status: 500, text: async () => 'down' };
    const out = b.p_keys.map(k => { const r = rows.get(k) || { w: 0, d: 0 }; r.w = Math.max(0, r.w + b.p_add); r.d = Math.max(0, r.d + b.p_add); rows.set(k, r);
      return { o_key: k, o_win: r.w, o_reset: 600, o_day: r.d }; });
    return { ok: true, json: async () => out };
  }
  openaiCalls++; lastOpenAI = b; await new Promise(r => setTimeout(r, 10));
  if (openaiFail) return { ok: false, status: 500, text: async () => 'boom' };
  return { ok: true, json: async () => ({ usage: { prompt_tokens: 900, completion_tokens: 200 }, choices: [{ message: { content: JSON.stringify(aiOut) } }] }) };
};
const handler = require('../api/scan.js');
const { checkImage, clean, limitState, LIMIT } = handler._test;

// A real (tiny) JPEG header followed by filler, as a data URL.
const JPEG = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]).toString('base64');
const ORIGIN = 'https://dietpal-blond.vercel.app';
const DEV = '22222222-2222-4222-8222-222222222222';
const call = (body = {}, headers = {}) => new Promise(res => {
  const r = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(j) { res({ code: this.statusCode, j }); } };
  handler({ method: 'POST', headers: { 'x-forwarded-for': '5.6.7.8', host: 'dietpal-blond.vercel.app', origin: ORIGIN, ...headers }, body: { image: JPEG, device: DEV, ...body } }, r);
});
const GOOD = { is_food: true, note: 'Kuah santan menambah kalori.', items: [
  { preset: 'nlemak', name: 'x', unit: 'x', kcal: 1, qty: 1, plate: 'lain', confidence: 'tinggi' },
  { preset: '', name: 'Rendang Ayam', unit: '1 ketul', kcal: 250, qty: 1, plate: 'protein', confidence: 'rendah' }
] };
test.beforeEach(() => { rows.clear(); openaiCalls = 0; supabaseUp = true; openaiFail = false; aiOut = GOOD; delete process.env.SCAN_DISABLED; });

test('checkImage: only real JPEG/PNG/WebP data URLs within size', () => {
  assert(checkImage(JPEG));
  assert(!checkImage('data:image/jpeg;base64,' + Buffer.alloc(2000, 7).toString('base64')));   // wrong magic bytes
  assert(!checkImage('data:image/svg+xml;base64,PHN2Zz4='));
  assert(!checkImage('https://example.com/a.jpg'));
  assert(!checkImage('data:image/jpeg;base64,' + 'A'.repeat(950000)));
  assert(!checkImage(123));
});

test('clean: presets win, totals recomputed, junk dropped', () => {
  const out = clean({ is_food: true, note: 'ok', items: [
    { preset: 'nasi1', name: 'Nasi', unit: '?', kcal: 999, qty: 2.2, plate: 'karbo', confidence: 'tinggi' },
    { preset: '', name: 'Ayam Masak Merah', unit: '1 ketul', kcal: 280, qty: 1, plate: 'protein', confidence: 'weird' },
    { preset: 'tiada-id', name: '', unit: '', kcal: 'x', qty: 1, plate: 'x', confidence: 'rendah' },
    { preset: '', name: 'Kuih', unit: '1 biji', kcal: 99999, qty: 50, plate: 'nope', confidence: 'rendah' }
  ] });
  assert.deepEqual(out.items[0], { foodId: 'nasi1', name: 'Nasi putih', unit: '1 senduk', kcal: 130, plate: 'karbo', qty: 2, confidence: 'tinggi' });
  assert.equal(out.items[1].name, 'Ayam masak merah');
  assert.equal(out.items[1].confidence, 'sederhana');
  assert.equal(out.items.length, 3);
  assert.equal(out.items[2].kcal, 2000); assert.equal(out.items[2].qty, 5); assert.equal(out.items[2].plate, 'lain');
  assert.equal(out.kcal, 130 * 2 + 280 + 2000 * 5);
  assert.deepEqual(clean({ is_food: false, items: GOOD.items, note: 'Bukan makanan.' }), { is_food: false, items: [], note: 'Bukan makanan.', kcal: 0 });
  assert.equal(clean(null).items.length, 0);
});

test('scan works, sends image to OpenAI with strict schema, never logged in the response', async () => {
  const r = await call();
  assert.equal(r.code, 200);
  assert.equal(r.j.items[0].foodId, 'nlemak'); assert.equal(r.j.items[0].kcal, 400);
  assert.equal(r.j.kcal, 400 + 250);
  assert.equal(r.j.left, LIMIT.perDay - 1);
  const user = lastOpenAI.messages[1].content;
  assert.equal(user[1].image_url.url, JPEG);
  assert.equal(lastOpenAI.response_format.json_schema.strict, true);
  assert.match(lastOpenAI.messages[0].content, /nlemak: Nasi lemak/);
  assert(!JSON.stringify(r.j).includes('base64'));
});

test('scan limit is its own budget: separate keys from Coach AI', async () => {
  await call();
  assert(rows.has('sd:' + DEV)); assert([...rows.keys()].some(k => k.startsWith('sip:')));
  assert(![...rows.keys()].some(k => k.startsWith('d:') || k.startsWith('ip:')));
});

test('per-window limit: parallel scans from one phone stop at the limit', async () => {
  const res = await Promise.all(Array.from({ length: 10 }, () => call()));
  assert.equal(res.filter(r => r.code === 200).length, LIMIT.perWindow);
  const blocked = res.find(r => r.code === 429);
  assert.equal(blocked.j.error, 'quota'); assert.equal(blocked.j.scope, 'window');
  assert.equal(rows.get('sd:' + DEV).w, LIMIT.perWindow);   // rejected bookings given back
});

test('daily limit', () => {
  assert.equal(limitState([{ o_key: 'sd:x', o_win: 1, o_reset: 60, o_day: LIMIT.perDay }]).blocked, null);
  assert.equal(limitState([{ o_key: 'sd:x', o_win: 1, o_reset: 60, o_day: LIMIT.perDay + 1 }]).blocked.scope, 'day');
  assert.equal(limitState([{ o_key: 'sip:x', o_win: 1, o_reset: 60, o_day: LIMIT.perDay + 1 }]).blocked, null);   // IP budget is larger
});

test('failed scans are refunded', async () => {
  openaiFail = true;
  const r = await call();
  assert.equal(r.code, 502);
  assert.equal(rows.get('sd:' + DEV).d, 0);
});

test('fails closed when the limit store is down; kill switch; bad image; origin', async () => {
  supabaseUp = false;
  assert.equal((await call()).code, 503); assert.equal(openaiCalls, 0);
  supabaseUp = true;
  process.env.SCAN_DISABLED = '1';
  assert.deepEqual((await call()).j, { error: 'paused' });
  delete process.env.SCAN_DISABLED;
  assert.equal((await call({ image: 'data:text/plain;base64,aGVsbG8=' })).j.error, 'bad_image');
  assert.equal((await call({}, { origin: 'https://evil.example' })).code, 403);
  assert.equal(openaiCalls, 0);
});

test('not food → empty items, still counted (stops spam)', async () => {
  aiOut = { is_food: false, items: [], note: 'Gambar terlalu gelap.' };
  const r = await call();
  assert.equal(r.code, 200); assert.equal(r.j.is_food, false); assert.equal(r.j.items.length, 0);
  assert.equal(rows.get('sd:' + DEV).d, 1);
});
