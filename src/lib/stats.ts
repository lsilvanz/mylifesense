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

// ---------------------------------------------------------------------------
// Extra statistics for the richer Insights engine.
// ---------------------------------------------------------------------------

// Average ranks (ties share the mean of their positions).
function rank(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(xs.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1; // 1-based average rank
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = avg;
    i = j + 1;
  }
  return ranks;
}

export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
}

// Spearman rank correlation — robust to non-linear/ordinal data.
export function spearman(xs: number[], ys: number[]): number {
  if (xs.length < 3) return 0;
  return pearson(rank(xs), rank(ys));
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
}

// Cohen's d — standardized difference between two groups' means.
export function cohensD(a: number[], b: number[]): number {
  if (a.length < 2 || b.length < 2) return 0;
  const pooled = Math.sqrt(((a.length - 1) * variance(a) + (b.length - 1) * variance(b)) / (a.length + b.length - 2));
  if (pooled === 0) return 0;
  return (mean(a) - mean(b)) / pooled;
}

// --- Student's t two-tailed p-value via the regularized incomplete beta ---
function gammln(xx: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let x = xx;
  let y = xx;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += cof[j] / ++y;
  return -tmp + Math.log((2.5066282746310002 * ser) / x);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(gammln(a + b) - gammln(a) - gammln(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

// Two-tailed p-value for a correlation r over n paired observations.
export function correlationPValue(r: number, n: number): number {
  const df = n - 2;
  if (df <= 0) return 1;
  const rr = Math.min(Math.max(r, -0.999999), 0.999999);
  const t = rr * Math.sqrt(df / (1 - rr * rr));
  return betai(df / 2, 0.5, df / (df + t * t));
}

// Benjamini–Hochberg: which p-values are significant at false-discovery-rate q.
export function benjaminiHochberg(pValues: number[], q = 0.1): boolean[] {
  const n = pValues.length;
  const order = pValues.map((p, i) => [p, i] as [number, number]).sort((a, b) => a[0] - b[0]);
  const sig = new Array(n).fill(false);
  let maxK = -1;
  for (let k = 0; k < n; k++) {
    if (order[k][0] <= ((k + 1) / n) * q) maxK = k;
  }
  for (let k = 0; k <= maxK; k++) sig[order[k][1]] = true;
  return sig;
}
