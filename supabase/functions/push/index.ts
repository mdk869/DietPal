// DietPal — push reminders (Supabase Edge Function)
// Actions (POST JSON): subscribe · status · unsubscribe · test · tipfb (👍/👎 on tips) · run (cron only). GET → { publicKey }.
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
    // Production + previews of this Vercel project, plus ALLOWED_ORIGINS (comma-separated, e.g. http://localhost:8000 for testing).
    ok = (o.startsWith("https://") && (h === "dietpal-blond.vercel.app" || /^dietpal-[a-z0-9-]+-techbite-resources-projects\.vercel\.app$/.test(h))) ||
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
async function config(): Promise<Record<string, string>> {
  if (cfg) return cfg;
  const { data } = await db.from("push_config").select("key,value");
  let c: Record<string, string> = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  if (!c.vapid_public || !c.vapid_private) {
    const k = webpush.generateVAPIDKeys();
    await db.from("push_config").upsert([{ key: "vapid_public", value: k.publicKey }, { key: "vapid_private", value: k.privateKey }]);
    const { data: again } = await db.from("push_config").select("key,value");   // keep whichever won a race
    c = Object.fromEntries((again || []).map((r) => [r.key, r.value]));
  }
  webpush.setVapidDetails("mailto:dietpal@users.noreply.github.com", c.vapid_public, c.vapid_private);
  cfg = c;
  return c;
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
    meals: p.meals !== false, water: p.water !== false, weigh: p.weigh !== false, summary: p.summary !== false, tips: p.tips !== false,
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
    tips: cleanTips(s.tips),
  };
}
// "Tips hari ini": the app picks the tip and sends today's & tomorrow's title + short text (v1.8+).
const TIP_ID = /^[a-z0-9-]{1,40}$/;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, max) : "");
function cleanTips(v: unknown) {
  return (Array.isArray(v) ? v : []).slice(0, 2)
    .map((x: any) => ({ d: day(x?.d), id: TIP_ID.test(x?.id) ? x.id : "", t: text(x?.t, 60), s: text(x?.s, 140) }))
    .filter((x) => x.d && x.id && x.t);
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
  // 4. today's tip, 15–60 min before the usual lunch time (the tip list survives midnight: it holds tomorrow's too)
  const lunch = mins(p.mealTimes.tengahari);
  if (p.tips && now.min >= lunch - 60 && now.min < lunch - 15 && fresh("tip")) {
    const tip = cleanTips(row.status?.tips).find((x) => x.d === now.date);
    if (tip) return { key: "tip", title: tip.t, body: tip.s, url: `./?tip=${tip.id}` };
  }
  // 5. water every 2 hours (9am–7pm) when behind
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

// Walks every subscription in pages (keyset on endpoint, so deletions don't shift pages),
// sends due reminders CONCURRENCY at a time, and stops starting new sends after BUDGET_MS
// (anything left is picked up by the next run 15 minutes later).
const PAGE = 1000, CONCURRENCY = 20, BUDGET_MS = 110_000;
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}
async function run() {
  const started = Date.now();
  let checked = 0, sentCount = 0, last = "", stopped = false;
  while (!stopped) {
    let q = db.from("push_subs").select("endpoint,p256dh,auth,tz,prefs,status,sent").order("endpoint").limit(PAGE);
    if (last) q = q.gt("endpoint", last);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    checked += rows.length;
    const todo = rows.map((row) => ({ row, msg: due(row) })).filter((x) => x.msg);
    await pool(todo, CONCURRENCY, async ({ row, msg }) => {
      if (Date.now() - started > BUDGET_MS) { stopped = true; return; }
      const today = localNow(row.tz).date;
      const keys = row.sent?.date === today ? [...(row.sent.keys || []), msg!.key] : [msg!.key];
      await db.from("push_subs").update({ sent: { date: today, keys, last: Date.now() } }).eq("endpoint", row.endpoint);   // mark first: never double-send
      if (await send(row, msg!) === "ok") sentCount++;
    });
    if (rows.length < PAGE) break;
    last = rows[rows.length - 1].endpoint;
  }
  const out = { checked, sent: sentCount, stopped, ms: Date.now() - started };
  console.log("push run", JSON.stringify(out));
  return out;
}

// New subscriptions per IP (hashed) per day — stops someone filling the table with fake rows.
const SUBS_PER_IP_DAY = 20;
async function hash16(v: string) {
  const salt = (await config()).cron_secret || "";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + "|" + v));
  return Array.from(new Uint8Array(buf).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}
