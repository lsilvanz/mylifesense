"use client";

import { useState } from "react";
import { AppHeader, Button, Card } from "@/components/ui";
import { useStore } from "@/lib/store";

export default function AboutPage() {
  const { resetDemo, senses, usingSupabase, user, signInWithEmail, signInWithGoogle, signOut } =
    useStore();
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const signedIn = Boolean(user && !user.isAnonymous);

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
    <main className="px-4 pb-16">
      <AppHeader title="About me" back="/" />

      <Card className="mt-4 p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-2xl">
            {signedIn ? "👤" : "🙂"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-ink">
              {signedIn ? user?.email : "You"}
            </p>
            <p className="text-sm text-muted">
              {senses.length} active Senses ·{" "}
              {!usingSupabase
                ? "stored on this device"
                : signedIn
                ? "synced to your account"
                : "guest — synced to this browser"}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          This space is where a future version keeps the context that helps interpret your
          patterns — age, baseline health, goals. For this prototype it&apos;s a placeholder.
        </p>
      </Card>

      {/* Account / auth */}
      {usingSupabase && (
        <Card className="mt-4 p-5">
          {signedIn ? (
            <>
              <p className="text-sm font-semibold text-ink">Account</p>
              <p className="mt-1 text-sm text-muted">
                Signed in as <span className="font-medium text-ink">{user?.email}</span>. Your
                Senses sync to this account on any device you sign in on.
              </p>
              <Button
                variant="outline"
                className="mt-3"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await signOut();
                  setBusy(false);
                  setMsg(null);
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-ink">Save your data across devices</p>
              <p className="mt-1 text-sm text-muted">
                You&apos;re using a guest account. Sign in and your current Senses come with you —
                nothing is lost.
              </p>

              <Button variant="outline" className="mt-3 w-full" disabled={busy} onClick={google}>
                Continue with Google
              </Button>

              <div className="my-3 flex items-center gap-3 text-xs text-faint">
                <div className="h-px flex-1 bg-line" /> or <div className="h-px flex-1 bg-line" />
              </div>

              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
                <Button disabled={busy || !email.trim()} onClick={sendEmail}>
                  {busy ? "…" : "Send link"}
                </Button>
              </div>
            </>
          )}

          {msg && (
            <p className={`mt-3 text-sm ${msg.ok ? "text-positive" : "text-negative"}`}>{msg.text}</p>
          )}
        </Card>
      )}

      <Card className="mt-4 p-5">
        <p className="text-sm font-semibold text-ink">Prototype data</p>
        <p className="mt-1 text-sm text-muted">
          {usingSupabase
            ? "Your data is stored in Supabase, tied to your account. Reset replaces it with the seeded demo Senses."
            : "All data lives in this browser (localStorage). Reset to restore the seeded demo Senses with their sample history."}
        </p>
        <Button
          variant="outline"
          className="mt-3"
          onClick={() => {
            resetDemo();
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }}
        >
          {done ? "Reset ✓" : "Reset demo data"}
        </Button>
      </Card>

      <p className="mt-6 px-1 text-xs leading-relaxed text-faint">
        MyLifeSense prototype · Phase 1 core loop + client-side Insights. Chat and correlations are
        gated at <strong>15 entries</strong> to avoid reporting noise as signal.
      </p>
    </main>
  );
}
