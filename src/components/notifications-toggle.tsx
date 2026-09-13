"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "./ui";
import { disablePush, enablePush, isPushEnabled, pushSupported } from "@/lib/push";

export function NotificationsToggle() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(pushSupported());
    isPushEnabled().then(setEnabled);
  }, []);

  const toggle = async () => {
    setBusy(true);
    setMsg(null);
    if (enabled) {
      await disablePush();
      setEnabled(false);
      setMsg("Turned off on this device.");
    } else {
      const r = await enablePush();
      setEnabled(r.ok);
      setMsg(r.message);
    }
    setBusy(false);
  };

  return (
    <Card className="mt-4 p-5">
      <p className="text-sm font-semibold text-ink">Notifications</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Get push reminders to log — even when the app is closed. Choose what to be reminded about on
        each Sense&apos;s <span className="font-medium text-ink">Manage</span> page.
      </p>
      {!supported ? (
        <p className="mt-3 text-sm text-negative">
          This browser doesn&apos;t support push. On iPhone, add the app to your Home Screen first,
          then open it from there.
        </p>
      ) : (
        <Button variant={enabled ? "outline" : "primary"} className="mt-3" disabled={busy} onClick={toggle}>
          {busy ? "…" : enabled ? "Turn off notifications" : "Enable notifications"}
        </Button>
      )}
      {msg && <p className={`mt-2 text-xs ${enabled ? "text-positive" : "text-muted"}`}>{msg}</p>}
    </Card>
  );
}
