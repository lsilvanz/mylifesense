// Plan / entitlement model. The Free tier is the trial; Plus unlocks everything.
// Plan state is cached client-side (localStorage) for now; a Stripe webhook +
// Supabase sync is the production hardening step (see functions/api/checkout.js).

export type Plan = "free" | "plus";
export type BillingCycle = "monthly" | "annual";

export const PRICING = {
  currency: "NZD",
  monthly: { label: "NZ$9.99", price: 9.99, per: "month" },
  annual: { label: "NZ$79", price: 79, per: "year", perMonth: "NZ$6.58", savePct: 34 },
} as const;

// Free-tier caps. Everything else (AI insights/chat, integrations, export, …) is
// Plus-only and gated via isPlus().
export const FREE_LIMITS = {
  activeSenses: 1,
  factorsPerSense: 5,
} as const;

const PLAN_KEY = "mylifesense.plan";
const PENDING_KEY = "mylifesense.pendingPlan";

export function getStoredPlan(): Plan {
  if (typeof window === "undefined") return "free";
  try {
    return window.localStorage.getItem(PLAN_KEY) === "plus" ? "plus" : "free";
  } catch {
    return "free";
  }
}

export function setStoredPlan(plan: Plan) {
  try {
    window.localStorage.setItem(PLAN_KEY, plan);
  } catch {
    /* ignore */
  }
}

// A plan the user chose before authenticating (they get sent to Stripe once they
// have an account). Persisted so it survives the OAuth / magic-link round-trip.
export function getPendingPlan(): BillingCycle | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(PENDING_KEY);
    return v === "monthly" || v === "annual" ? v : null;
  } catch {
    return null;
  }
}

export function setPendingPlan(cycle: BillingCycle | null) {
  try {
    if (cycle) window.localStorage.setItem(PENDING_KEY, cycle);
    else window.localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
