// Creates a Stripe Checkout session for a MyLifeSense Plus subscription.
// The Stripe secret key lives ONLY here (server-side). Card entry happens on
// Stripe's hosted Checkout page — we never see card data.
//
// Cloudflare Pages env vars (Production, encrypt as secrets):
//   STRIPE_SECRET_KEY     - sk_live_… / sk_test_…
//   STRIPE_PRICE_MONTHLY  - price_… for NZ$9.99/month
//   STRIPE_PRICE_ANNUAL   - price_… for NZ$79/year
// Without them the endpoint returns { error: "not_configured" } and the app
// shows a friendly "billing isn't set up yet" message.

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function onRequestPost(ctx) {
  const { request, env } = ctx;

  const key = env.STRIPE_SECRET_KEY;
  const body = await request.json().catch(() => ({}));
  const cycle = body.cycle === "annual" ? "annual" : "monthly";
  const price = cycle === "annual" ? env.STRIPE_PRICE_ANNUAL : env.STRIPE_PRICE_MONTHLY;

  if (!key || !price) return json({ error: "not_configured" });

  const origin = typeof body.origin === "string" ? body.origin : "https://mylifesense.app";

  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.append("line_items[0][price]", price);
  params.append("line_items[0][quantity]", "1");
  params.set("success_url", `${origin}/app?upgraded=1`);
  params.set("cancel_url", `${origin}/app`);
  params.set("allow_promotion_codes", "true");
  params.set("billing_address_collection", "auto");
  if (body.userId) params.set("client_reference_id", String(body.userId));

  try {
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    const data = await r.json();
    if (!r.ok) return json({ error: (data.error && data.error.message) || "stripe_error" }, 400);
    return json({ url: data.url });
  } catch (e) {
    return json({ error: "stripe_unreachable" }, 502);
  }
}
