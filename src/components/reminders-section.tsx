"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "./ui";
import {
  deleteReminder,
  isSetupError,
  listReminders,
  localTz,
  upsertReminder,
  type Reminder,
} from "@/lib/reminders";
import type { Frequency, SenseFactor } from "@/lib/types";

const SETUP_MSG = "Reminders need a one-time database setup — run supabase/reminders.sql in Supabase.";

const FREQS: { value: Frequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "few_per_week", label: "A few / week" },
  { value: "weekly", label: "Weekly" },
];

export function RemindersSection({
  senseId,
  senseFrequency,
  factors,
}: {
  senseId: string;
  senseFrequency: Frequency;
  factors: SenseFactor[];
}) {
  const [items, setItems] = useState<Reminder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listReminders(senseId)
      .then((r) => !cancelled && setItems(r))
      .catch((e) => {
        if (cancelled) return;
        setItems([]);
        setError(isSetupError(e) ? SETUP_MSG : "Couldn't load reminders.");
      });
    return () => {
      cancelled = true;
    };
  }, [senseId]);

  const add = async () => {
    try {
      const created = await upsertReminder({
        senseId,
        factorId: null,
        frequency: senseFrequency,
        timeLocal: "09:00",
        tz: localTz(),
        enabled: true,
      });
      if (created) {
        setItems((prev) => [...(prev ?? []), created]);
        setError(null);
      }
    } catch (e) {
      setError(isSetupError(e) ? SETUP_MSG : "Couldn't save the reminder.");
    }
  };

  const patch = async (r: Reminder, changes: Partial<Reminder>) => {
    const next = { ...r, ...changes };
    setItems((prev) => (prev ?? []).map((x) => (x.id === r.id ? next : x)));
    try {
      await upsertReminder(next);
    } catch (e) {
      setError(isSetupError(e) ? SETUP_MSG : "Couldn't save the change.");
    }
  };

  const remove = async (id: string) => {
    setItems((prev) => (prev ?? []).filter((x) => x.id !== id));
    await deleteReminder(id);
  };

  const factorName = (fid: string | null) =>
    fid ? factors.find((f) => f.id === fid)?.label ?? "factor" : "Whole Sense";

  return (
    <Card className="p-4">
      <p className="text-sm font-semibold text-ink">Reminders</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Get a push notification to log — for the whole Sense or a specific factor. Enable
        notifications in <span className="font-medium text-ink">About me</span> to receive them.
      </p>

      {error && (
        <p className="mt-2 rounded-lg border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">
          {error}
        </p>
      )}

      {items === null ? (
        <p className="mt-3 text-xs text-faint">Loading…</p>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((r) => (
            <div key={r.id} className="rounded-xl border border-line bg-raised/60 p-3">
              <div className="flex items-center gap-2">
                <select
                  value={r.factorId ?? ""}
                  onChange={(e) => patch(r, { factorId: e.target.value || null })}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent"
                >
                  <option value="">⭐ Whole Sense</option>
                  {factors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => patch(r, { enabled: !r.enabled })}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                    r.enabled ? "bg-gradient-accent text-white" : "border border-line bg-surface text-muted"
                  }`}
                >
                  {r.enabled ? "On" : "Off"}
                </button>
                <button
                  onClick={() => remove(r.id)}
                  className="grid h-7 w-7 place-items-center rounded-lg text-faint transition hover:bg-surface hover:text-negative"
                  aria-label="Remove reminder"
                >
                  ✕
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={r.frequency}
                  onChange={(e) => patch(r, { frequency: e.target.value as Frequency })}
                  className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent"
                >
                  {FREQS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-faint">at</span>
                <input
                  type="time"
                  value={r.timeLocal}
                  onChange={(e) => patch(r, { timeLocal: e.target.value })}
                  className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent"
                />
                <span className="ml-auto truncate text-[11px] text-faint">{factorName(r.factorId)}</span>
              </div>
            </div>
          ))}
          <Button variant="outline" className="w-full text-sm" onClick={add}>
            + Add reminder
          </Button>
        </div>
      )}
    </Card>
  );
}
