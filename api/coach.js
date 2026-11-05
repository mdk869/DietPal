// DietPal — Coach AI (Vercel serverless function)
// Reads OPENAI_API_KEY (required) and OPENAI_MODEL (optional) from Vercel environment variables.
// Token quota: SUPABASE_URL, SUPABASE_SECRET_KEY (or legacy SUPABASE_ANON_KEY), COACH_QUOTA_SECRET (+ optional COACH_* limits, see README).
// The key never reaches the browser or the repo.

const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const { FOODS } = require('../foods.js');   // same presets the app uses
const MAX_QUESTION = 300;
const RATE_LIMIT = Number(process.env.COACH_RATE_LIMIT || 12);   // requests per IP per window
const RATE_WINDOW_MS = 10 * 60 * 1000;                             // 10 minutes
const hits = new Map();   // best-effort, per server instance — used only when COACH_QUOTA_OPTIONAL=1 and no quota env (local dev)

// Token quota (stored in Supabase table coach_usage, so it survives restarts and can't be reset from the phone).
// Counted per device id AND per IP (hashed); the IP budget is larger because many phones can share one IP.
const QUOTA = {
  url: String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
  // Server-only secret key (sb_secret_…) is preferred: then coach_usage_add needs no public (anon) access at all.
  key: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY || '',
  secret: process.env.COACH_QUOTA_SECRET || '',
  windowSec: Math.round(Number(process.env.COACH_WINDOW_MIN || 15) * 60),
  perWindow: Number(process.env.COACH_TOKENS_WINDOW || 8000),
  perDay: Number(process.env.COACH_TOKENS_DAY || 30000),
  ipFactor: Number(process.env.COACH_IP_FACTOR || 3),
  // Tokens booked before calling OpenAI (≈ one question), settled to the real usage afterwards.
  // Booking first is atomic in Postgres, so many requests sent at once can't all slip past the limit.
  reserve: Number(process.env.COACH_RESERVE || 3500)
};

const MEALS = { sarapan: 'sarapan', tengahari: 'makan tengah hari', malam: 'makan malam', snek: 'snek' };
const VENUES = { gerai: 'gerai / warung', mamak: 'kedai mamak', campur: 'kedai nasi campur', kopitiam: 'kopitiam',
  segera: 'restoran makanan segera', kenduri: 'kenduri', kedai: 'kedai serbaneka' };
const AVOID = { daging: 'daging lembu/kambing', ayam: 'ayam', ikan: 'ikan', laut: 'makanan laut & belacan' };
const ALLERGY = { kacang: 'kacang', telur: 'telur', susu: 'susu/laktosa' };
const HEALTH = { diabetes: 'kencing manis', bp: 'darah tinggi', gastrik: 'gastrik' };

