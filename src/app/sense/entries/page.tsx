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
  const { ready, getSense, factorsFor, entriesFor, updateEntry, deleteEntry } = useStore();

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
            onSave={(values, loggedAt) => updateEntry(e.id, values, loggedAt)}
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

function EntryRow({
  entry,
  factors,
  onSave,
  onDelete,
}: {
  entry: Entry;
  factors: SenseFactor[];
  onSave: (values: { factorId: string; value: EntryValueData }[], loggedAt: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [when, setWhen] = useState(() => toLocalInputValue(entry.loggedAt));
  const [values, setValues] = useState<Record<string, EntryValueData>>(() => {
    const map: Record<string, EntryValueData> = {};
    for (const v of entry.values) map[v.factorId] = v.value;
    return map;
  });

  const dateLabel = new Date(entry.loggedAt).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const save = () => {
    const out = factors
      .filter((f) => hasValue(values[f.id]))
      .map((f) => ({ factorId: f.id, value: values[f.id] }));
    onSave(out, new Date(when).toISOString());
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
      <label className="mb-3 block">
        <span className="mb-1 block text-xs font-semibold text-ink">Logged at</span>
        <input
          type="datetime-local"
          value={when}
          onChange={(ev) => setWhen(ev.target.value)}
          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
      </label>

      <div className="space-y-3">
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
