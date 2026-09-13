"use client";

import { useState } from "react";
import { Button, Card } from "./ui";
import { categoryEmoji, entryTypeMeta } from "@/lib/entryTypes";
import { suggestFactors, type SuggestedFactor } from "@/lib/ai";

// AI factor suggestions with a pick-list: fetch tailored factors, let the user
// choose which to add. Reusable — the parent decides how to add them.
export function FactorSuggestions({
  title,
  question,
  existing,
  context,
  onAdd,
}: {
  title: string;
  question: string;
  existing: string[];
  context?: string;
  onAdd: (factors: SuggestedFactor[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<SuggestedFactor[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setMsg(null);
    const s = await suggestFactors(title, question, existing, context);
    setLoading(false);
    if (!s) {
      setMsg("AI suggestions aren't available right now.");
      return;
    }
    setList(s);
    setSelected(new Set(s.map((_, i) => i))); // all selected by default
  };

  const toggle = (i: number) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  const add = () => {
    if (!list) return;
    const chosen = list.filter((_, i) => selected.has(i));
    if (chosen.length) onAdd(chosen);
    setList(null);
    setSelected(new Set());
    setMsg(chosen.length ? `Added ${chosen.length} factor${chosen.length === 1 ? "" : "s"}.` : null);
  };

  return (
    <Card className="overflow-hidden">
      <div className="relative overflow-hidden bg-accent-soft px-4 py-3.5">
        <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gradient-accent opacity-25 blur-2xl" />
        <div className="relative flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">✦ Suggest factors with AI</p>
            <p className="mt-0.5 text-xs text-muted">
              Claude proposes factors for this Sense — pick the ones that fit.
            </p>
          </div>
          {!list && (
            <Button className="shrink-0" disabled={loading} onClick={run}>
              {loading ? "Thinking…" : "Suggest"}
            </Button>
          )}
        </div>
      </div>

      {list && (
        <div className="p-3">
          {list.length === 0 && (
            <p className="px-1 py-2 text-sm text-muted">No new factors to suggest.</p>
          )}
          <ul className="space-y-1.5">
            {list.map((f, i) => {
              const on = selected.has(i);
              return (
                <li key={i}>
                  <button
                    onClick={() => toggle(i)}
                    className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition ${
                      on ? "border-accent bg-accent-soft" : "border-line bg-surface"
                    }`}
                  >
                    <span
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border text-xs ${
                        on ? "border-transparent bg-gradient-accent text-white" : "border-line text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">
                        {categoryEmoji(f.category)} {f.label}
                      </span>
                      <span className="block text-xs text-faint">
                        {entryTypeMeta(f.entryType).label}
                        {f.unit ? ` · ${f.unit}` : ""} · {f.controllable === false ? "context" : "lever"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setList(null);
                setSelected(new Set());
              }}
            >
              Cancel
            </Button>
            <Button className="flex-1" disabled={selected.size === 0} onClick={add}>
              Add {selected.size} selected
            </Button>
          </div>
        </div>
      )}

      {msg && <p className="px-4 py-2 text-xs text-muted">{msg}</p>}
    </Card>
  );
}
