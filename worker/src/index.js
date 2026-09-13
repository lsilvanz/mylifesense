// MyLifeSense reminder sender — a scheduled Cloudflare Worker.
// Runs on a cron, finds due reminders, and sends Web Push notifications.
// Web Push (VAPID + aes128gcm) is implemented with Web Crypto (no deps).
//
// Secrets (wrangler secret put):
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
//   VAPID_SUBJECT (e.g. mailto:you@example.com), RUN_TOKEN (for manual /run)

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env));
  },
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/run") {
      if (url.searchParams.get("token") !== env.RUN_TOKEN) return new Response("forbidden", { status: 403 });
      const n = await run(env);
      return new Response(`sent ${n} reminder(s)`);
    }
    return new Response("mylifesense reminders worker");
  },
};

// ---- Supabase REST helpers (service key bypasses RLS) ----------------------
function sb(env, path, init = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
}

const WINDOW_HOURS = { daily: 20, few_per_week: 44, weekly: 156 };

function nowMinutesInTz(tz) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz || "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour").value);
  const m = Number(parts.find((p) => p.type === "minute").value);
  return h * 60 + m;
}

async function run(env) {
  const remRes = await sb(env, "reminders?enabled=eq.true&select=*");
  if (!remRes.ok) return 0;
  const reminders = await remRes.json();
  const now = Date.now();
  let sent = 0;

  for (const r of reminders) {
    const windowH = WINDOW_HOURS[r.frequency] ?? 20;
    const sinceMs = now - windowH * 3600 * 1000;

    // Already reminded within this window?
    if (r.last_sent_at && new Date(r.last_sent_at).getTime() > sinceMs) continue;

    // Only around the chosen local time (cron runs every 15 min).
    const [th, tm] = String(r.time_local || "09:00").split(":").map(Number);
    const target = th * 60 + tm;
    const nowMin = nowMinutesInTz(r.tz);
    if (nowMin < target || nowMin >= target + 20) continue;

    // Skip if the Sense/factor was already logged within the window.
    const sinceISO = new Date(sinceMs).toISOString();
    const eRes = await sb(
      env,
      `entries?sense_id=eq.${r.sense_id}&logged_at=gte.${sinceISO}&select=id,entry_values(factor_id)`
    );
    const entries = eRes.ok ? await eRes.json() : [];
    const loggedInWindow = r.factor_id
      ? entries.some((e) => (e.entry_values || []).some((v) => v.factor_id === r.factor_id))
      : entries.length > 0;
    if (loggedInWindow) continue;

    // Fetch the user's subscriptions.
    const sRes = await sb(env, `push_subscriptions?user_id=eq.${r.user_id}&select=endpoint,subscription`);
    const subs = sRes.ok ? await sRes.json() : [];
    if (subs.length === 0) continue;

    const senseRes = await sb(env, `senses?id=eq.${r.sense_id}&select=title`);
    const sense = senseRes.ok ? (await senseRes.json())[0] : null;
    let what = sense ? sense.title : "your Sense";
    if (r.factor_id) {
      const fRes = await sb(env, `factors?id=eq.${r.factor_id}&select=label`);
      const f = fRes.ok ? (await fRes.json())[0] : null;
      if (f) what = `${f.label} (${sense ? sense.title : ""})`;
    }
    const payload = JSON.stringify({
      title: "Time to log 📝",
      body: `A quick check-in for ${what}.`,
      url: `/log?sense=${r.sense_id}`,
      tag: `rem-${r.id}`,
    });

    for (const s of subs) {
      try {
        const res = await sendPush(s.subscription, payload, env);
        if (res.status === 404 || res.status === 410) {
          await sb(env, `push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE" });
        } else if (res.ok || res.status === 201) {
          sent++;
        }
      } catch {
        /* skip this subscription */
      }
    }

    await sb(env, `reminders?id=eq.${r.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ last_sent_at: new Date().toISOString() }),
    });
  }
  return sent;
}

// ---- Web Push (VAPID + aes128gcm), Web Crypto only -------------------------
function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  s += "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(bytes) {
  let bin = "";
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...arrs) {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}
const enc = new TextEncoder();

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

async function vapidAuth(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const header = bytesToB64url(enc.encode(JSON.stringify({ alg: "ES256", typ: "JWT" })));
  const body = bytesToB64url(
    enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 43200, sub: env.VAPID_SUBJECT }))
  );
  const signingInput = `${header}.${body}`;

  const pub = b64urlToBytes(env.VAPID_PUBLIC_KEY); // 65 bytes: 0x04 X Y
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: env.VAPID_PRIVATE_KEY.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_"),
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    ext: true,
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signingInput));
  const jwt = `${signingInput}.${bytesToB64url(new Uint8Array(sig))}`;
  return `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`;
}

async function sendPush(subscription, plaintext, env) {
  const endpoint = subscription.endpoint;
  const uaPublic = b64urlToBytes(subscription.keys.p256dh); // 65
  const authSecret = b64urlToBytes(subscription.keys.auth); // 16

  // Ephemeral ECDH keypair (server/application side).
  const asKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey)); // 65
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256)
  );

  // RFC 8291 key schedule.
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const padded = concat(enc.encode(plaintext), new Uint8Array([2])); // 0x02 delimiter
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, padded)
  );

  const rs = new Uint8Array([0, 0, 0x10, 0x00]); // 4096
  const body = concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);

  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "3600",
      Authorization: await vapidAuth(endpoint, env),
    },
    body,
  });
}