const ipHash = (req: Request) => hash16((req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown");

// 👍/👎 on tips: anonymous (phone ID and IP stored only as salted hashes). One row per phone per tip; vote 0 removes it.
const TIPFB_PER_IP_DAY = 300, WHY = /^[a-zA-Z]{0,12}$/;
async function tipFeedback(req: Request, body: any) {
  const device = String(body.device || "");
  const votes = Array.isArray(body.votes) ? body.votes.slice(0, 20) : [];
  if (!/^[0-9a-f-]{36}$/i.test(device) || !votes.length) return { status: 400, out: { error: "bad_request" } };
  const clean = votes.map((v: any) => ({ id: String(v?.id || ""), v: Number(v?.v), why: typeof v?.why === "string" && WHY.test(v.why) ? v.why : "" }))
    .filter((v: any) => TIP_ID.test(v.id) && [1, 0, -1].includes(v.v))
    .filter((v: any, i: number, all: any[]) => all.findLastIndex((x: any) => x.id === v.id) === i);   // last vote per tip wins
  if (!clean.length) return { status: 400, out: { error: "bad_request" } };
  const [dev, ip] = await Promise.all([hash16("tip|" + device), ipHash(req)]);
  const since = new Date(Date.now() - 864e5).toISOString();
  const { count } = await db.from("tip_feedback").select("tip_id", { count: "exact", head: true }).eq("ip_hash", ip).gte("updated_at", since);
  if ((count || 0) >= TIPFB_PER_IP_DAY) return { status: 429, out: { error: "too_many" } };
  const now = new Date().toISOString();
  const up = clean.filter((v: any) => v.v !== 0).map((v: any) => ({ device_hash: dev, tip_id: v.id, vote: v.v, why: v.why || null, ip_hash: ip, updated_at: now }));
  const del = clean.filter((v: any) => v.v === 0).map((v: any) => v.id);
  if (up.length) { const { error } = await db.from("tip_feedback").upsert(up, { onConflict: "device_hash,tip_id" }); if (error) throw error; }
  if (del.length) { const { error } = await db.from("tip_feedback").delete().eq("device_hash", dev).in("tip_id", del); if (error) throw error; }
  return { status: 200, out: { ok: true } };
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
      // Answer the scheduler at once (pg_net waits 30 s at most) and keep sending in the background.
      const job = run().catch((e) => console.error("push run failed", (e as Error)?.message));
      // deno-lint-ignore no-explicit-any
      const rt = (globalThis as any).EdgeRuntime;
      if (rt?.waitUntil) { rt.waitUntil(job); return json({ started: true }, 202, c.headers); }
      return json(await job, 200, c.headers);
    }
    if (!c.ok) return json({ error: "origin" }, 403, c.headers);

    const endpoint = String(body.sub?.endpoint || body.endpoint || "");
    if (body.action === "subscribe") {
      if (!validSub(body.sub)) return json({ error: "bad_subscription" }, 400, c.headers);
      const ip = await ipHash(req);
      const { data: known } = await db.from("push_subs").select("endpoint").eq("endpoint", endpoint).maybeSingle();
      if (!known) {   // re-subscribing the same phone is always allowed
        const since = new Date(Date.now() - 864e5).toISOString();
        const { count } = await db.from("push_subs").select("endpoint", { count: "exact", head: true }).eq("ip_hash", ip).gte("created_at", since);
        if ((count || 0) >= SUBS_PER_IP_DAY) return json({ error: "too_many" }, 429, c.headers);
      }
      const { error } = await db.from("push_subs").upsert({ ip_hash: ip,
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
    if (body.action === "tipfb") {
      const r = await tipFeedback(req, body);
      return json(r.out, r.status, c.headers);
    }
    if (body.action === "unsubscribe") {
      await db.from("push_subs").delete().eq("endpoint", endpoint);
      return json({ ok: true }, 200, c.headers);
    }
    if (body.action === "test") {
      const { data } = await db.from("push_subs").select("*").eq("endpoint", endpoint).maybeSingle();
      if (!data) return json({ error: "unknown" }, 404, c.headers);
      if (data.sent?.test && Date.now() - data.sent.test < 60_000) return json({ error: "too_soon" }, 429, c.headers);   // 1 test a minute
      await db.from("push_subs").update({ sent: { ...(data.sent || {}), test: Date.now() } }).eq("endpoint", endpoint);
      return json({ result: await send(data, { title: "Ujian DietPal", body: "Notifikasi berfungsi.", url: "./" }) }, 200, c.headers);
    }
    return json({ error: "bad_request" }, 400, c.headers);
  } catch (e) {
    console.error("push error", (e as Error)?.message);
    return json({ error: "failed" }, 500, c.headers);
  }
});
