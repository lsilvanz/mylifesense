"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AppHeader, Button, Card, LinkButton, Loading } from "@/components/ui";
import { ValueInput } from "@/components/value-input";
import { categoryEmoji, formatValue, hasValue } from "@/lib/entryTypes";
import { useStore } from "@/lib/store";
import type { Entry, EntryValueData, SenseFactor } from "@/lib/types";

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export default function EntriesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <EntriesInner />
    </Suspense>
  );
}

function EntriesInner() {
  const id = useSearchParams().get("sense") ?? "";
  const { ready, getSense, factorsFor, entriesFor, addEntry, updateEntry, deleteEntry } = useStore();

  // Save an edited entry whose factors may now carry different times: the first
  // time-group updates this entry in place, any additional groups become their
  // own entries (empty → the entry is deleted).
  const saveEntry = (
    entryId: string,
    groups: { loggedAt: string; values: { factorId: string; value: EntryValueData }[] }[]
  ) => {
    if (groups.length === 0) {
      deleteEntry(entryId);
      return;
    }
    const [first, ...rest] = groups;
    updateEntry(entryId, first.values, first.loggedAt);
    for (const g of rest) addEntry(id, g.values, g.loggedAt);
  };

  const factors = useMemo(() => (ready ? factorsFor(id) : []), [ready, factorsFor, id]);
  const entries = useMemo(
    () => (ready ? [...entriesFor(id)].reverse() : []),
    [ready, entriesFor, id]
  );

  if (!ready) return <Loading />;
  const sense = getSense(id);
  if (!sense) {
    return (
      <main className="px-4">
        <AppHeader title="Entries" back="/" />
        <p className="py-16 text-center text-muted">That Sense doesn&apos;t exist.</p>
      </main>
    );
  }

  return (
    <main className="px-4 pb-24">
      <AppHeader title={`Entries · ${sense.title}`} back={`/insights?sense=${id}`} />

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-muted">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}, newest first.
        </p>
        <LinkButton href={`/log?sense=${id}`} variant="soft" className="text-sm">
          + Log
        </LinkButton>
      </div>

      <div className="mt-3 space-y-3">
        {entries.map((e) => (
          <EntryRow
            key={e.id}
            entry={e}
            factors={factors}
            onSave={(groups) => saveEntry(e.id, groups)}
            onDelete={() => deleteEntry(e.id)}
          />
        ))}
        {entries.length === 0 && (
          <p className="py-10 text-center text-sm text-muted">No entries logged yet.</p>
        )}
      </div>
    </main>
  );
}

function nowLocal(): string {
  return toLocalInputValue(new Date().toISOString());
}

function EntryRow({
  entry,
  factors,
  onSave,
  onDelete,
}: {
  entry: Entry;
  factors: SenseFactor[];
  onSave: (
    groups: { loggedAt: string; values: { factorId: string; value: EntryValueData }[] }[]
  ) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [values, setValues] = useState<Record<string, EntryValueData>>(() => {
    const map: Record<string, EntryValueData> = {};
    for (const v of entry.values) map[v.factorId] = v.value;
    return map;
  });
  // Each factor gets its own time, defaulting to this entry's time so an
  // unchanged save stays a single entry; changing one splits it out.
  const [times, setTimes] = useState<Record<string, string>>(() => {
    const base = toLocalInputValue(entry.loggedAt);
    const map: Record<string, string> = {};
    for (const f of factors) map[f.id] = base;
    return map;
  });
  const setTime = (factorId: string, v: string) =>
    setTimes((prev) => ({ ...prev, [factorId]: v }));

  const dateLabel = new Date(entry.loggedAt).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const save = () => {
    const filled = factors.filter((f) => hasValue(values[f.id]));
    const groups = new Map<string, { factorId: string; value: EntryValueData }[]>();
    for (const f of filled) {
      const local = times[f.id] ?? toLocalInputValue(entry.loggedAt);
      const iso = new Date(local).toISOString();
      if (!groups.has(iso)) groups.set(iso, []);
      groups.get(iso)!.push({ factorId: f.id, value: values[f.id] });
    }
    onSave([...groups].map(([loggedAt, vals]) => ({ loggedAt, values: vals })));
    setEditing(false);
  };

  if (!editing) {
    return (
      <Card className="p-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-faint">{dateLabel}</p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-accent-ink hover:bg-raised"
            >
              Edit
            </button>
            {!confirmDel ? (
              <button
                onClick={() => setConfirmDel(true)}
                className="rounded-lg px-2 py-1 text-xs text-faint hover:text-negative"
              >
                Delete
              </button>
            ) : (
              <>
                <button
                  onClick={onDelete}
                  className="rounded-lg bg-negative/10 px-2 py-1 text-xs font-semibold text-negative"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmDel(false)}
                  className="rounded-lg px-2 py-1 text-xs text-muted"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {factors.map((f) => {
            const v = entry.values.find((x) => x.factorId === f.id);
            if (!v) return null;
            return (
              <span key={f.id} className="text-muted">
                {categoryEmoji(f.category)} {f.label}:{" "}
                <span className="font-medium text-ink">
                  {formatValue(f.entryType, v.value, f.config.unit)}
                </span>
              </span>
            );
          })}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <p className="mb-3 text-xs text-muted">Each factor keeps its own date &amp; time.</p>
      <div className="space-y-4">
        {factors.map((f) => (
          <div key={f.id}>
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <span>{categoryEmoji(f.category)}</span>
              {f.label}
            </p>
            <ValueInput
              factor={f}
              value={values[f.id] ?? null}
              onChange={(nv) => setValues((prev) => ({ ...prev, [f.id]: nv }))}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-faint">When</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="datetime-local"
                  value={times[f.id] ?? ""}
                  max={nowLocal()}
                  onChange={(ev) => setTime(f.id, ev.target.value)}
                  className="rounded-lg border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => setTime(f.id, nowLocal())}
                  className="rounded-lg px-1.5 py-1 text-xs font-medium text-muted transition hover:bg-raised hover:text-ink"
                >
                  Now
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={save}>
          Save changes
        </Button>
      </div>
    </Card>
  );
}
