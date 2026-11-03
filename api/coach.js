// DietPal — Coach AI (Vercel serverless function)
// Reads OPENAI_API_KEY (required) and OPENAI_MODEL (optional) from Vercel environment variables.
// The key never reaches the browser or the repo.

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_QUESTION = 300;
const RATE_LIMIT = Number(process.env.COACH_RATE_LIMIT || 12);   // requests per IP per window
const RATE_WINDOW_MS = 10 * 60 * 1000;                             // 10 minutes
const hits = new Map();   // best-effort, per server instance

const MEALS = { sarapan: 'sarapan', tengahari: 'makan tengah hari', malam: 'makan malam', snek: 'snek' };
const VENUES = { gerai: 'gerai / warung', mamak: 'kedai mamak', campur: 'kedai nasi campur', kopitiam: 'kopitiam',
  segera: 'restoran makanan segera', kenduri: 'kenduri', kedai: 'kedai serbaneka' };
const AVOID = { daging: 'daging lembu/kambing', ayam: 'ayam', ikan: 'ikan', laut: 'makanan laut & belacan' };
const ALLERGY = { kacang: 'kacang', telur: 'telur', susu: 'susu/laktosa' };
const HEALTH = { diabetes: 'kencing manis', bp: 'darah tinggi', gastrik: 'gastrik' };

