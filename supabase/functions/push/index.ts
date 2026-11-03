// DietPal — push reminders (Supabase Edge Function)
// Actions (POST JSON): subscribe · status · unsubscribe · test · run (cron only). GET → { publicKey }.
// Stores only the push address, time zone, reminder settings and a small daily status
// (meals logged yes/no, water, kcal total). No name, weight or food list.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const PUSH_HOSTS = [/\.googleapis\.com$/, /\.push\.apple\.com$/, /\.mozilla\.com$/, /\.notify\.windows\.com$/, /\.mozaws\.net$/];
const MEALS: Record<string, string> = { sarapan: "sarapan", tengahari: "makan tengah hari", malam: "makan malam" };
const QUIET_FROM = 22 * 60, QUIET_TO = 7 * 60, MIN_GAP = 45 * 60 * 1000;

const cors = (req: Request) => {
  const o = req.headers.get("origin") || "";
  let ok = false;
  try {
    const h = new URL(o).hostname;
    ok = h === "localhost" || h === "127.0.0.1" || (h.endsWith(".vercel.app") && h.includes("diet")) ||
      (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).includes(o);
  } catch { /* no origin */ }
  return {
    ok,
    headers: {
      "Access-Control-Allow-Origin": ok ? o : "null",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Vary": "Origin",
      "Content-Type": "application/json",
    },
  };
};
const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers });

// ---------- config: VAPID keys generated once, kept server-side ----------
let cfg: Record<string, string> | null = null;
async function config() {
  if (cfg) return cfg;
  const { data } = await db.from("push_config").select("key,value");
  cfg = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  if (!cfg.vapid_public || !cfg.vapid_private) {
    const k = webpush.generateVAPIDKeys();
    await db.from("push_config").upsert([{ key: "vapid_public", value: k.publicKey }, { key: "vapid_private", value: k.privateKey }]);
    const { data: again } = await db.from("push_config").select("key,value");   // keep whichever won a race
    cfg = Object.fromEntries((again || []).map((r) => [r.key, r.value]));
  }
  webpush.setVapidDetails("mailto:dietpal@users.noreply.github.com", cfg.vapid_public, cfg.vapid_private);
  return cfg;
}

// ---------- input cleaning ----------
const hhmm = (v: unknown, d: string) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d);
const int = (v: unknown, lo: number, hi: number, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
function cleanPrefs(p: any = {}) {
  const t = p.mealTimes || {};
  return {
    mealTimes: { sarapan: hhmm(t.sarapan, "07:30"), tengahari: hhmm(t.tengahari, "13:00"), malam: hhmm(t.malam, "20:00") },
    meals: p.meals !== false, water: p.water !== false, weigh: p.weigh !== false, summary: p.summary !== false,
    weighDay: int(p.weighDay, 0, 6, 1),
  };
}
function cleanStatus(s: any = {}) {
  return {
    date: day(s.date),
    logged: Array.isArray(s.logged) ? s.logged.filter((m: string) => MEALS[m] || m === "snek").slice(0, 4) : [],
    water: int(s.water, 0, 20000), waterGoal: int(s.waterGoal, 500, 10000, 2500),
    kcal: int(s.kcal, 0, 20000), kcalMin: int(s.kcalMin, 800, 6000, 1500), kcalMax: int(s.kcalMax, 800, 6000, 1800),
    weighedOn: day(s.weighedOn),
  };
}
function cleanTz(tz: unknown) {
  try { if (typeof tz === "string" && tz.length < 64) { new Intl.DateTimeFormat("en", { timeZone: tz }); return tz; } } catch { /* bad tz */ }
  return "Asia/Kuala_Lumpur";
}
function validSub(sub: any) {
  try {
    const u = new URL(sub?.endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((r) => r.test(u.hostname)) && sub.endpoint.length < 1000 &&
      typeof sub.keys?.p256dh === "string" && sub.keys.p256dh.length < 200 &&
      typeof sub.keys?.auth === "string" && sub.keys.auth.length < 100;
  } catch { return false; }
}

// ---------- scheduling ----------
function localNow(tz: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, min: Number(parts.hour) * 60 + Number(parts.minute), wd };
}
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const fmt = (n: number) => n.toLocaleString("en-MY");

// Returns the single most useful reminder due now, or null.
function due(row: any) {
  const now = localNow(row.tz), p = cleanPrefs(row.prefs);
  const s = row.status?.date === now.date ? cleanStatus(row.status) : cleanStatus({ date: now.date });
  const sent: string[] = row.sent?.date === now.date ? row.sent.keys || [] : [];
  if (now.min >= QUIET_FROM || now.min < QUIET_TO) return null;
  if (row.sent?.last && Date.now() - row.sent.last < MIN_GAP) return null;   // never two reminders close together
  const fresh = (k: string) => !sent.includes(k);

  // 1. meal not logged, 60–150 min after usual time
  if (p.meals) for (const m of ["malam", "tengahari", "sarapan"]) {
    const t = mins(p.mealTimes[m as keyof typeof p.mealTimes]);
    if (now.min >= t + 60 && now.min < t + 150 && !s.logged.includes(m) && fresh("meal-" + m))
      return { key: "meal-" + m, title: `Dah ${MEALS[m]}?`, body: "Jangan lupa log — atau tengok cadangan menu.", url: `./?meal=${m}` };
  }
  // 2. weekly weigh-in morning
  if (p.weigh && now.wd === p.weighDay && now.min >= 7 * 60 + 30 && now.min < 10 * 60 && s.weighedOn !== now.date && fresh("weigh"))
    return { key: "weigh", title: "Hari timbang berat", body: "Timbang pagi, lepas ke tandas, sebelum makan.", url: "./?tab=weight" };
  // 3. night summary
  if (p.summary && now.min >= 21 * 60 + 30 && fresh("summary")) {
    const body = !s.kcal ? "Belum ada makanan dilog hari ini. Sempat log sebelum tidur?"
      : s.kcal < s.kcalMin ? `Hari ini ${fmt(s.kcal)} kcal — bawah sasaran ${fmt(s.kcalMin)}–${fmt(s.kcalMax)}. Ada yang belum dilog?`
      : s.kcal <= s.kcalMax ? `Hari ini ${fmt(s.kcal)} kcal — dalam sasaran. Mantap!`
      : `Hari ini ${fmt(s.kcal)} kcal — lebih sikit dari sasaran ${fmt(s.kcalMax)}. Esok cuba lagi.`;
    return { key: "summary", title: "Ringkasan hari ini", body, url: "./" };
  }
  // 4. water every 2 hours (9am–7pm) when behind
  const h = Math.floor(now.min / 60);
  if (p.water && h >= 9 && h <= 19 && h % 2 === 1 && fresh("water-" + h)) {
    const expected = Math.min(1, (h - 7) / 14) * s.waterGoal;
    if (s.water < expected - 250)
      return { key: "water-" + h, title: "Masa minum air", url: "./?water=1",
        body: s.water ? `Air hari ini ${(s.water / 1000).toFixed(1)} L daripada ${(s.waterGoal / 1000).toFixed(1)} L. Minum segelas sekarang.` : `Belum minum air hari ini? Sasaran ${(s.waterGoal / 1000).toFixed(1)} L — mula dengan segelas sekarang.` };
  }
  return null;
}

async function send(row: any, msg: { title: string; body: string; url: string; key?: string }) {
  await config();
  try {
    await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      JSON.stringify({ title: msg.title, body: msg.body, url: msg.url, tag: msg.key || "dietpal" }), { TTL: 3600, urgency: "normal" });
    return "ok";
  } catch (e) {
    const code = (e as any)?.statusCode;
    if (code === 404 || code === 410) { await db.from("push_subs").delete().eq("endpoint", row.endpoint); return "gone"; }
    console.error("push failed", code, (e as any)?.body?.slice?.(0, 200));
    return "error";
  }
}

