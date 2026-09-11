"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AppHeader, Button, Card, Loading } from "@/components/ui";
import { ValueInput } from "@/components/value-input";
import { categoryEmoji, formatValue } from "@/lib/entryTypes";
import { useStore } from "@/lib/store";
import type { EntryValueData } from "@/lib/types";

export default function LogEntryPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LogEntryInner />
    </Suspense>
  );
}

function LogEntryInner() {
  const id = useSearchParams().get("sense") ?? "";
  const router = useRouter();
  const { ready, getSense, factorsFor, entriesFor, addEntry } = useStore();

  const [values, setValues] = useState<Record<string, EntryValueData>>({});
  const [saved, setSaved] = useState(false);

  const factors = useMemo(() => (ready ? factorsFor(id) : []), [ready, factorsFor, id]);
  const recent = useMemo(
    () => (ready ? entriesFor(id).slice(-3).reverse() : []),
    [ready, entriesFor, id]
  );

  if (!ready) return <Loading />;
  const sense = getSense(id);
  if (!sense) return <NotFound onBack={() => router.push("/")} />;

  const filledCount = factors.filter((f) => {
    const v = values[f.id];
    return v !== undefined && v !== null && v !== "";
  }).length;

  const save = () => {
    const entryValues = factors
      .filter((f) => {
        const v = values[f.id];
        return v !== undefined && v !== null && v !== "";
      })
      .map((f) => ({ factorId: f.id, value: values[f.id] }));
    if (entryValues.length === 0) return;
    addEntry(id, entryValues);
    setSaved(true);
    setTimeout(() => router.push(`/insights?sense=${id}`), 700);
  };

  return (
    <main className="pb-28">
      <AppHeader title={`Log · ${sense.title}`} back="/" />

      <div className="px-4 pt-4">
        <p className="mb-4 text-sm text-muted">
          Tap any factor and log it — in any order. Fill what you can and save whenever.
        </p>

        <div className="space-y-3">
          {factors.map((f) => {
            const v = values[f.id];
            const isFilled = v !== undefined && v !== null && v !== "";
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
