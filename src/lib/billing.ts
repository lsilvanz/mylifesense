import { supabase, supabaseEnabled } from "./supabase";
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

// Redeem a promo code for Plus via the redeem_promo() RPC, which checks the
// database for the code's validity, expiry and remaining uses, records the
// redemption for this user, and is idempotent per user. Returns the RPC's
// { ok, error } (error ∈ invalid | expired | exhausted | auth).
export async function redeemCode(code: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseEnabled || !supabase) return { ok: false, error: "not_configured" };
  try {
    const { data, error } = await supabase.rpc("redeem_promo", { p_code: code });
    if (error) {
      // RPC missing = migration (supabase/promo.sql) not applied yet.
      const missing = error.code === "PGRST202" || /function|does not exist/i.test(error.message ?? "");
      return { ok: false, error: missing ? "not_configured" : "network" };
    }
    const d = (data ?? {}) as { ok?: boolean; error?: string };
    return { ok: Boolean(d.ok), error: d.error };
  } catch {
    return { ok: false, error: "network" };
  }
}
