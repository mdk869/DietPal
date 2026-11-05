const test = require('node:test'), assert = require('node:assert');
Object.assign(process.env, { OPENAI_API_KEY: 'test', SUPABASE_URL: 'https://db.example', SUPABASE_SECRET_KEY: 'sb_secret_test', COACH_QUOTA_SECRET: 'sec' });

// Mock Supabase (atomic like Postgres: read+write with no await in between) and OpenAI.
const rows = new Map(); let openaiCalls = 0, lastOpenAI = null, supabaseUp = true;
global.fetch = async (url, opt) => {
  const b = JSON.parse(opt.body);
  if (url.includes('/rpc/coach_usage_add')) {
    if (!supabaseUp) return { ok: false, status: 500, text: async () => 'down' };
    assert.equal(opt.headers.apikey, 'sb_secret_test');
    const out = b.p_keys.map(k => { const r = rows.get(k) || { w: 0, d: 0 }; r.w = Math.max(0, r.w + b.p_add); r.d = Math.max(0, r.d + b.p_add); rows.set(k, r);
      return { o_key: k, o_win: r.w, o_reset: 600, o_day: r.d }; });
    return { ok: true, json: async () => out };
  }
  openaiCalls++; lastOpenAI = b; await new Promise(r => setTimeout(r, 20));
  return { ok: true, json: async () => ({ usage: { total_tokens: 3000 }, choices: [{ message: { content: JSON.stringify({ reply: 'ok', meal: 'tiada', menus: [], safety_note: '' }) } }] }) };
};
const handler = require('../api/coach.js');
const { originAllowed, redFlag, buildUserMessage } = handler._test;
const ORIGIN = 'https://dietpal-blond.vercel.app';
const call = (device, extra = {}) => new Promise(res => {
  const r = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(j) { res({ code: this.statusCode, j }); } };
  handler({ method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4', host: 'dietpal-blond.vercel.app', origin: ORIGIN, ...extra }, body: { question: 'nasi lemak berapa kalori', device, context: {} } }, r);
});
const DEV = '11111111-1111-4111-8111-111111111111';
test.beforeEach(() => { rows.clear(); openaiCalls = 0; supabaseUp = true; });

test('50 parallel questions from one phone: only the budget passes (8k / 3.5k booking → 3)', async () => {
  const res = await Promise.all(Array.from({ length: 50 }, () => call(DEV)));
  assert.equal(res.filter(r => r.code === 200).length, 3);
  assert.equal(openaiCalls, 3);
  assert.equal(rows.get('d:' + DEV).w, 9000);   // settled to real usage (3 × 3000), bookings of rejected requests given back
});

test('rotating device ids are still capped by the IP budget (3×)', async () => {
  const res = await Promise.all(Array.from({ length: 50 }, (_, i) => call(`${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`)));
  assert.equal(res.filter(r => r.code === 200).length, 7);
});

test('fails closed when the quota store is down', async () => {
  supabaseUp = false;
  const r = await call(DEV);
  assert.equal(r.code, 503); assert.equal(openaiCalls, 0);
});

test('emergencies are answered without AI or quota', async () => {
  const r = await new Promise(res => handler({ method: 'POST', headers: { origin: ORIGIN, host: 'x' }, body: { question: 'saya sakit dada dan sesak nafas', context: {} } },
    { setHeader() {}, status(c) { this.c = c; return this; }, json(j) { res({ code: this.c, j }); } }));
  assert.equal(r.code, 200); assert.match(r.j.safety_note, /999/); assert.equal(openaiCalls, 0);
  assert(redFlag('dada rasa sempit')); assert(!redFlag('nasi lemak'));
});

test('origin: required and exact', () => {
  const ok = (origin, host = 'dietpal-blond.vercel.app') => originAllowed({ headers: { origin, host } });
  assert(!ok(undefined));
  assert(ok(ORIGIN));
  assert(ok('https://dietpal-git-fix-x-techbite-resources-projects.vercel.app'));
  assert(!ok('https://dietpal-evil.vercel.app'));
  assert(!ok('https://evil-dietpal.vercel.app'));
  assert(!ok('http://dietpal-blond.vercel.app'));
});

test('presets live in the (cacheable) system message; phone sends only own foods', async () => {
  await call(DEV);
  const [sys, user] = lastOpenAI.messages;
  assert.match(sys.content, /RUJUKAN KCAL APP/); assert.match(sys.content, /Nasi putih 1 senduk 130/);
  assert.doesNotMatch(user.content, /Nasi putih 1 senduk/);
  assert.match(buildUserMessage({ question: 'x', context: { catalog: [{ name: 'Kuih', unit: '1 biji', kcal: 100 }] } }), /Makanan sendiri pengguna.*Kuih 1 biji 100/);
});

test('Coach AI sees today\'s plate balance', () => {
  const msg = buildUserMessage({ question: 'x', context: { eatenToday: [
    { name: 'Nasi putih', kcal: 260, plate: 'karbo', qty: 2 }, { name: 'Ayam goreng', kcal: 290, plate: 'protein' }, { name: 'Teh tarik', kcal: 150, plate: '<b>' }] } });
  assert.match(msg, /Imbangan pinggan hari ini: sayur & buah 0, protein 1, karbo 2, hidangan campur \/ minuman 1/);
  assert.doesNotMatch(buildUserMessage({ question: 'x', context: {} }), /Imbangan pinggan/);
});
