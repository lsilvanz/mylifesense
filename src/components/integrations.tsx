"use client";

import { Card } from "./ui";

// Devices & apps you'll be able to connect so a factor can be an `integration`
// type that auto-syncs its data. Schema supports it today (see the brief);
// no provider is wired yet, so every option here is intentionally disabled.
const PROVIDERS: { name: string; emoji: string; note: string }[] = [
  { name: "Fitbit", emoji: "⌚", note: "Steps, sleep, heart rate" },
  { name: "Apple Health", emoji: "🍎", note: "Activity, sleep, vitals" },
  { name: "Google Gemini", emoji: "✦", note: "AI-assisted insights" },
  { name: "Google Fit", emoji: "🏃", note: "Activity & workouts" },
  { name: "Oura Ring", emoji: "💍", note: "Sleep & readiness" },
  { name: "Garmin", emoji: "🛰️", note: "Workouts & stress" },
];

export function Integrations() {
  return (
    <Card className="mt-4 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Connect devices &amp; apps</p>
        <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-ink">
          Coming soon
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Soon you&apos;ll link a service so a factor updates itself — no manual logging. These aren&apos;t
        available yet.
      </p>

      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PROVIDERS.map((p) => (
          <li key={p.name}>
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="Coming soon"
              className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl border border-line bg-raised/50 px-3 py-2.5 text-left opacity-70"
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
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
