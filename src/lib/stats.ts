import { toNumeric } from "./entryTypes";
import type { Entry, SenseFactor } from "./types";

// Minimum entries before we will surface a correlation. The brief calls out
// ~15-20 as the floor where a Pearson r stops being noise; below this the
// honest answer is "not enough data yet", never a fabricated trend.
export const MIN_SAMPLE_SIZE = 15;

export interface Correlation {
  factor: SenseFactor;
  r: number; // Pearson correlation coefficient, -1..1
  sampleSize: number; // paired observations used
  direction: "positive" | "negative" | "none";
  strength: "strong" | "moderate" | "weak" | "negligible";
}

export interface TrendPoint {
  date: string; // ISO day
  value: number;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  if (denom === 0) return 0;
  return num / denom;
}

function classify(r: number): { direction: Correlation["direction"]; strength: Correlation["strength"] } {
  const abs = Math.abs(r);
  const strength =
    abs >= 0.6 ? "strong" : abs >= 0.4 ? "moderate" : abs >= 0.2 ? "weak" : "negligible";
  const direction = strength === "negligible" ? "none" : r > 0 ? "positive" : "negative";
  return { direction, strength };
}

// Correlate every quantifiable factor against the target factor, using only
// entries where BOTH have a numeric value (pairwise complete observations).
export function computeCorrelations(
  factors: SenseFactor[],
  entries: Entry[],
  targetFactorId: string
): Correlation[] {
  const target = factors.find((f) => f.id === targetFactorId);
  if (!target) return [];

  const out: Correlation[] = [];
  for (const factor of factors) {
    if (factor.id === targetFactorId) continue;

    const xs: number[] = [];
    const ys: number[] = [];
    for (const entry of entries) {
      const fv = entry.values.find((v) => v.factorId === factor.id);
      const tv = entry.values.find((v) => v.factorId === targetFactorId);
      if (!fv || !tv) continue;
      const x = toNumeric(factor.entryType, fv.value);
      const y = toNumeric(target.entryType, tv.value);
      if (x === null || y === null) continue;
      xs.push(x);
      ys.push(y);
    }

    if (xs.length < 2) continue;
    const r = pearson(xs, ys);
    const { direction, strength } = classify(r);
    out.push({ factor, r, sampleSize: xs.length, direction, strength });
  }

  // Strongest absolute correlation first.
  return out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

// Daily trend series for the target factor (one point per entry, chronological).
export function targetTrend(entries: Entry[], targetFactorId: string, entryType: SenseFactor["entryType"]): TrendPoint[] {
  return entries
    .map((e) => {
      const v = e.values.find((x) => x.factorId === targetFactorId);
      if (!v) return null;
      const num = toNumeric(entryType, v.value);
      if (num === null) return null;
      return { date: e.loggedAt.slice(0, 10), value: num };
    })
    .filter((p): p is TrendPoint => p !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function targetEntryCount(entries: Entry[], targetFactorId: string): number {
  return entries.filter((e) => e.values.some((v) => v.factorId === targetFactorId && v.value !== null && v.value !== "")).length;
}
