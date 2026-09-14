"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { Button, Loading } from "./ui";
import { Clouds, Sparkle } from "./decor";
import { PlanCards } from "./plans";
import { startCheckout } from "@/lib/billing";
import { getPendingPlan, setPendingPlan, type BillingCycle } from "@/lib/plan";

// Shown on entry when the visitor isn't signed into a real account. Presents the
// plans (Free vs Plus) on sign-up, plain sign-in on log-in, plus a remembered
// "continue as guest". Choosing Plus routes through account creation, then
// Stripe Checkout.
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, usingSupabase, user, guest, continueAsGuest, signInWithEmail, signInWithGoogle } =
    useStore();

  // "plans" (sign-up landing) → "auth" (choose Google/email). "login" jumps
  // straight to auth in sign-in mode.
  const [step, setStep] = useState<"plans" | "auth">("plans");
  const [kind, setKind] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [plusBusy, setPlusBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const firedCheckout = useRef(false);

  const needsAuth = usingSupabase && !guest && (user === null || user.isAnonymous);

  // Once the visitor has a real account, honour a plan they picked before signing
  // in by sending them to Stripe Checkout.
  useEffect(() => {
    if (needsAuth || firedCheckout.current) return;
    const pending = getPendingPlan();
    if (pending && user && !user.isAnonymous) {
      firedCheckout.current = true;
      setPendingPlan(null);
      void startCheckout(pending, user.id);
    }
  }, [needsAuth, user]);

  if (!ready) return <Loading />;
  if (!needsAuth) return <>{children}</>;

  const sendEmail = async () => {
    setBusy(true);
    setMsg(null);
    const res = await signInWithEmail(email);
    setMsg({ ok: res.ok, text: res.message });
    setBusy(false);
  };

  const google = async () => {
    setBusy(true);
    setMsg(null);
    const res = await signInWithGoogle();
    if (!res.ok) setMsg({ ok: false, text: res.message });
    setBusy(false);
  };

  const startFree = () => {
    setPendingPlan(null);
    setKind("signup");
    setStep("auth");
  };

  const choosePlus = (cycle: BillingCycle) => {
    setPlusBusy(true);
    setPendingPlan(cycle);
    setKind("signup");
    setStep("auth");
    setPlusBusy(false);
  };

  return (
    <main className="flex min-h-screen flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-md">
        {/* Brand hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-accent px-6 pb-8 pt-9 text-center shadow-glow">
          <Clouds className="pointer-events-none absolute inset-x-0 -top-1 h-24 w-full text-white opacity-80" />
          <Sparkle className="absolute right-7 top-7 h-4 w-4 text-white/70" />
          <Sparkle className="absolute left-8 top-20 h-3 w-3 text-white/50" />
          <div className="relative flex items-center justify-center gap-2.5">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/95 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/app/icon.png" alt="" className="h-9 w-9" width={36} height={36} />
            </span>
            <span className="text-xl font-extrabold tracking-tight text-white">MyLifeSense</span>
          </div>
          <h1 className="relative mt-5 text-2xl font-extrabold tracking-tight text-white">
            {step === "auth" && kind === "login" ? "Welcome back" : "Understand what affects you"}
          </h1>
          <p className="relative mx-auto mt-2 max-w-xs text-[15px] leading-relaxed text-white/85">
            {step === "auth"
              ? kind === "login"
                ? "Sign in to pick up where you left off."
                : "Create your account to keep your data across devices."
              : "Start free. Discover your patterns. Go deeper with Plus."}
          </p>
        </div>

        {step === "plans" ? (
          <div className="mt-6">
            <PlanCards onStartFree={startFree} onChoosePlus={choosePlus} plusBusy={plusBusy} />
            <p className="mt-4 text-center text-sm text-muted">
              Already have an account?{" "}
              <button
                onClick={() => {
                  setKind("login");
                  setStep("auth");
                }}
                className="font-semibold text-accent-ink underline underline-offset-2"
              >
                Log in
              </button>
            </p>
            <div className="mt-3 text-center">
              <button
                onClick={continueAsGuest}
                className="text-sm font-medium text-muted underline decoration-line underline-offset-4 transition hover:text-ink"
              >
                Continue as guest
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {kind === "signup" && getPendingPlan() && (
              <p className="rounded-xl bg-accent-soft px-3 py-2 text-center text-xs font-medium text-accent-ink">
                After signing in we&apos;ll take you to secure checkout for Plus.
              </p>
            )}

            <Button variant="outline" className="w-full" disabled={busy} onClick={google}>
              <GoogleMark /> Continue with Google
            </Button>

            <div className="flex items-center gap-3 py-1 text-xs text-faint">
              <div className="h-px flex-1 bg-line" /> or use email <div className="h-px flex-1 bg-line" />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim()) sendEmail();
              }}
              className="space-y-2"
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-sm outline-none focus:border-accent"
              />
              <Button type="submit" className="w-full" disabled={busy || !email.trim()}>
                {busy ? "Sending…" : "Email me a sign-in link"}
              </Button>
            </form>

            {msg && (
              <p className={`text-center text-sm ${msg.ok ? "text-positive" : "text-negative"}`}>
                {msg.text}
              </p>
            )}

            <button
              onClick={() => {
                setPendingPlan(null);
                setStep("plans");
                setMsg(null);
              }}
              className="w-full pt-1 text-center text-sm text-muted transition hover:text-ink"
            >
              ‹ Back to plans
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16z"
      />
      <path
        fill="#FBBC05"
        d="M10.4 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l7.8-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.2 0 11.4-2 15.2-5.6l-7.1-5.5c-2 1.3-4.5 2.1-8.1 2.1-6.4 0-11.7-3.7-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}
