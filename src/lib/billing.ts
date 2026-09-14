import type { BillingCycle } from "./plan";

// Kick off a Stripe Checkout subscription. Redirects to Stripe's hosted page on
// success. Returns an error code when billing isn't configured on this
// deployment (no STRIPE_SECRET_KEY / price IDs) or the request fails — the
// caller shows an appropriate message.
export async function startCheckout(
  cycle: BillingCycle,
  userId?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cycle, userId, origin: window.location.origin }),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (data.url) {
      window.location.href = data.url;
      return { ok: true };
    }
    return { ok: false, error: data.error || "unavailable" };
  } catch {
    return { ok: false, error: "network" };
  }
}
