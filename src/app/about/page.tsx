"use client";

import { useState } from "react";
import { AppHeader, Button, Card } from "@/components/ui";
import { Integrations } from "@/components/integrations";
import { ContextEditor } from "@/components/context-editor";
import { ME_ID } from "@/lib/context";
import { useStore } from "@/lib/store";

export default function AboutPage() {
  const { senses, usingSupabase, user, signInWithEmail, signInWithGoogle, signOut } = useStore();
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
              {senses.length} {senses.length === 1 ? "Sense" : "Senses"} ·{" "}
              {!usingSupabase
                ? "stored on this device"
                : signedIn
                ? "synced to your account"
                : "guest — synced to this browser"}
            </p>
          </div>
        </div>
      </Card>

      <div className="mt-4">
        <ContextEditor
          senseId={ME_ID}
          title="About me"
          description="Background about you that applies to every Sense — age, baseline health, goals, routine, anything that helps interpret your patterns. Folded into Chat, Insights and suggestions across all your Senses. Stored in this browser."
          placeholder="e.g. 45, mostly desk-based work, history of migraines, aiming to sleep better and lose 5kg…"
        />
      </div>

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

      <Integrations />

      <p className="mt-6 px-1 text-xs leading-relaxed text-faint">
        MyLifeSense prototype · Phase 1 core loop + client-side Insights. Chat and correlations are
        gated at <strong>15 entries</strong> to avoid reporting noise as signal.
      </p>
    </main>
  );
}
