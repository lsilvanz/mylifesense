// Stripe webhook → Supabase entitlement sync.
// Verifies the Stripe signature, then writes the user's live subscription state
// into public.subscriptions (via the service role). The app reads my_plan() to
// decide Plus vs Free, so entitlement is server-verified and cross-device.
//
// Cloudflare Pages env vars (Production):
//   STRIPE_SECRET_KEY       - sk_live_… / sk_test_… (also used by checkout.js)
//   STRIPE_WEBHOOK_SECRET   - whsec_… from the Stripe webhook endpoint
//   SUPABASE_URL            - https://<ref>.supabase.co
//   SUPABASE_SERVICE_KEY    - service_role key (server-only; never in the client)
//
// Stripe Dashboard → Developers → Webhooks → add endpoint:
//   https://mylifesense.app/api/stripe-webhook  (or the pages.dev URL)
//   events: checkout.session.completed, customer.subscription.created,
//           customer.subscription.updated, customer.subscription.deleted

const enc = new TextEncoder();

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Verify Stripe's `t=…,v1=…` signature header against the raw body.
async function verifySignature(raw, header, secret) {
  const parts = Object.fromEntries(
    (header || "").split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i), kv.slice(i + 1)];
    })
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  // Reject if older than 5 minutes (replay protection).
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = await hmacHex(secret, `${t}.${raw}`);
  // Constant-time-ish compare.
  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

async function stripeGet(env, path) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  return r.json();
}

function subFields(sub) {
  return {
    subscription_id: sub.id,
    status: sub.status,
    price_id: sub.items?.data?.[0]?.price?.id ?? null,
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    updated_at: new Date().toISOString(),
  };
}

async function supabase(env, method, pathAndQuery, body, extraHeaders) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "content-type": "application/json",
      ...(extraHeaders || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function handleEvent(event, env) {
  const obj = event.data?.object ?? {};

  if (event.type === "checkout.session.completed") {
    const userId = obj.client_reference_id;
    const customer = obj.customer;
    const subId = obj.subscription;
    if (!userId || !subId) return;
    const sub = await stripeGet(env, `subscriptions/${subId}`);
    await supabase(
      env,
      "POST",
      "subscriptions?on_conflict=user_id",
      { user_id: userId, customer_id: customer, ...subFields(sub) },
      { Prefer: "resolution=merge-duplicates" }
    );
    return;
  }

  if (event.type.startsWith("customer.subscription.")) {
    // These carry the customer but not our user id — match the row by customer.
    const customer = obj.customer;
    if (!customer) return;
    await supabase(
      env,
      "PATCH",
      `subscriptions?customer_id=eq.${encodeURIComponent(customer)}`,
      subFields(obj)
    );
    return;
  }
}

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  const secret = env.STRIPE_WEBHOOK_SECRET;
  const raw = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!secret || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "not_configured" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (!(await verifySignature(raw, sig, secret))) {
    return new Response("invalid signature", { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("invalid payload", { status: 400 });
  }

  try {
    await handleEvent(event, env);
  } catch (e) {
    // Return 500 so Stripe retries.
    return new Response("handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "content-type": "application/json" },
  });
}