async function run() {
  const { data, error } = await db.from("push_subs").select("*").limit(5000);
  if (error) throw error;
  let sentCount = 0;
  for (const row of data || []) {
    const msg = due(row);
    if (!msg) continue;
    const today = localNow(row.tz).date;
    const keys = row.sent?.date === today ? [...(row.sent.keys || []), msg.key] : [msg.key];
    await db.from("push_subs").update({ sent: { date: today, keys, last: Date.now() } }).eq("endpoint", row.endpoint);   // mark first: never double-send
    if (await send(row, msg) === "ok") sentCount++;
  }
  return { checked: data?.length || 0, sent: sentCount };
}

Deno.serve(async (req) => {
  const c = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c.headers });
  try {
    if (req.method === "GET") return json({ publicKey: (await config()).vapid_public }, 200, c.headers);
    if (req.method !== "POST") return json({ error: "method" }, 405, c.headers);
    const raw = await req.text();
    if (raw.length > 8000) return json({ error: "too_large" }, 413, c.headers);
    const body = JSON.parse(raw || "{}");

    if (body.action === "run") {   // pg_cron only
      const secret = (await config()).cron_secret;
      if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "forbidden" }, 403, c.headers);
      return json(await run(), 200, c.headers);
    }
    if (!c.ok) return json({ error: "origin" }, 403, c.headers);

    const endpoint = String(body.sub?.endpoint || body.endpoint || "");
    if (body.action === "subscribe") {
      if (!validSub(body.sub)) return json({ error: "bad_subscription" }, 400, c.headers);
      const { error } = await db.from("push_subs").upsert({
        endpoint, p256dh: body.sub.keys.p256dh, auth: body.sub.keys.auth, tz: cleanTz(body.tz),
        prefs: cleanPrefs(body.prefs), status: cleanStatus(body.status), updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      if (body.welcome) await send({ endpoint, p256dh: body.sub.keys.p256dh, auth: body.sub.keys.auth },
        { title: "Peringatan DietPal dihidupkan", body: "Kami akan ingatkan masa makan, minum air dan timbang berat.", url: "./" });
      return json({ ok: true }, 200, c.headers);
    }
    if (body.action === "status") {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.status) patch.status = cleanStatus(body.status);
      if (body.prefs) patch.prefs = cleanPrefs(body.prefs);
      if (body.tz) patch.tz = cleanTz(body.tz);
      const { data, error } = await db.from("push_subs").update(patch).eq("endpoint", endpoint).select("endpoint");
      if (error) throw error;
      return json({ ok: true, known: !!data?.length }, 200, c.headers);
    }
    if (body.action === "unsubscribe") {
      await db.from("push_subs").delete().eq("endpoint", endpoint);
      return json({ ok: true }, 200, c.headers);
    }
    if (body.action === "test") {
      const { data } = await db.from("push_subs").select("*").eq("endpoint", endpoint).maybeSingle();
      if (!data) return json({ error: "unknown" }, 404, c.headers);
      return json({ result: await send(data, { title: "Ujian DietPal", body: "Notifikasi berfungsi.", url: "./" }) }, 200, c.headers);
    }
    return json({ error: "bad_request" }, 400, c.headers);
  } catch (e) {
    console.error("push error", (e as Error)?.message);
    return json({ error: "failed" }, 500, c.headers);
  }
});
