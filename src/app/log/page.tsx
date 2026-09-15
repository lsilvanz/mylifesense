"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AppHeader, Button, Card, Loading } from "@/components/ui";
import { ValueInput } from "@/components/value-input";
import { VoiceEntry } from "@/components/voice-entry";
import { categoryEmoji, formatValue, hasValue } from "@/lib/entryTypes";
import { useStore } from "@/lib/store";
import type { EntryValueData } from "@/lib/types";

// Format a Date as the local "YYYY-MM-DDTHH:mm" a datetime-local input expects.
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export default function LogEntryPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LogEntryInner />
    </Suspense>
  );
}

function LogEntryInner() {
  const params = useSearchParams();
  const id = params.get("sense") ?? "";
  const router = useRouter();
  const { ready, getSense, factorsFor, entriesFor, addEntry } = useStore();

  const [values, setValues] = useState<Record<string, EntryValueData>>({});
  const [saved, setSaved] = useState(false);
  // Per-factor log time as "YYYY-MM-DDTHH:mm"; each defaults to "now" once
  // factors load (set client-side to avoid an SSR/CSR hydration mismatch).
  const [times, setTimes] = useState<Record<string, string>>({});

  const factors = useMemo(() => (ready ? factorsFor(id) : []), [ready, factorsFor, id]);
  const recent = useMemo(
    () => (ready ? entriesFor(id).slice(-3).reverse() : []),
    [ready, entriesFor, id]
  );

  useEffect(() => {
    if (!ready) return;
    const now = toLocalInputValue(new Date());
    setTimes((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const f of factors) {
        if (next[f.id] === undefined) {
          next[f.id] = now;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [ready, factors]);

  const setAllNow = () => {
    const now = toLocalInputValue(new Date());
    setTimes((prev) => {
      const next = { ...prev };
      for (const f of factors) next[f.id] = now;
      return next;
    });
  };
  const setTime = (factorId: string, v: string) =>
    setTimes((prev) => ({ ...prev, [factorId]: v }));

  if (!ready) return <Loading />;
  const sense = getSense(id);
  if (!sense) return <NotFound onBack={() => router.push("/")} />;

  const filledCount = factors.filter((f) => hasValue(values[f.id])).length;

  const save = () => {
    const filled = factors.filter((f) => hasValue(values[f.id]));
    if (filled.length === 0) return;
    // Each factor carries its own time. Factors sharing a timestamp go into one
    // entry; differing times split into separate entries (insights aggregate by
    // calendar day, so this stays consistent).
    const groups = new Map<string, { factorId: string; value: EntryValueData }[]>();
    for (const f of filled) {
      const local = times[f.id];
      const iso = local ? new Date(local).toISOString() : new Date().toISOString();
      if (!groups.has(iso)) groups.set(iso, []);
      groups.get(iso)!.push({ factorId: f.id, value: values[f.id] });
    }
    for (const [iso, vals] of groups) addEntry(id, vals, iso);
    setSaved(true);
    setTimeout(() => router.push("/"), 700);
  };

  return (
    <main className="pb-28">
      <AppHeader title={`Log · ${sense.title}`} back="/" />

      <div className="px-4 pt-4">
        <p className="mb-4 text-sm text-muted">
          Tap any factor and log it — in any order. Fill what you can and save whenever.
        </p>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
          <span className="text-sm text-muted">Each factor keeps its own date &amp; time.</span>
          <button
            type="button"
            onClick={setAllNow}
            className="rounded-lg px-2 py-1 text-xs font-medium text-muted transition hover:bg-raised hover:text-ink"
          >
            Set all to now
          </button>
        </div>

        <div className="mb-4">
          <VoiceEntry factors={factors} onValues={(m) => setValues((prev) => ({ ...prev, ...m }))} />
        </div>

        <div className="space-y-3">
          {factors.map((f) => {
            const v = values[f.id];
            const isFilled = hasValue(v);
            return (
              <Card key={f.id} className="p-4">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="flex items-center gap-2 font-semibold text-ink">
                    <span>{categoryEmoji(f.category)}</span>
                    {f.label}
                    {f.isTarget && (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-ink">
                        target
                      </span>
                    )}
                  </span>
                  {isFilled && <span className="text-sm text-positive">✓</span>}
                </div>
                <ValueInput
                  factor={f}
                  value={v ?? null}
                  onChange={(nv) => setValues((prev) => ({ ...prev, [f.id]: nv }))}
                />
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5">
                  <span className="text-xs text-faint">When</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="datetime-local"
                      value={times[f.id] ?? ""}
                      max={toLocalInputValue(new Date())}
                      onChange={(e) => setTime(f.id, e.target.value)}
                      className="rounded-lg border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => setTime(f.id, toLocalInputValue(new Date()))}
                      className="rounded-lg px-1.5 py-1 text-xs font-medium text-muted transition hover:bg-raised hover:text-ink"
                    >
                      Now
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {recent.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
              Recent entries
            </h2>
            <Card className="divide-y divide-line">
              {recent.map((e) => (
                <div key={e.id} className="px-4 py-3">
                  <p className="mb-1 text-xs text-faint">
                    {new Date(e.loggedAt).toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    {e.values.map((val) => {
                      const f = factors.find((x) => x.id === val.factorId);
                      if (!f) return null;
                      return (
                        <span key={val.factorId} className="text-muted">
                          {f.label}:{" "}
                          <span className="font-medium text-ink">
                            {formatValue(f.entryType, val.value, f.config.unit)}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 mx-auto flex max-w-2xl items-center gap-3 border-t border-line bg-ground/90 px-4 py-3 backdrop-blur">
        <span className="text-sm text-muted">
          {filledCount} of {factors.length} filled
        </span>
        <Button className="flex-1" disabled={filledCount === 0 || saved} onClick={save}>
          {saved ? "Saved ✓" : "Save entry"}
        </Button>
      </div>
    </main>
  );
}

function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <main className="px-4">
      <AppHeader title="Not found" back="/" />
      <div className="py-16 text-center">
        <p className="text-muted">That Sense doesn&apos;t exist.</p>
        <Button className="mt-4" onClick={onBack}>
          Back home
        </Button>
      </div>
    </main>
  );
}
