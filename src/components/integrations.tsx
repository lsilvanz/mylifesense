"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "./ui";
import { UpgradeModal } from "./plans";
import { connect, disconnect, getClientId, getSession, setClientId } from "@/lib/fitbit";
import { useStore } from "@/lib/store";

// Fitbit is a real integration (OAuth implicit flow, client-side). Garmin's
// Health API requires partner approval, so it stays disabled. The rest are
// schema-ready placeholders.
const COMING_SOON: { name: string; emoji: string; note: string }[] = [
  { name: "Garmin", emoji: "🛰️", note: "Needs Garmin Health API partner approval" },
  { name: "Apple Health", emoji: "🍎", note: "Activity, sleep, vitals" },
  { name: "Google Gemini", emoji: "✦", note: "AI-assisted insights" },
  { name: "Google Fit", emoji: "🏃", note: "Activity & workouts" },
  { name: "Oura Ring", emoji: "💍", note: "Sleep & readiness" },
];

export function Integrations() {
  const { isPlus } = useStore();
  const [connected, setConnected] = useState(false);
  const [clientId, setId] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [upsell, setUpsell] = useState(false);

  useEffect(() => {
    setConnected(Boolean(getSession()));
    setId(getClientId() ?? "");
  }, []);

  if (!isPlus) {
    return (
      <Card className="mt-4 p-5">
        <p className="text-sm font-semibold text-ink">Connect devices &amp; apps</p>
        <p className="mt-1 text-sm text-muted">
          Sync Fitbit and more so a factor updates itself. Integrations are part of MyLifeSense Plus.
        </p>
        <Button className="mt-3" onClick={() => setUpsell(true)}>
          Unlock with Plus
        </Button>
        <UpgradeModal
          open={upsell}
          onClose={() => setUpsell(false)}
          reason="Device & app integrations are part of MyLifeSense Plus."
        />
      </Card>
    );
  }

  const doConnect = () => {
    setMsg(null);
    if (clientId.trim()) setClientId(clientId.trim());
    try {
      connect();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't start Fitbit connect.");
    }
  };

  const doDisconnect = () => {
    disconnect();
    setConnected(false);
    setMsg(null);
  };

  return (
    <Card className="mt-4 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Connect devices &amp; apps</p>
      </div>
      <p className="mt-1 text-sm text-muted">
        Sync a service so a factor updates itself. Fitbit is live; the rest are on the way.
      </p>

      {/* Fitbit — real */}
      <div className="mt-4 rounded-xl border border-line bg-raised p-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface text-lg">
            ⌚
          </span>
          <div className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">Fitbit</span>
            <span className="block truncate text-xs text-faint">Steps &amp; resting heart rate</span>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              connected
                ? "bg-accent-soft text-accent-ink"
                : "border border-line text-faint"
            }`}
          >
            {connected ? "Connected" : "Not connected"}
          </span>
        </div>

        {connected ? (
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-xs text-muted">
              Open a Sense&apos;s Insights and tap <strong className="text-ink">Sync Fitbit</strong>{" "}
              to pull data into it.
            </p>
            <Button variant="outline" className="shrink-0 px-3 py-1.5 text-xs" onClick={doDisconnect}>
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <button
              onClick={() => setShowSetup((s) => !s)}
              className="text-xs font-medium text-accent-ink underline underline-offset-2"
            >
              {showSetup ? "Hide setup" : "First time? Set your Fitbit Client ID"}
            </button>
            {showSetup && (
              <input
                value={clientId}
                onChange={(e) => setId(e.target.value)}
                placeholder="Fitbit OAuth Client ID (e.g. 23ABCD)"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none focus:border-accent"
              />
            )}
            <Button className="w-full" disabled={!clientId.trim()} onClick={doConnect}>
              Connect Fitbit
            </Button>
            {!clientId.trim() && (
              <p className="text-xs text-faint">
                Register a free app at dev.fitbit.com (type: Client, callback:{" "}
                {typeof window !== "undefined" ? window.location.origin : ""}/app) and paste its
                Client ID above.
              </p>
            )}
          </div>
        )}
        {msg && <p className="mt-2 text-xs text-negative">{msg}</p>}
      </div>

      {/* Coming soon */}
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {COMING_SOON.map((p) => (
          <li key={p.name}>
            <div
              title="Coming soon"
              className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl border border-line bg-raised/60 px-3 py-2.5 opacity-70"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface text-lg">
                {p.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{p.name}</span>
                <span className="block truncate text-xs text-faint">{p.note}</span>
              </span>
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-faint">
                Soon
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
