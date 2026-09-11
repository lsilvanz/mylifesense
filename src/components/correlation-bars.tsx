"use client";

import type { Correlation } from "@/lib/stats";
import { categoryEmoji } from "@/lib/entryTypes";

// Diverging horizontal bars: negative correlations grow left, positive right,
// from a shared center. Magnitude = |r|.
export function CorrelationBars({
  correlations,
  targetLabel,
}: {
  correlations: Correlation[];
  targetLabel: string;
}) {
  if (correlations.length === 0) {
    return <p className="text-sm text-muted">No comparable factors to correlate yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {correlations.map((c) => {
        const pct = Math.min(Math.abs(c.r), 1) * 50; // half-width max
        const positive = c.r >= 0;
        const color = c.strength === "negligible" ? "var(--faint)" : positive ? "var(--negative)" : "var(--positive)";
        return (
          <li key={c.factor.id}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 font-medium text-ink">
                <span>{categoryEmoji(c.factor.category)}</span>
                {c.factor.label}
              </span>
              <span className="tabular-nums text-muted">
                r = {c.r >= 0 ? "+" : ""}
                {c.r.toFixed(2)}
              </span>
            </div>
            <div className="relative h-3 rounded-full bg-raised">
              <div className="absolute left-1/2 top-0 h-full w-px bg-line" />
              <div
                className="absolute top-0 h-full rounded-full"
                style={{
                  background: color,
                  width: `${pct}%`,
                  ...(positive ? { left: "50%" } : { right: "50%" }),
                }}
              />
            </div>
            <p className="mt-1 text-xs text-faint">
              {c.strength === "negligible"
                ? `No clear link with ${targetLabel.toLowerCase()}`
                : `${cap(c.strength)} ${positive ? "increase" : "decrease"} in ${targetLabel.toLowerCase()} · n=${c.sampleSize}`}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}
