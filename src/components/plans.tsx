"use client";

import { useState } from "react";
import { Button } from "./ui";
import { startCheckout, redeemCode } from "@/lib/billing";
import { PRICING, type BillingCycle } from "@/lib/plan";
import { useStore } from "@/lib/store";

const FREE_FEATURES = [
  "1 active Sense",
  "Up to 5 factors",
  "Unlimited basic logging",
  "Basic pattern analysis",
  "Limited AI insights",
  "Basic voice & reminders",
];

const PLUS_FEATURES = [
  "Unlimited Senses & factors",
  "Full history",
  "Advanced pattern analysis + lag",
  "AI insights & chat",
  "Personal experiments",
  "Integrations (Fitbit & more)",
  "Advanced reports & export",
  "More reminders & automation",
];

function Check({ muted }: { muted?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className={`mt-0.5 h-4 w-4 shrink-0 ${muted ? "text-faint" : "text-accent-ink"}`} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

function CycleToggle({ cycle, onChange }: { cycle: BillingCycle; onChange: (c: BillingCycle) => void }) {
  return (
    <div className="inline-flex items-center rounded-full border border-line bg-raised p-1 text-sm">
      <button
        type="button"
        onClick={() => onChange("monthly")}
        className={`rounded-full px-3 py-1 font-semibold transition ${cycle === "monthly" ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => onChange("annual")}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition ${cycle === "annual" ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
      >
        Annual
        <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent-ink">
          −{PRICING.annual.savePct}%
        </span>
      </button>
    </div>
  );
}

/**
 * Free vs Plus cards. `onStartFree` (optional) is the free CTA; `onChoosePlus`
 * receives the selected billing cycle. Used both in the signup flow (where Plus
 * routes through auth first) and standalone.
 */
export function PlanCards({
  onStartFree,
  onChoosePlus,
  plusBusy,
}: {
  onStartFree?: () => void;
  onChoosePlus: (cycle: BillingCycle) => void;
  plusBusy?: boolean;
}) {
  const [cycle, setCycle] = useState<BillingCycle>("annual");
  const price = cycle === "annual" ? PRICING.annual : PRICING.monthly;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* Free */}
      <div className="flex flex-col rounded-2xl border border-line bg-surface p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-muted">Free</p>
        <p className="mt-1 text-3xl font-extrabold tracking-tight text-ink">$0</p>
        <p className="text-xs text-faint">forever</p>
        <ul className="mt-4 flex-1 space-y-2 text-sm text-muted">
          {FREE_FEATURES.map((f) => (
            <li key={f} className="flex gap-2">
              <Check muted /> {f}
            </li>
          ))}
        </ul>
        {onStartFree && (
          <Button variant="outline" className="mt-5 w-full" onClick={onStartFree}>
            Start free
          </Button>
        )}
      </div>

      {/* Plus */}
      <div className="relative flex flex-col rounded-2xl border-2 border-accent bg-surface p-5 shadow-card">
        <span className="absolute -top-3 left-5 rounded-full bg-gradient-accent px-3 py-1 text-xs font-bold text-white shadow-glow">
          Recommended
        </span>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold uppercase tracking-wide text-accent-ink">Plus</p>
          <CycleToggle cycle={cycle} onChange={setCycle} />
        </div>
        <div className="mt-1 flex items-end gap-1.5">
          <span className="text-3xl font-extrabold tracking-tight text-ink">{price.label}</span>
          <span className="pb-1 text-sm text-faint">/ {price.per}</span>
        </div>
        <p className="text-xs text-faint">
          {cycle === "annual"
            ? `≈ ${PRICING.annual.perMonth}/mo · save ${PRICING.annual.savePct}%`
            : `or ${PRICING.annual.label}/year (save ${PRICING.annual.savePct}%)`}
        </p>
        <ul className="mt-4 flex-1 space-y-2 text-sm text-ink">
          {PLUS_FEATURES.map((f) => (
            <li key={f} className="flex gap-2">
              <Check /> {f}
            </li>
          ))}
        </ul>
        <Button className="mt-5 w-full" disabled={plusBusy} onClick={() => onChoosePlus(cycle)}>
          {plusBusy ? "Starting…" : "Get Plus"}
        </Button>
      </div>
    </div>
  );
}

/** "Have a promo code?" — redeems a code for Plus (validated server-side). */
export function PromoRedeem({
  onRedeemed,
  className = "",
}: {
  onRedeemed?: () => void;
  className?: string;
}) {
  const { setPlanPlus } = useStore();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    const c = code.trim();
    if (!c || busy) return;
    setBusy(true);
    setMsg(null);
    const res = await redeemCode(c);
    setBusy(false);
    if (res.ok) {
      setPlanPlus();
      setMsg({ ok: true, text: "Code applied — you're on Plus! 🎉" });
      onRedeemed?.();
    } else {
      setMsg({
        ok: false,
        text:
          res.error === "not_configured"
            ? "Promo codes aren't set up on this deployment."
            : res.error === "expired"
            ? "That code has expired."
            : res.error === "exhausted"
            ? "That code has reached its limit."
            : res.error === "network"
            ? "Couldn't reach the server. Try again."
            : "That code isn't valid.",
      });
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`text-sm font-medium text-accent-ink underline underline-offset-2 ${className}`}
      >
        Have a promo code?
      </button>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Promo code"
          autoCapitalize="characters"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm uppercase outline-none focus:border-accent"
        />
        <Button disabled={busy || !code.trim()} onClick={submit}>
          {busy ? "…" : "Redeem"}
        </Button>
      </div>
      {msg && (
        <p className={`mt-2 text-sm ${msg.ok ? "text-positive" : "text-negative"}`}>{msg.text}</p>
      )}
    </div>
  );
}

/** In-app upgrade prompt shown when a free user hits a limit or a Plus feature. */
export function UpgradeModal({
  open,
  onClose,
  reason,
}: {
  open: boolean;
  onClose: () => void;
  reason?: string;
}) {
  const { user } = useStore();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  const go = async (cycle: BillingCycle) => {
    setBusy(true);
    setErr(null);
    const res = await startCheckout(cycle, user?.id);
    if (!res.ok) {
      setErr(
        res.error === "not_configured"
          ? "Billing isn't switched on yet — check back soon."
          : "Couldn't start checkout. Please try again."
      );
      setBusy(false);
    }
    // On success the browser redirects to Stripe.
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <p className="text-lg font-extrabold tracking-tight text-ink">Go deeper with Plus</p>
          <button onClick={onClose} className="text-faint hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>
        {reason && <p className="text-sm text-muted">{reason}</p>}
        <ul className="mt-4 space-y-2 text-sm text-ink">
          {PLUS_FEATURES.slice(0, 5).map((f) => (
            <li key={f} className="flex gap-2">
              <Check /> {f}
            </li>
          ))}
        </ul>
        <div className="mt-5 space-y-2">
          <Button className="w-full" disabled={busy} onClick={() => go("annual")}>
            {busy ? "Starting…" : `Get Plus — ${PRICING.annual.label}/yr (save ${PRICING.annual.savePct}%)`}
          </Button>
          <Button variant="outline" className="w-full" disabled={busy} onClick={() => go("monthly")}>
            {PRICING.monthly.label}/month
          </Button>
        </div>
        {err && <p className="mt-3 text-center text-sm text-negative">{err}</p>}

        <div className="mt-4 border-t border-line pt-3 text-center">
          <PromoRedeem onRedeemed={() => setTimeout(onClose, 1200)} />
        </div>

        <button onClick={onClose} className="mt-3 w-full text-center text-xs text-faint hover:text-ink">
          Maybe later
        </button>
      </div>
    </div>
  );
}