const SYSTEM_PROMPT = `Anda ialah Coach DietPal, pembantu pemakanan yang mesra untuk pengguna di Malaysia.

CARA MENJAWAB
1. Baca soalan pengguna dengan teliti dan jawab SOALAN ITU dahulu, secara terus, dalam ayat pertama "reply".
   - Soalan kalori ("berapa kalori X?") → beri anggaran kcal dengan sukatan (cth: "Nasi lemak biasa (1 bungkus) sekitar 400 kcal.").
   - Soalan boleh/tidak ("boleh makan X?") → jawab ya/tidak/boleh dengan syarat, dan sebab ringkas.
   - Soalan cara ("macam mana nak…") → beri 1–2 langkah paling penting.
   - Minta cadangan makan ("nak makan apa", "apa sesuai", "nak masak apa", "pilihan terbaik") → reply ringkas + menus.
2. "reply" maksimum 2 ayat pendek. JANGAN sebut nama hidangan, item atau jumlah kcal menu dalam reply — semua itu sudah dipaparkan dalam kad menu.
3. Bahasa Melayu Malaysia yang mudah dan santai (bukan Bahasa Indonesia). Istilah Inggeris biasa boleh.

MENU
4. Beri 2–3 pilihan menu yang berbeza HANYA jika pengguna minta cadangan makanan atau soalan itu memerlukannya. Untuk soalan fakta/kalori/boleh-tidak, "menus" kosong kecuali pengguna minta cadangan.
5. Menu mesti realistik untuk lokasi yang diberi. Utamakan hidangan dalam "Hidangan lazim di tempat ini" dan item dalam "Rujukan makanan". Jangan cadang hidangan yang jarang dijual di tempat itu.
6. Untuk item yang ada dalam "Rujukan makanan", guna NAMA, SUKATAN dan KCAL yang sama tepat. Item lain: anggarkan dengan munasabah.
6b. Utamakan pilihan lebih sihat: bakar, kukus, rebus, sup atau tumis sikit minyak, berbanding goreng & bersantan. Paling banyak SATU menu boleh jadi hidangan kegemaran yang kurang sihat (cth: nasi lemak, mee goreng), dengan portion kecil.
6c. Minuman: air kosong, teh O / kopi O kosong, atau kurang manis sahaja. Jangan cadang teh tarik, Milo, sirap atau minuman manis kecuali pengguna minta.
6d. Nasi: guna sukatan "1 senduk" (1 senduk ≈ ¼ pinggan), bukan "1 pinggan penuh".
7. Setiap item = satu komponen makanan atau minuman (cth: "Nasi putih", "Ikan bakar / kukus", "Teh O kosong"). Nama dalam huruf biasa (cth: "Sayur campur goreng", bukan "Sayur Campur Goreng").
8. WAJIB: jumlah kcal setiap menu berada dalam "Julat kcal setiap menu" yang diberi. Kira jumlah sebelum menjawab. Jika kurang, tambah sukatan (cth: "1½ senduk" nasi, "2 biji" telur) atau tambah item seperti buah, sup atau minuman susu rendah lemak. Ikut Pinggan Sihat Malaysia (KKM): ½ sayur & buah, ¼ protein, ¼ karbohidrat — setiap menu ada sayur atau buah.
9. Jika pengguna sebut bahan atau hidangan tertentu (cth: "ada telur, kobis & ayam"), SETIAP bahan itu mesti muncul sebagai item dengan namanya sendiri dalam menu (cth: "Kobis goreng", "Telur dadar", "Ayam grill"). Bahan pengguna lebih penting daripada "Rujukan makanan".
10. "tip" mesti selari dengan item dalam menu yang sama (jangan sebut cara masak atau bahan lain).
10b. Jika waktu makan ialah "soalan umum": jawab soalan itu terus. Beri "menus" hanya jika pengguna minta cadangan makanan — dan jika ya, ikut julat kcal untuk waktu makan semasa yang diberi.

KESELAMATAN (WAJIB)
11. Jangan cadang skip makan, puasa untuk turun berat, atau makan bawah had kalori minimum harian.
12. Jangan suruh potong nasi/karbohidrat atau garam sepenuhnya. Kurangkan sikit-sikit sahaja.
13. Patuhi SEMUA pantang & alahan — termasuk dalam sos, kuah, sambal dan minuman.
14. Nota kesihatan: kencing manis → elak manis; darah tinggi → kurangkan garam, kicap & makanan proses; gastrik → elak pedas, kopi & perut kosong lama.
15. Tiada diagnosis, nasihat ubat atau dos. Simptom serius (sakit dada, sesak nafas, pengsan, dll.) → nasihat jumpa doktor / hubungi 999 dalam "safety_note", "menus" kosong.
16. Soalan bukan tentang makanan/pemakanan/gaya hidup sihat → jawab sopan bahawa anda hanya bantu tentang makanan; "menus" kosong.

"tip": satu ayat praktikal untuk menu itu (cara memesan atau memasak). "safety_note": "" jika tiada.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'menus', 'safety_note'],
  properties: {
    reply: { type: 'string', description: 'Jawapan terus kepada soalan, maksimum 2 ayat. JANGAN sebut nama hidangan, item atau kcal menu.' },
    safety_note: { type: 'string', description: 'Amaran keselamatan jika perlu; jika tiada, string kosong.' },
    menus: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'items', 'tip'],
        properties: {
          name: { type: 'string', description: 'Nama menu pendek, huruf biasa (cth: "Ikan bakar dengan nasi").' },
          tip: { type: 'string', description: 'Satu ayat cara memesan/memasak yang selari dengan item menu ini.' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'unit', 'kcal', 'plate'],
              properties: {
                name: { type: 'string' },
                unit: { type: 'string' },
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
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;   // same-origin fetches from some browsers omit Origin
  let host;
  try { host = new URL(origin).host; } catch { return false; }
  const extra = String(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return host === req.headers.host || host.endsWith('.vercel.app') && host.includes('dietpal') || extra.includes(origin);
}

// Only whitelisted, size-limited fields reach the model.
function buildUserMessage(body) {
  const c = body.context || {};
  const general = c.meal === 'umum';
  const meal = general ? 'soalan umum (tiada waktu makan khusus)' : (MEALS[c.meal] || 'waktu makan seterusnya');
  const lines = [];
  lines.push(`Waktu makan: ${meal}.`);
  if (!general) {
    if (c.location === 'luar') lines.push(`Lokasi: di luar${VENUES[c.venue] ? ` (${VENUES[c.venue]})` : ''}.`);
    else lines.push('Lokasi: di rumah.');
  }
  const target = general ? null : num(c.targetKcal, 60, 1500), remaining = num(c.remainingKcal, -3000, 5000);
  const floor = num(c.minDailyKcal, 1200, 1500) || 1500;
  if (target) { const [lo, hi] = targetRange(target, c.meal);
    lines.push(`Sasaran kalori untuk waktu makan ini: ~${target} kcal. Julat kcal setiap menu: ${lo}–${hi} kcal.`); }
  const nowMeal = MEALS[c.nowMeal], nowTarget = num(c.nowTargetKcal, 60, 1500);
  if (general && nowMeal && nowTarget) { const [lo, hi] = targetRange(nowTarget, c.nowMeal);
    lines.push(`Waktu makan semasa: ${nowMeal}. Jika pengguna minta cadangan menu, julat kcal setiap menu: ${lo}–${hi} kcal.`); }
  if (remaining !== null) lines.push(`Baki kalori hari ini: ${remaining} kcal.`);
  lines.push(`Had kalori minimum harian: ${floor} kcal (jangan cadang kurang dari ini secara keseluruhan).`);
  const eaten = Array.isArray(c.eatenToday) ? c.eatenToday.slice(0, 20).map(x => `${str(x.name, 50)} (${num(x.kcal, 0, 3000) ?? '?'} kcal)`) : [];
  lines.push(`Sudah dimakan hari ini: ${eaten.length ? eaten.join(', ') : 'belum ada'}.`);
  const avoid = [...pick(c.avoid, AVOID), ...pick(c.allergies, ALLERGY), ...(c.noSpicy ? ['makanan pedas'] : [])];
  lines.push(`Pantang / alahan: ${avoid.length ? avoid.join(', ') : 'tiada'}.`);
  const health = pick(c.health, HEALTH);
  if (health.length) lines.push(`Nota kesihatan: ${health.join(', ')}.`);
  const venueMenus = Array.isArray(c.venueMenus) ? c.venueMenus.slice(0, 12).map(x => str(x, 70)).filter(Boolean) : [];
  if (venueMenus.length) lines.push(`Hidangan lazim di tempat ini: ${venueMenus.join('; ')}.`);
  const catalog = cleanCatalog(c.catalog);
  if (catalog.length) lines.push(`Rujukan makanan (nama | sukatan | kcal): ${catalog.map(f => `${f.name} | ${f.unit} | ${f.kcal}`).join('; ')}.`);
  const pantry = str(body.pantry, 200);
  if (pantry) lines.push(`Bahan yang ada: ${pantry}.`);
  lines.push('', `Soalan pengguna: ${str(body.question, MAX_QUESTION) || 'Apa yang sesuai saya makan sekarang?'}`);
  return lines.join('\n');
}

function targetRange(target, meal) {
  const tol = meal === 'snek' ? 0.4 : 0.2;
  return [Math.round(target * (1 - tol) / 10) * 10, Math.round(target * (1 + tol) / 10) * 10];
}

// Serious symptoms: answer deterministically (no AI call) so the emergency advice is always shown.
const RED_FLAGS = [/sakit\s*dada|dada[^.,?!]{0,15}(sakit|sempit|ketat|berat|sesak|pedih)|chest\s*pain/i, /sesak\s*nafas|susah\s*(nak\s*)?bernafas|tak\s*boleh\s*bernafas/i,
  /pengsan|tak\s*sedarkan\s*diri|hampir\s*pitam/i, /(lemah|kebas|lumpuh)\s*(sebelah|separuh)|muka\s*(senget|herot)|cakap\s*pelat/i,
  /muntah\s*darah|berak\s*darah|najis\s*(hitam|berdarah)/i, /sawan|kejang\s*seluruh/i, /sakit\s*kepala\s*(paling|sangat|teramat)\s*teruk/i];
function redFlag(q) { return RED_FLAGS.some(r => r.test(q || '')); }
const EMERGENCY = {
  reply: 'Simptom ini perlu diperiksa segera, bukan diurus dengan makanan.',
  safety_note: 'Hubungi 999 atau pergi ke unit kecemasan terdekat sekarang. Jangan memandu sendiri jika rasa tidak sihat.',
  menus: []
};

const FRUIT = /buah|epal|pisang|oren|betik|tembikai|mangga|jambu|anggur|nanas|kurma/i;
const menuTotal = items => Math.round(items.reduce((a, i) => a + i.kcal * i.qty, 0));

// Bring a menu into the kcal range by adjusting portions, the way a dietitian would:
// too low → more carbs (½ serving at a time), then protein, then add fruit; too high → fewer carbs first.
function fitPortions(menu, lo, hi, catalog) {
  const items = menu.items.map(i => ({ ...i }));
  const fruit = catalog.find(f => /^buah/i.test(f.name));
  let total = menuTotal(items), adjusted = false;
  for (let step = 0; step < 8 && (total < lo || total > hi); step++) {
    let changed = false;
    if (total < lo) {
      const fits = i => i && total + i.kcal * 0.5 <= hi + 40;
      const carbKcal = items.filter(i => i.plate === 'karbo').reduce((a, i) => a + i.kcal * i.qty, 0);
      const carb = items.find(i => i.plate === 'karbo' && i.qty < 2);
      const carbOk = carb && (carbKcal + carb.kcal * 0.5) <= 0.4 * hi;   // keep ~¼ plate carbs
      const hasFruit = items.some(i => FRUIT.test(i.name));
      const it = [items.find(i => i.plate === 'protein' && i.qty < 1.5), carbOk ? carb : null].find(fits);
      if (it) { it.qty += 0.5; changed = true; }
      else if (fruit && !hasFruit && total + fruit.kcal <= hi + 40) {
        items.push({ name: fruit.name, unit: fruit.unit, qty: 1, kcal: fruit.kcal, plate: 'serat' }); changed = true;
      } else {
        const more = [items.find(i => i.plate === 'serat' && !FRUIT.test(i.name) && i.qty < 2),
          items.find(i => i.plate === 'lain' && i.qty < 1.5), items.find(i => i.plate === 'protein' && i.qty < 2)].find(fits);
        const any = more || items.find(i => i.qty < 2 && fits(i));   // last resort, e.g. a fruit-only snack
        if (any) { any.qty += 0.5; changed = true; }
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

function cleanCatalog(list) {
  return Array.isArray(list) ? list.slice(0, 120).map(f => ({ name: str(f?.name, 50), unit: str(f?.unit, 30), kcal: num(f?.kcal, 0, 1500) }))
    .filter(f => f.name && f.unit && f.kcal !== null) : [];
}
// "Sayur Campur Goreng" → "Sayur campur goreng" (keeps short all-caps words like "KFC")
function sentenceCase(t) {
  const w = t.split(' ').filter(x => /[a-z]/i.test(x));
  const caps = w.filter(x => /^[A-Z][a-z]/.test(x)).length;
  if (w.length > 1 && caps >= 2 && caps / w.length >= 0.6) return t.charAt(0) + t.slice(1).toLowerCase();
  return t;
}
const norm = t => t.toLowerCase().replace(/\s+/g, ' ').trim();

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
function presetKcal(name, unit, catalog) {
  const cands = catalog.filter(f => norm(f.name) === norm(name));
  if (!cands.length) return null;
  const exact = cands.find(f => norm(f.unit) === norm(unit));
  if (exact) return exact.kcal;
  // "1 pinggan" ≈ "1 pinggan penuh"; "2 senduk" = 2 × "1 senduk"
  const u = parseUnit(unit), same = cands.find(f => { const p = parseUnit(f.unit); return p.word && p.word === u.word; });
  if (!same) return null;
  return Math.round(same.kcal * u.n / parseUnit(same.unit).n);
}

// Recompute totals server-side, align kcal with the app's presets, drop anything malformed.
function clean(out, catalog = []) {
  const menus = Array.isArray(out.menus) ? out.menus.slice(0, 3).map(m => {
    const items = (Array.isArray(m.items) ? m.items : []).slice(0, 8).map(i => {
      const name = sentenceCase(str(i.name, 60)), unit = str(i.unit, 30) || '1 hidangan';
      const preset = presetKcal(name, unit, catalog);
      return { name, unit, qty: 1, kcal: preset ?? num(i.kcal, 0, 1500) ?? 0,
        plate: ['serat', 'protein', 'karbo', 'lain'].includes(i.plate) ? i.plate : 'lain' };
    }).filter(i => i.name);
    return { name: sentenceCase(str(m.name, 70)), tip: str(m.tip, 200), items, kcal: menuTotal(items) };
  }).filter(m => m.name && m.items.length) : [];
  return { reply: str(out.reply, 500), safety_note: str(out.safety_note, 300), menus };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method' }); }
  if (!originAllowed(req)) return res.status(403).json({ error: 'origin' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'not_configured' });
  if (rateLimited(clientIp(req))) return res.status(429).json({ error: 'rate_limited' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'bad_request' });
  if (JSON.stringify(body).length > 16000) return res.status(413).json({ error: 'too_large' });

  if (redFlag(body.question)) return res.status(200).json(EMERGENCY);

  const catalog = cleanCatalog(body.context?.catalog);
  const c = body.context || {};
  const fitMeal = c.meal === 'umum' ? c.nowMeal : c.meal;
  const target = c.meal === 'umum' ? num(c.nowTargetKcal, 60, 1500) : num(c.targetKcal, 60, 1500);
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: buildUserMessage(body) }];
  try {
    const first = await callOpenAI(messages);
    if (first.refusal) return res.status(200).json({ reply: 'Maaf, Coach tak dapat jawab soalan itu. Cuba tanya tentang makanan.', safety_note: '', menus: [] });
    const out = clean(first.parsed, catalog);

    // Fit each menu into this meal's kcal range by adjusting portions (no second AI call).
    if (target && out.menus.length) {
      const [lo, hi] = targetRange(target, fitMeal);
      out.menus = out.menus.map(m => fitPortions(m, lo, hi, catalog));
      out.menus.forEach(m => { m.offTarget = m.kcal < lo ? 'low' : m.kcal > hi ? 'high' : ''; });
      out.range = [lo, hi];
    }
    return res.status(200).json(out);
  } catch (e) {
    console.error('Coach error', e?.name, e?.message, e?.status);
    if (e?.status) return res.status(502).json({ error: e.status === 429 ? 'upstream_busy' : 'upstream' });
    return res.status(e?.message === 'bad_output' ? 502 : 504).json({ error: e?.name === 'AbortError' ? 'timeout' : (e?.message === 'bad_output' ? 'bad_output' : 'failed') });
  }
};

async function callOpenAI(messages) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        max_completion_tokens: 1000,
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
    if (msg?.refusal) return { refusal: true };
    try { return { parsed: JSON.parse(msg?.content || '{}'), raw: msg.content }; }
    catch { throw new Error('bad_output'); }
  } finally { clearTimeout(timer); }
}

// exported for local tests
module.exports._test = { buildUserMessage, clean, originAllowed, sentenceCase, redFlag, targetRange, fitPortions, presetKcal, parseUnit, SCHEMA };