// Principles, not micromanagement: the user's question comes first.
const SYSTEM_PROMPT = `Anda ialah Coach DietPal — seorang pembantu pemakanan yang mesra dan berpengetahuan untuk orang Malaysia yang sedang cuba turun berat badan secara sihat.

UTAMAKAN SOALAN PENGGUNA
- Faham betul-betul apa yang ditanya, dan jawab soalan itu. Jika soalan menyebut waktu makan (cth: "tengah hari", "esok pagi") atau tempat (cth: "mamak", "kenduri", "rumah"), IKUT soalan — walaupun berbeza dengan tetapan app.
- Isi "meal" dengan waktu makan yang menu anda maksudkan (sarapan / tengahari / malam / snek), atau "tiada" jika tiada menu.
- "reply": jawapan yang berguna dan spesifik dalam 1–3 ayat. Boleh sebut cadangan utama dan sebabnya. Elak ayat umum yang kosong.
- Jangan ulang nota kesihatan atau pantang pengguna dalam setiap jawapan — patuhi secara senyap. Sebut hanya jika ia memang berkait dengan soalan.
- Jangan sebut "di luar" atau "di rumah" melainkan soalan atau tetapan app menyatakannya. Tetapan "di rumah" → cadang masakan rumah, bukan kedai.
- Soalan tentang data hari ini (cth: "berapa kalori saya makan hari ini?") → guna angka dari konteks app sahaja, jangan kira semula.
- Kalori bukan satu-satunya ukuran. Jika imbangan pinggan hari ini kurang sayur atau protein, sebut ringkas dalam "reply" (satu ayat) walaupun kalori dalam sasaran, dan utamakan menu yang menampung kekurangan itu. Jangan tegur jika kebanyakan makanan ialah hidangan campur — isinya tidak diketahui.

CADANGAN MENU (bila pengguna minta cadangan makan, atau soalan memerlukannya)
- Beri 2–3 hidangan SEBENAR yang memang biasa dipesan atau dimasak di tempat itu di Malaysia (cth di mamak: "Nasi kandar ikan bakar", "Roti telur + dal", "Mee hoon sup"). Nama menu = nama hidangan yang orang kenal.
- Untuk sarapan, tengah hari dan malam, setiap menu ialah HIDANGAN LENGKAP yang mengenyangkan: ada protein, karbohidrat (nasi, mee, roti, ubi, oat) dan sayur. Jangan jadikan sayur sahaja atau sup sahaja sebagai satu menu.
- "items" ialah komponen hidangan itu dengan sukatan rumah (senduk, ketul, keping, mangkuk, cawan) dan anggaran kcal yang munasabah. Jangan cantum makanan yang tak masuk akal dalam satu menu. Jika satu item sudah mewakili hidangan penuh (cth "Mee hoon sup 1 mangkuk"), jangan tambah item lain yang sudah ada di dalamnya.
- Ikut Pinggan Sihat Malaysia (KKM): ½ sayur & buah, ¼ protein, ¼ karbohidrat. Utamakan bakar, kukus, rebus atau sup. Minuman: air kosong, teh O / kopi O kosong, atau kurang manis.
- Sasarkan jumlah kcal setiap menu dalam julat waktu makan yang diberi.
- Jika pengguna sebut bahan yang ada (cth: "telur, kobis & ayam"), gunakan bahan-bahan itu.
- Untuk soalan fakta (kalori, waktu makan, boleh/tidak, cara), jawab terus dalam "reply" dan biarkan "menus" KOSONG — jangan tambah menu kecuali pengguna minta cadangan makan.
- "tip": satu ayat praktikal untuk hidangan itu.

KESELAMATAN (WAJIB)
- Patuhi SEMUA pantang & alahan pengguna, termasuk dalam kuah, sambal dan minuman.
- Jangan cadang skip makan, puasa untuk kurus, atau makan bawah had kalori minimum harian. Jangan suruh buang nasi atau garam sepenuhnya — kurangkan sikit-sikit.
- Nota kesihatan: kencing manis → elak manis; darah tinggi → kurangkan garam & kicap; gastrik → elak pedas, kopi & perut kosong lama.
- "safety_note" HANYA untuk risiko keselamatan sebenar (simptom, alahan dalam soalan, bahaya). Untuk soalan makanan biasa, biarkan kosong — jangan isi dengan peringatan umum.
- Tiada diagnosis, ubat atau dos. Simptom serius → nasihat jumpa doktor / hubungi 999 dalam "safety_note", "menus" kosong.
- Soalan bukan tentang makanan atau pemakanan → jawab dengan sopan bahawa anda hanya bantu tentang makanan; "menus" kosong.

Bahasa: Bahasa Melayu Malaysia yang mudah dan santai (bukan Bahasa Indonesia). Istilah Inggeris biasa boleh. Nama hidangan dalam huruf biasa (cth: "Ikan bakar", bukan "Ikan Bakar").`;

