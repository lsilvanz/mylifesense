"use client";

import { useState } from "react";
import { AppHeader, Button, Card } from "@/components/ui";
import { Integrations } from "@/components/integrations";
import { ContextEditor } from "@/components/context-editor";
import { NotificationsToggle } from "@/components/notifications-toggle";
import { UpgradeModal, PromoRedeem } from "@/components/plans";
import { ME_ID } from "@/lib/context";
import { PRICING } from "@/lib/plan";
import { useStore } from "@/lib/store";

export default function AboutPage() {
  const { senses, usingSupabase, user, isPlus, signInWithEmail, signInWithGoogle, signOut } =
    useStore();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [upsell, setUpsell] = useState(false);

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

      {/* Plan */}
      <Card className={`mt-4 p-5 ${isPlus ? "" : "border-accent/50"}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">
              Plan: {isPlus ? "MyLifeSense Plus" : "Free"}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {isPlus
                ? "Everything unlocked — unlimited Senses & factors, AI chat, integrations and more."
                : "1 active Sense, up to 5 factors, basic analysis. Upgrade for the full picture."}
            </p>
          </div>
          {isPlus ? (
            <span className="shrink-0 rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent-ink">
              Plus
            </span>
          ) : (
            <Button className="shrink-0" onClick={() => setUpsell(true)}>
              Upgrade
            </Button>
          )}
        </div>
        {!isPlus && (
          <>
            <p className="mt-2 text-xs text-faint">
              Plus is {PRICING.monthly.label}/mo or {PRICING.annual.label}/yr (save{" "}
              {PRICING.annual.savePct}%).
            </p>
            <div className="mt-3 border-t border-line pt-3">
              <PromoRedeem />
            </div>
          </>
        )}
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

      <NotificationsToggle />

      <Integrations />

      <p className="mt-6 px-1 text-xs leading-relaxed text-faint">
        MyLifeSense by aiguardu limited. Chat and correlations are gated at{" "}
        <strong>10 entries</strong> to avoid reporting noise as signal.
      </p>
      <p className="mt-2 px-1 text-xs text-faint">
        <a href="/privacy" className="underline underline-offset-2 hover:text-ink">
          Privacy Policy
        </a>{" "}
        ·{" "}
        <a href="/terms" className="underline underline-offset-2 hover:text-ink">
          Terms &amp; Conditions
        </a>{" "}
        · <a href="mailto:admin@aiguardu.app" className="underline underline-offset-2 hover:text-ink">admin@aiguardu.app</a>
      </p>

      <UpgradeModal
        open={upsell}
        onClose={() => setUpsell(false)}
        reason="Unlock unlimited Senses & factors, AI chat, integrations and more."
      />
    </main>
  );
}
