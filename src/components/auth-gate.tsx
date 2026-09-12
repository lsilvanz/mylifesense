"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button, Loading, Wordmark } from "./ui";

// Shown on entry when the visitor isn't signed into a real account. Offers
// Google + email sign-in / sign-up, plus a remembered "continue as guest".
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, usingSupabase, user, guest, continueAsGuest, signInWithEmail, signInWithGoogle } =
    useStore();

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!ready) return <Loading />;

  const needsAuth = usingSupabase && !guest && (user === null || user.isAnonymous);
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

  return (
    <main className="flex min-h-screen flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Wordmark />
        </div>

        <h1 className="text-center text-3xl font-extrabold tracking-tight text-gradient">
          Understand your patterns
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-center text-[15px] leading-relaxed text-muted">
          Sign in or create your account to track what matters and keep it across your devices.
        </p>

        <div className="mt-7 space-y-3">
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
        </div>

        <div className="mt-7 text-center">
          <button
            onClick={continueAsGuest}
            className="text-sm font-medium text-muted underline decoration-line underline-offset-4 transition hover:text-ink"
          >
            Continue as guest
          </button>
          <p className="mx-auto mt-1.5 max-w-[16rem] text-xs leading-relaxed text-faint">
            You can sign in later — your data comes with you when you do.
          </p>
        </div>
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