// App presets as kcal reference. Kept in the system message, which is identical for every request,
// so OpenAI's automatic prompt caching can reuse it (cached input tokens cost much less).
const PRESETS = FOODS.map(f => ({ name: f.name, unit: f.unit, kcal: f.kcal }));
const SYSTEM_MESSAGE = `${SYSTEM_PROMPT}

RUJUKAN KCAL APP (anggaran untuk sukatan biasa; guna jika sama, tidak wajib, dan BUKAN senarai cadangan — tetap patuhi pantang & alahan):
${PRESETS.map(f => `${f.name} ${f.unit} ${f.kcal}`).join('; ')}.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'meal', 'menus', 'safety_note'],
  properties: {
    reply: { type: 'string', description: 'Jawapan terus & spesifik kepada soalan, 1–3 ayat.' },
    meal: { type: 'string', enum: ['sarapan', 'tengahari', 'malam', 'snek', 'tiada'], description: 'Waktu makan untuk menu yang dicadangkan.' },
    safety_note: { type: 'string', description: 'Amaran keselamatan jika perlu; jika tiada, string kosong.' },
    menus: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'items', 'tip'],
        properties: {
          name: { type: 'string', description: 'Nama hidangan sebenar yang orang kenal.' },
          tip: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'unit', 'kcal', 'plate'],
              properties: {
                name: { type: 'string' },
                unit: { type: 'string', description: 'Sukatan rumah, cth "1 senduk", "1 ketul".' },
                kcal: { type: 'integer' },
                plate: { type: 'string', enum: ['serat', 'protein', 'karbo', 'lain'] }
              }
            }
          }
        }
      }
    }
  }
};

// ---------- helpers ----------
const str = (v, max = 80) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : null; };
const pick = (arr, dict) => (Array.isArray(arr) ? arr.filter(k => dict[k]).map(k => dict[k]) : []);
const norm = t => String(t).toLowerCase().replace(/\s+/g, ' ').trim();

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_LIMIT) { hits.set(ip, list); return true; }
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();   // keep memory bounded
  return false;
}
// ---------- token quota ----------
const crypto = require('crypto');
const quotaEnabled = () => Boolean(QUOTA.url && QUOTA.key && QUOTA.secret);
function quotaKeys(req, body) {
  const keys = ['ip:' + crypto.createHash('sha256').update(QUOTA.secret + '|' + clientIp(req)).digest('hex').slice(0, 32)];
  const dev = typeof body.device === 'string' ? body.device.trim().toLowerCase() : '';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(dev)) keys.unshift('d:' + dev);
  return keys;
}
// Adds `tokens` to every key (negative = give back, floored at 0) and returns the rows, or null if Supabase can't be reached.
async function quotaAdd(keys, tokens) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const headers = { 'Content-Type': 'application/json', apikey: QUOTA.key };
    if (!QUOTA.key.startsWith('sb_')) headers.Authorization = `Bearer ${QUOTA.key}`;   // legacy JWT keys (anon / service_role)
    const r = await fetch(`${QUOTA.url}/rest/v1/rpc/coach_usage_add`, {
      method: 'POST', signal: ctrl.signal, headers,
      body: JSON.stringify({ p_secret: QUOTA.secret, p_keys: keys, p_add: Math.round(tokens) || 0, p_window: QUOTA.windowSec })
    });
    if (!r.ok) { console.error('Quota error', r.status, (await r.text().catch(() => '')).slice(0, 200)); return null; }
    const rows = await r.json();
    return Array.isArray(rows) ? rows : null;
  } catch (e) { console.error('Quota error', e?.name, e?.message); return null; }
  finally { clearTimeout(timer); }
}
const secsToMidnightMY = (now = Date.now()) => {
  const my = new Date(now + 8 * 3600e3);   // Malaysia = UTC+8, no DST
  return 86400 - (my.getUTCHours() * 3600 + my.getUTCMinutes() * 60 + my.getUTCSeconds());
};
// Which budget is used up (if any), and how much of the tightest window budget is left.
// `pending` = tokens this request has just booked: it is blocked only if the budget was already used up before it.
function quotaState(rows, now = Date.now(), pending = 0) {
  let blocked = null, left = 1, resetIn = QUOTA.windowSec;
  for (const r of rows || []) {
    const f = String(r.o_key).startsWith('ip:') ? QUOTA.ipFactor : 1;
    const winMax = QUOTA.perWindow * f, dayMax = QUOTA.perDay * f;
    if (r.o_day - pending >= dayMax) blocked = { scope: 'day', retry_after: secsToMidnightMY(now) };
    else if (r.o_win - pending >= winMax && !blocked) blocked = { scope: 'window', retry_after: Math.max(1, r.o_reset) };
    const lw = 1 - r.o_win / winMax, ld = 1 - r.o_day / dayMax, l = Math.max(0, Math.min(lw, ld));
    if (l < left) { left = l; resetIn = ld < lw ? secsToMidnightMY(now) : r.o_reset; }
  }
  return { blocked, left: Math.round(left * 100) / 100, reset_in: resetIn };
}

// Browsers always send Origin on a POST, so a request without one is not from the app.
// Note: this only stops other websites; scripts can fake headers — the token quota is the real limit.
// Allowed: the site itself (production or a preview of this project), plus ALLOWED_ORIGINS (comma-separated).
const PREVIEW = /^dietpal-[a-z0-9-]+-techbite-resources-projects\.vercel\.app$/;
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  let u;
  try { u = new URL(origin); } catch { return false; }
  const extra = String(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (extra.includes(origin)) return true;
  return u.protocol === 'https:' && (u.host === req.headers.host || u.host === 'dietpal-blond.vercel.app' || PREVIEW.test(u.host));
}
function targetRange(target, meal) {
  const tol = meal === 'snek' ? 0.4 : 0.2;
  return [Math.round(target * (1 - tol) / 10) * 10, Math.round(target * (1 + tol) / 10) * 10];
}
function mealTargets(c) {
  const out = {};
  const src = c.mealTargets && typeof c.mealTargets === 'object' ? c.mealTargets : {};
  for (const k of Object.keys(MEALS)) { const v = num(src[k], 60, 1500); if (v) out[k] = v; }
  return out;
}

// Serious symptoms: answer deterministically (no AI call) so the emergency advice is always shown.
const RED_FLAGS = [/sakit\s*dada|dada[^.,?!]{0,15}(sakit|sempit|ketat|berat|sesak|pedih)|chest\s*pain/i, /sesak\s*nafas|susah\s*(nak\s*)?bernafas|tak\s*boleh\s*bernafas/i,
  /pengsan|tak\s*sedarkan\s*diri|hampir\s*pitam/i, /(lemah|kebas|lumpuh)\s*(sebelah|separuh)|muka\s*(senget|herot)|cakap\s*pelat/i,
  /muntah\s*darah|berak\s*darah|najis\s*(hitam|berdarah)/i, /sawan|kejang\s*seluruh/i, /sakit\s*kepala\s*(paling|sangat|teramat)\s*teruk/i];
function redFlag(q) { return RED_FLAGS.some(r => r.test(q || '')); }
const EMERGENCY = {
  reply: 'Simptom ini perlu diperiksa segera, bukan diurus dengan makanan.',
  safety_note: 'Hubungi 999 atau pergi ke unit kecemasan terdekat sekarang. Jangan memandu sendiri jika rasa tidak sihat.',
  meal: 'tiada', menus: []
};

// Servings per plate group from the phone's log; "lain" = mixed dishes and drinks (contents unknown).
const PLATE_LABEL = { serat: 'sayur & buah', protein: 'protein', karbo: 'karbo', lain: 'hidangan campur / minuman' };
function plateSummary(list) {
  const c = { serat: 0, protein: 0, karbo: 0, lain: 0 };
  list.forEach(x => { const k = PLATE_LABEL[x?.plate] ? x.plate : 'lain'; const q = Number(x?.qty); c[k] += Number.isFinite(q) ? Math.min(10, Math.max(0.25, q)) : 1; });
  return Object.entries(c).map(([k, v]) => `${PLATE_LABEL[k]} ${Math.round(v * 10) / 10}`).join(', ') + ' (bilangan hidangan)';
}

// Only whitelisted, size-limited fields reach the model.
function buildUserMessage(body) {
  const c = body.context || {};
  const general = c.meal === 'umum' || !MEALS[c.meal];
  const targets = mealTargets(c);
  const lines = ['KONTEKS DARI APP'];
  if (general) lines.push('Tetapan app: soalan umum (tiada waktu makan dipilih).');
  else {
    const where = c.location === 'luar' ? `di luar${VENUES[c.venue] ? ` (${VENUES[c.venue]})` : ''}` : 'di rumah';
    lines.push(`Tetapan app: ${MEALS[c.meal]}, ${where}. (Jika soalan sebut waktu makan atau tempat lain, ikut soalan.)`);
  }
  const t = Object.entries(targets).map(([k, v]) => { const [lo, hi] = targetRange(v, k); return `${MEALS[k]} ${lo}–${hi}`; });
  if (t.length) lines.push(`Julat kcal setiap menu ikut waktu makan: ${t.join('; ')} kcal.`);
  const remaining = num(c.remainingKcal, -3000, 5000), floor = num(c.minDailyKcal, 1200, 1500) || 1500;
  if (remaining !== null) lines.push(`Baki kalori hari ini: ${remaining} kcal. Had minimum harian: ${floor} kcal.`);
  const list = Array.isArray(c.eatenToday) ? c.eatenToday.slice(0, 30) : [];
  const eaten = list.map(x => `${str(x.name, 50)} (${num(x.kcal, 0, 3000) ?? '?'} kcal)`);
  const total = list.reduce((a, x) => a + (num(x.kcal, 0, 3000) || 0), 0);
  const range = Array.isArray(c.dailyRange) ? c.dailyRange.map(v => num(v, 800, 5000)) : [];
  if (range[0] && range[1]) lines.push(`Sasaran kalori harian: ${range[0]}–${range[1]} kcal.`);
  lines.push(`Sudah dimakan hari ini: ${eaten.length ? `${eaten.join(', ')}. JUMLAH: ${total} kcal` : 'belum ada'}.`);
  if (list.length) lines.push(`Imbangan pinggan hari ini: ${plateSummary(list)}.`);
  const avoid = [...pick(c.avoid, AVOID), ...pick(c.allergies, ALLERGY), ...(c.noSpicy ? ['makanan pedas'] : [])];
  lines.push(`Pantang / alahan: ${avoid.length ? avoid.join(', ') : 'tiada'}.`);
  const health = pick(c.health, HEALTH);
  if (health.length) lines.push(`Nota kesihatan: ${health.join(', ')}.`);
  const catalog = cleanCatalog(c.catalog);
  if (catalog.length) lines.push(`Makanan sendiri pengguna (rujukan kcal; tidak wajib): ${catalog.map(f => `${f.name} ${f.unit} ${f.kcal}`).join('; ')}.`);
  lines.push('', `SOALAN PENGGUNA: ${str(body.question, MAX_QUESTION) || 'Apa yang sesuai saya makan sekarang?'}`);
  return lines.join('\n');
}

function cleanCatalog(list) {
  return Array.isArray(list) ? list.slice(0, 60).map(f => ({ name: str(f?.name, 50), unit: str(f?.unit, 30), kcal: num(f?.kcal, 0, 1500) }))
    .filter(f => f.name && f.unit && f.kcal !== null) : [];
}
// "Sayur Campur Goreng" → "Sayur campur goreng"
function sentenceCase(t) {
  const w = t.split(' ').filter(x => /[a-z]/i.test(x));
  const caps = w.filter(x => /^[A-Z][a-z]/.test(x)).length;
  if (w.length > 1 && caps >= 2 && caps / w.length >= 0.6) return t.charAt(0) + t.slice(1).toLowerCase();
  return t;
}
const MEASURES = ['senduk', 'pinggan', 'ketul', 'keping', 'mangkuk', 'biji', 'cawan', 'gelas', 'tin', 'piring', 'bungkus', 'cucuk', 'sudu', 'genggam', 'ekor', 'tongkol', 'hidangan'];
function parseUnit(u) {
  const t = norm(u).replace(/½/g, ' 1/2').replace(/¼/g, ' 1/4');
  let n = 0, m;
  if ((m = t.match(/(\d+(?:[.,]\d+)?)\s+(\d)\/(\d)/))) n = parseFloat(m[1].replace(',', '.')) + Number(m[2]) / Number(m[3]);
  else if ((m = t.match(/(\d)\/(\d)/))) n = Number(m[1]) / Number(m[2]);
  else if ((m = t.match(/(\d+(?:[.,]\d+)?)/))) n = parseFloat(m[1].replace(',', '.'));
  if (!n && /setengah|separuh/.test(t)) n = 0.5;
  return { n: n > 0 ? n : 1, word: MEASURES.find(w => t.includes(w)) };
}
// Same food + same measure word → app preset kcal (scaled by amount)
function presetKcal(name, unit, catalog) {
  const cands = catalog.filter(f => norm(f.name) === norm(name));
  if (!cands.length) return null;
  const exact = cands.find(f => norm(f.unit) === norm(unit));
  if (exact) return exact.kcal;
  const u = parseUnit(unit), same = cands.find(f => { const p = parseUnit(f.unit); return p.word && p.word === u.word; });
  if (!same) return null;
  return Math.round(same.kcal * u.n / parseUnit(same.unit).n);
}
const FRUIT = /buah|epal|pisang|oren|betik|tembikai|mangga|jambu|anggur|nanas|kurma/i;
const menuTotal = items => Math.round(items.reduce((a, i) => a + i.kcal * i.qty, 0));

// Recompute totals server-side, align kcal with the app's presets, drop anything malformed.
function clean(out, catalog = []) {
  const menus = Array.isArray(out.menus) ? out.menus.slice(0, 3).map(m => {
    const items = (Array.isArray(m.items) ? m.items : []).slice(0, 8).map(i => {
      const name = sentenceCase(str(i.name, 60)), unit = str(i.unit, 30) || '1 hidangan';
      return { name, unit, qty: 1, kcal: presetKcal(name, unit, catalog) ?? num(i.kcal, 0, 1500) ?? 0,
        plate: ['serat', 'protein', 'karbo', 'lain'].includes(i.plate) ? i.plate : 'lain' };
    }).filter(i => i.name);
    return { name: sentenceCase(str(m.name, 70)), tip: str(m.tip, 200), items, kcal: menuTotal(items) };
  }).filter(m => m.name && m.items.length) : [];
  const meal = MEALS[out.meal] ? out.meal : null;
  return { reply: str(out.reply, 600), safety_note: str(out.safety_note, 300), meal, menus };
}

// Light-touch portion fit: only when a menu is clearly outside the range, nudge portions
// (protein → carbs while ≤ 40% of the menu → fruit → veg / one-dish meals; too high → carbs first).
function fitPortions(menu, lo, hi, catalog, meal) {
  const items = menu.items.map(i => ({ ...i }));
  const rice = catalog.find(f => /^nasi putih$/i.test(f.name) && /senduk/.test(f.unit));
  if (meal !== 'snek' && rice && !items.some(i => i.plate === 'karbo') && menuTotal(items) + rice.kcal <= hi + 40)
    items.push({ name: rice.name, unit: rice.unit, qty: 1, kcal: rice.kcal, plate: 'karbo' });
  const fruit = catalog.find(f => /^buah/i.test(f.name));
  let total = menuTotal(items), adjusted = items.length !== menu.items.length;
  for (let step = 0; step < 8 && (total < lo || total > hi); step++) {
    let changed = false;
    if (total < lo) {
      const fits = i => i && total + i.kcal * 0.5 <= hi + 40;
      const carbKcal = items.filter(i => i.plate === 'karbo').reduce((a, i) => a + i.kcal * i.qty, 0);
      const carb = items.find(i => i.plate === 'karbo' && i.qty < 2);
      const carbOk = carb && (carbKcal + carb.kcal * 0.5) <= 0.4 * hi;
      const it = [items.find(i => i.plate === 'protein' && i.qty < 1.5), carbOk ? carb : null].find(fits);
      if (it) { it.qty += 0.5; changed = true; }
      else if (fruit && !items.some(i => FRUIT.test(i.name)) && total + fruit.kcal <= hi + 40) {
        items.push({ name: fruit.name, unit: fruit.unit, qty: 1, kcal: fruit.kcal, plate: 'serat' }); changed = true;
      } else {
        const more = [items.find(i => i.plate === 'serat' && !FRUIT.test(i.name) && i.qty < 2),
          items.find(i => i.plate === 'lain' && i.qty < 1.5), items.find(i => i.plate === 'protein' && i.qty < 2)].find(fits)
          || items.find(i => i.qty < 2 && fits(i));
        if (more) { more.qty += 0.5; changed = true; }
      }
    } else {
      const it = [...items].sort((a, b) => b.kcal * b.qty - a.kcal * a.qty)
        .find(i => (i.plate === 'karbo' || i.plate === 'lain') && i.qty > 0.5);
      if (it) { it.qty -= 0.5; changed = true; }
    }
    if (!changed) break;
    adjusted = true; total = menuTotal(items);
  }
  return { ...menu, items, kcal: total, adjusted };
}

async function callOpenAI(messages) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        max_completion_tokens: 1200,
        messages,
        response_format: { type: 'json_schema', json_schema: { name: 'coach_reply', strict: true, schema: SCHEMA } }
      })
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('OpenAI error', r.status, detail.slice(0, 500));
      const err = new Error('upstream'); err.status = r.status; throw err;
    }
    const data = await r.json();
    const msg = data?.choices?.[0]?.message;
    const tokens = Number(data?.usage?.total_tokens) || 0;
    if (msg?.refusal) return { refusal: true, tokens };
    try { return { parsed: JSON.parse(msg?.content || '{}'), tokens }; }
    catch { const err = new Error('bad_output'); err.tokens = tokens; throw err; }
  } finally { clearTimeout(timer); }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method' }); }
  if (!originAllowed(req)) return res.status(403).json({ error: 'origin' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'not_configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'bad_request' });
  if (JSON.stringify(body).length > 16000) return res.status(413).json({ error: 'too_large' });
  if (redFlag(body.question)) return res.status(200).json(EMERGENCY);   // emergencies never count against the quota

  // Token quota: book QUOTA.reserve tokens first (atomic), call OpenAI, then settle to the real usage.
  // Fails closed: if the quota store is missing or unreachable, Coach AI pauses instead of running unmetered.
  // COACH_QUOTA_OPTIONAL=1 (local dev only) falls back to the in-memory request limit when no quota env is set.
  const keys = quotaKeys(req, body);
  let booked = 0;
  if (quotaEnabled()) {
    const rows = await quotaAdd(keys, QUOTA.reserve);
    if (!rows) return res.status(503).json({ error: 'quota_unavailable' });
    booked = QUOTA.reserve;
    const st = quotaState(rows, Date.now(), booked);
    if (st.blocked) {
      await quotaAdd(keys, -booked);   // give the booking back
      res.setHeader('Retry-After', String(st.blocked.retry_after));
      return res.status(429).json({ error: 'quota', ...st.blocked });
    }
  } else if (process.env.COACH_QUOTA_OPTIONAL !== '1') {
    console.error('Coach quota not configured (SUPABASE_URL / SUPABASE_ANON_KEY / COACH_QUOTA_SECRET)');
    return res.status(503).json({ error: 'not_configured' });
  } else if (rateLimited(clientIp(req))) return res.status(429).json({ error: 'rate_limited' });
  // Settle once: charge the real tokens minus what was booked (0 tokens = full refund).
  let settled = false;
  const charge = async (tokens = 0) => {
    if (!booked || settled) return null;
    settled = true;
    const rows = await quotaAdd(keys, (Math.round(tokens) || 0) - booked);
    if (!rows) return null;
    const st = quotaState(rows);
    return { left: st.left, reset_in: st.reset_in };
  };

  const c = body.context || {};
  const catalog = [...cleanCatalog(c.catalog), ...PRESETS], targets = mealTargets(c);   // user's own foods win on name match
  try {
    const ai = await callOpenAI([{ role: 'system', content: SYSTEM_MESSAGE }, { role: 'user', content: buildUserMessage(body) }]);
    console.log('Coach tokens', ai.tokens);
    const quota = await charge(ai.tokens);
    if (ai.refusal) return res.status(200).json({ reply: 'Maaf, Coach tak dapat jawab soalan itu. Cuba tanya tentang makanan.', safety_note: '', meal: null, menus: [], quota });
    const out = clean(ai.parsed, catalog);

    // The meal the menus are for: what the AI understood from the question, else the app setting.
    const meal = out.meal || (MEALS[c.meal] ? c.meal : null) || (MEALS[c.nowMeal] ? c.nowMeal : null);
    out.meal = out.menus.length ? meal : out.meal;
    if (meal && targets[meal] && out.menus.length) {
      const [lo, hi] = targetRange(targets[meal], meal);
      out.menus = out.menus.map(m => {
        const f = (m.kcal < lo * 0.95 || m.kcal > hi * 1.05) ? fitPortions(m, lo, hi, catalog, meal) : m;
        return { ...f, offTarget: f.kcal < lo ? 'low' : f.kcal > hi ? 'high' : '' };
      });
      out.range = [lo, hi];
    }
    out.quota = quota;
    return res.status(200).json(out);
  } catch (e) {
    console.error('Coach error', e?.name, e?.message, e?.status);
    await charge(e?.tokens || 0);   // real usage, or a full refund if OpenAI used nothing
    if (e?.status) return res.status(502).json({ error: e.status === 429 ? 'upstream_busy' : 'upstream' });
    if (e?.name === 'AbortError') return res.status(504).json({ error: 'timeout' });
    return res.status(502).json({ error: e?.message === 'bad_output' ? 'bad_output' : 'failed' });
  }
};

// exported for local tests
module.exports._test = { plateSummary, quotaKeys, quotaState, secsToMidnightMY, QUOTA, buildUserMessage, clean, originAllowed, sentenceCase, redFlag, targetRange, fitPortions, presetKcal, parseUnit, SCHEMA };
