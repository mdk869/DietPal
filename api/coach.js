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

GAYA
- Jawab dalam Bahasa Melayu Malaysia yang mudah dan santai (bukan Bahasa Indonesia). Istilah Inggeris biasa boleh.
- Ringkas: "reply" maksimum 3 ayat pendek. Jangan berceramah.
- Cadangkan makanan tempatan yang realistik dan mudah didapati di Malaysia.

PERATURAN KESELAMATAN (WAJIB)
1. Ikut konsep Pinggan Sihat Malaysia (KKM): ½ pinggan sayur & buah, ¼ protein, ¼ karbohidrat.
2. Jangan sesekali cadangkan pengguna skip makan, berpuasa untuk turun berat, atau makan bawah had kalori minimum harian yang diberi.
3. Jangan suruh potong nasi/karbohidrat atau garam sepenuhnya. Kurangkan sikit-sikit sahaja.
4. Patuhi SEMUA pantang makanan dan alahan pengguna. Jangan masukkan bahan itu langsung, termasuk dalam sos, kuah atau sambal.
5. Jika ada nota kesihatan: kencing manis → elak minuman/makanan manis; darah tinggi → kurangkan garam, kicap & makanan proses; gastrik → elak pedas, kopi & perut kosong lama.
6. Jangan beri diagnosis, nasihat ubat atau dos. Jika soalan tentang simptom serius (sakit dada, sesak nafas, pengsan, dll.), nasihatkan jumpa doktor / hubungi 999 dalam "safety_note" dan jangan cadangkan menu.
7. Jika soalan bukan tentang makanan, pemakanan atau gaya hidup sihat, jawab dengan sopan bahawa anda hanya boleh bantu tentang makanan, dan "menus" kosong.
8. Nilai kalori ialah anggaran munasabah; sasarkan jumlah setiap menu dekat dengan sasaran kalori waktu makan yang diberi.
9. Jika waktu makan ialah "soalan umum", jawab soalan pemakanan itu terus dalam "reply". Beri "menus" hanya jika pengguna minta cadangan makanan; jika tidak, biarkan kosong.

OUTPUT
- "menus": 0 hingga 3 pilihan. Setiap item: nama, sukatan rumah (cth: "1 senduk", "1 ketul"), anggaran kcal, dan jenis pinggan: serat (sayur/buah), protein, karbo, atau lain.
- "tip": satu ayat praktikal (cara memesan atau memasak).
- "safety_note": kosongkan ("") jika tiada perkara keselamatan.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'menus', 'safety_note'],
  properties: {
    reply: { type: 'string' },
    safety_note: { type: 'string' },
    menus: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'items', 'tip'],
        properties: {
          name: { type: 'string' },
          tip: { type: 'string' },
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
  if (target) lines.push(`Sasaran kalori untuk waktu makan ini: ~${target} kcal.`);
  if (remaining !== null) lines.push(`Baki kalori hari ini: ${remaining} kcal.`);
  lines.push(`Had kalori minimum harian: ${floor} kcal (jangan cadang kurang dari ini secara keseluruhan).`);
  const eaten = Array.isArray(c.eatenToday) ? c.eatenToday.slice(0, 20).map(x => `${str(x.name, 50)} (${num(x.kcal, 0, 3000) ?? '?'} kcal)`) : [];
  lines.push(`Sudah dimakan hari ini: ${eaten.length ? eaten.join(', ') : 'belum ada'}.`);
  const avoid = [...pick(c.avoid, AVOID), ...pick(c.allergies, ALLERGY), ...(c.noSpicy ? ['makanan pedas'] : [])];
  lines.push(`Pantang / alahan: ${avoid.length ? avoid.join(', ') : 'tiada'}.`);
  const health = pick(c.health, HEALTH);
  if (health.length) lines.push(`Nota kesihatan: ${health.join(', ')}.`);
  const pantry = str(body.pantry, 200);
  if (pantry) lines.push(`Bahan yang ada: ${pantry}.`);
  lines.push('', `Soalan pengguna: ${str(body.question, MAX_QUESTION) || 'Apa yang sesuai saya makan sekarang?'}`);
  return lines.join('\n');
}

// Recompute totals server-side and drop anything malformed.
function clean(out) {
  const menus = Array.isArray(out.menus) ? out.menus.slice(0, 3).map(m => {
    const items = (Array.isArray(m.items) ? m.items : []).slice(0, 8).map(i => ({
      name: str(i.name, 60), unit: str(i.unit, 30) || '1 hidangan',
      kcal: num(i.kcal, 0, 1500) ?? 0,
      plate: ['serat', 'protein', 'karbo', 'lain'].includes(i.plate) ? i.plate : 'lain'
    })).filter(i => i.name);
    return { name: str(m.name, 70), tip: str(m.tip, 200), items, kcal: items.reduce((a, i) => a + i.kcal, 0) };
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
  if (JSON.stringify(body).length > 8000) return res.status(413).json({ error: 'too_large' });

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        max_completion_tokens: 900,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage(body) }
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'coach_reply', strict: true, schema: SCHEMA } }
      })
    });
    clearTimeout(timer);
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('OpenAI error', r.status, detail.slice(0, 500));
      return res.status(502).json({ error: r.status === 429 ? 'upstream_busy' : 'upstream' });
    }
    const data = await r.json();
    const msg = data?.choices?.[0]?.message;
    if (msg?.refusal) return res.status(200).json({ reply: 'Maaf, Coach tak dapat jawab soalan itu. Cuba tanya tentang makanan.', safety_note: '', menus: [] });
    let parsed;
    try { parsed = JSON.parse(msg?.content || '{}'); } catch { return res.status(502).json({ error: 'bad_output' }); }
    return res.status(200).json(clean(parsed));
  } catch (e) {
    console.error('Coach error', e?.name, e?.message);
    return res.status(504).json({ error: e?.name === 'AbortError' ? 'timeout' : 'failed' });
  }
};

// exported for local tests
module.exports._test = { buildUserMessage, clean, originAllowed, SCHEMA };
