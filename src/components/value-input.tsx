"use client";

import type { EntryValueData, SenseFactor } from "@/lib/types";
import { Pill } from "./ui";

// Renders the correct input control for a factor's entry type. Controlled:
// parent owns the value. This is the one place the 7 entry types become UI.
export function ValueInput({
  factor,
  value,
  onChange,
}: {
  factor: SenseFactor;
  value: EntryValueData;
  onChange: (v: EntryValueData) => void;
}) {
  switch (factor.entryType) {
    case "yes_no":
      return (
        <div className="flex gap-2">
          <Pill active={value === true} onClick={() => onChange(true)}>
            Yes
          </Pill>
          <Pill active={value === false} onClick={() => onChange(false)}>
            No
          </Pill>
        </div>
      );

    case "low_med_high":
      return (
        <div className="flex gap-2">
          {(["low", "med", "high"] as const).map((opt) => (
            <Pill key={opt} active={value === opt} onClick={() => onChange(opt)}>
              {opt === "med" ? "Medium" : opt[0].toUpperCase() + opt.slice(1)}
            </Pill>
          ))}
        </div>
      );

    case "scale_0_10": {
      const current = typeof value === "number" ? value : null;
      return (
        <div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 11 }, (_, i) => i).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                className={`h-9 w-9 rounded-lg text-sm font-semibold transition ${
                  current === n
                    ? "bg-gradient-accent text-white shadow-glow"
                    : "glass text-muted hover:text-ink border border-line"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-faint">
            <span>None</span>
            <span>Worst</span>
          </div>
        </div>
      );
    }

    case "number":
      return (
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={value === null || value === undefined ? "" : String(value)}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
            className="w-32 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
            placeholder="0"
          />
          {factor.config.unit && <span className="text-sm text-muted">{factor.config.unit}</span>}
        </div>
      );

    case "list":
      return (
        <div className="flex flex-wrap gap-2">
          {(factor.config.options ?? []).map((opt) => (
            <Pill key={opt} active={value === opt} onClick={() => onChange(opt)}>
              {opt}
            </Pill>
          ))}
          {(factor.config.options ?? []).length === 0 && (
            <span className="text-sm text-faint">No options defined.</span>
          )}
        </div>
      );

    case "free_text":
      return (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
          placeholder="Write a note…"
        />
      );

    case "integration":
      return (
        <div className="rounded-xl border border-dashed border-line bg-raised/60 px-3 py-2.5 text-sm text-muted">
          <span className="font-medium capitalize text-ink">{factor.config.provider ?? "Provider"}</span>{" "}
          · {factor.config.metric ?? "metric"}
          <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-ink">
            auto-synced
          </span>
        </div>
      );

    default:
      return null;
  }
}
