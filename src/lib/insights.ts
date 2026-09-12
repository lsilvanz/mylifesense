import { toNumeric } from "./entryTypes";
import {
  MIN_SAMPLE_SIZE,
  benjaminiHochberg,
  correlationPValue,
  mean,
  spearman,
  targetEntryCount,
  targetTrend,
  type TrendPoint,
} from "./stats";
import type { Entry, FactorCategory, SenseFactor } from "./types";

export type Confidence = "strong" | "moderate" | "tentative" | "none";

export interface Finding {
  factor: SenseFactor;
  lag: 0 | 1; // 0 = same day, 1 = factor on the previous day
  r: number; // signed Spearman at the chosen lag
  n: number;
  p: number;
  significant: boolean; // after Benjamini–Hochberg
  confidence: Confidence;
  controllable: boolean;
  kind: "group" | "numeric";
  deltaText?: string; // e.g. "3.1 vs 6.4"
  beneficialIncrease?: boolean; // does more of the factor move the target the good way?
  valueScore: number;
  headline: string;
  recommendation?: string;
}

export interface Analysis {
  target: SenseFactor;
  goal: "minimize" | "maximize";
  entryCount: number;
  enoughData: boolean;
  findings: Finding[]; // all comparable factors, ranked by value
  topInsights: Finding[]; // best few, meaningful only
  trend: TrendPoint[];
  isSymptom: boolean;
}

const LEVER_CATEGORIES: FactorCategory[] = ["Exercise", "Food", "Sleep", "Custom"];

export function goalOf(target: SenseFactor): "minimize" | "maximize" {
  return target.config.goalDirection ?? (target.category === "Symptoms" ? "minimize" : "maximize");
}

export function isControllable(f: SenseFactor): boolean {
  if (typeof f.config.controllable === "boolean") return f.config.controllable;
  return LEVER_CATEGORIES.includes(f.category);
}

// Live data pulled from a provider (e.g. Fitbit) at analysis time — used for
// insights/chat only, never written into the user's entries.
export type IntegrationOverlay = Record<string, { date: string; value: number }[]>;

// One numeric value per calendar day (mean if a day has several entries).
// Integration-typed factors draw from the live overlay when present.
function dailySeries(
  entries: Entry[],
  factor: SenseFactor,
  overlay?: IntegrationOverlay
): Map<string, number> {
  if (overlay && overlay[factor.id]) {
    const out = new Map<string, number>();
    for (const p of overlay[factor.id]) out.set(p.date, p.value);
    return out;
  }
  const buckets = new Map<string, number[]>();
  for (const e of entries) {
    const v = e.values.find((x) => x.factorId === factor.id);
    if (!v) continue;
    const num = toNumeric(factor.entryType, v.value);
    if (num === null) continue;
    const day = e.loggedAt.slice(0, 10);
    if (!buckets.has(day)) buckets.set(day, []);
    buckets.get(day)!.push(num);
  }
  const out = new Map<string, number>();
  for (const [day, vals] of buckets) out.set(day, mean(vals));
  return out;
}

function prevDay(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

interface Paired {
  fx: number[];
  ty: number[];
}

function pairs(
  factorDaily: Map<string, number>,
  targetDaily: Map<string, number>,
  lag: 0 | 1
): Paired {
  const fx: number[] = [];
  const ty: number[] = [];
  for (const [day, t] of targetDaily) {
    const key = lag === 0 ? day : prevDay(day);
    const f = factorDaily.get(key);
    if (f === undefined) continue;
    fx.push(f);
    ty.push(t);
  }
  return { fx, ty };
}

function confidenceOf(significant: boolean, absR: number, n: number): Confidence {
  if (significant && absR >= 0.5 && n >= 20) return "strong";
  if (significant && absR >= 0.3) return "moderate";
  if (absR >= 0.3 && n >= MIN_SAMPLE_SIZE) return "tentative";
  return "none";
}

const CONF_WEIGHT: Record<Confidence, number> = {
  strong: 1,
  moderate: 0.7,
  tentative: 0.4,
  none: 0.1,
};

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function analyzeSense(
  factors: SenseFactor[],
  entries: Entry[],
  overlay?: IntegrationOverlay
): Analysis | null {
  const target = factors.find((f) => f.isTarget) ?? factors[0];
  if (!target) return null;
  const goal = goalOf(target);
  const isSymptom = target.category === "Symptoms";
  const entryCount = targetEntryCount(entries, target.id);
  const enoughData = entryCount >= MIN_SAMPLE_SIZE;
  const trend = targetTrend(entries, target.id, target.entryType);
  const targetLabel = target.label.toLowerCase();

  const targetDaily = dailySeries(entries, target, overlay);

  interface Raw {
    factor: SenseFactor;
    lag: 0 | 1;
    r: number;
    n: number;
    p: number;
    kind: "group" | "numeric";
    deltaText?: string;
  }
  const raws: Raw[] = [];

  for (const factor of factors) {
    if (factor.id === target.id) continue;
    const factorDaily = dailySeries(entries, factor, overlay);
    if (factorDaily.size < 3) continue;

    // Pick the lag (same-day vs previous-day) with the stronger relationship.
    let best: Raw | null = null;
    for (const lag of [0, 1] as const) {
      const { fx, ty } = pairs(factorDaily, targetDaily, lag);
      if (fx.length < 5) continue;
      const r = spearman(fx, ty);
      const p = correlationPValue(r, fx.length);
      if (best === null || Math.abs(r) > Math.abs(best.r)) {
        const grouped = factor.entryType === "yes_no" || factor.entryType === "low_med_high";
        let deltaText: string | undefined;
        if (grouped) {
          const hi: number[] = [];
          const lo: number[] = [];
          const threshold = factor.entryType === "yes_no" ? 0.5 : 1; // low_med_high: high=2
          for (let i = 0; i < fx.length; i++) (fx[i] >= threshold ? hi : lo).push(ty[i]);
          if (hi.length >= 2 && lo.length >= 2) {
            deltaText = `${mean(hi).toFixed(1)} vs ${mean(lo).toFixed(1)}`;
          }
        }
        best = { factor, lag, r, n: fx.length, p, kind: grouped ? "group" : "numeric", deltaText };
      }
    }
    if (best) raws.push(best);
  }

  // Multiple-comparison control across all tested factors.
  const sig = benjaminiHochberg(
    raws.map((x) => x.p),
    0.1
  );

  const findings: Finding[] = raws.map((raw, i) => {
    const absR = Math.abs(raw.r);
    const significant = sig[i];
    const confidence = confidenceOf(significant, absR, raw.n);
    const controllable = isControllable(raw.factor);
    // Increasing the factor moves the target this way: r>0 => up, r<0 => down.
    const targetGoesUp = raw.r > 0;
    const beneficialIncrease = goal === "minimize" ? !targetGoesUp : targetGoesUp;
    const valueScore = absR * CONF_WEIGHT[confidence] * (controllable ? 1 : 0.6);

    const label = raw.factor.label.toLowerCase();
    const dirWord = targetGoesUp ? "higher" : "lower";
    const when =
      raw.lag === 1 ? `the day after more ${label}` : `on days with more ${label}`;
    const headline =
      raw.kind === "group" && raw.deltaText
        ? `${when.replace("more ", "")}, ${targetLabel} averages ${raw.deltaText}.`
        : `More ${label}${raw.lag === 1 ? " (day before)" : ""} goes with ${dirWord} ${targetLabel}.`;

    const finding: Finding = {
      factor: raw.factor,
      lag: raw.lag,
      r: raw.r,
      n: raw.n,
      p: raw.p,
      significant,
      confidence,
      controllable,
      kind: raw.kind,
      deltaText: raw.deltaText,
      beneficialIncrease,
      valueScore,
      headline: cap(headline),
    };
    finding.recommendation = buildRecommendation(finding, target, goal, isSymptom);
    return finding;
  });

  findings.sort((a, b) => b.valueScore - a.valueScore);

  const topInsights = enoughData
    ? findings.filter((f) => f.confidence !== "none").slice(0, 3)
    : [];

  return { target, goal, entryCount, enoughData, findings, topInsights, trend, isSymptom };
}

function buildRecommendation(
  f: Finding,
  target: SenseFactor,
  goal: "minimize" | "maximize",
  isSymptom: boolean
): string | undefined {
  if (f.confidence === "none") return undefined;
  if (!f.controllable) return undefined; // context explains, but isn't a lever

  const label = f.factor.label.toLowerCase();
  const targetLabel = target.label.toLowerCase();
  const goalWord = goal === "minimize" ? "lower" : "raise";
  const more = f.beneficialIncrease;

  let action: string;
  if (f.factor.entryType === "yes_no") action = more ? `do more of "${f.factor.label}"` : `cut back on "${f.factor.label}"`;
  else action = more ? `more ${label}` : `less ${label}`;

  const evidence = f.deltaText
    ? ` (${targetLabel} averaged ${f.deltaText} in your data)`
    : "";
  const hedge =
    f.confidence === "strong"
      ? "This is a consistent pattern so far."
      : f.confidence === "moderate"
      ? "It's a moderate pattern — worth a real try."
      : "Early signal — keep logging to confirm.";

  const safety = isSymptom
    ? " Not medical advice — see a clinician for persistent or severe symptoms."
    : "";

  return `Worth trying: ${action} to ${goalWord} your ${targetLabel}${evidence}. ${hedge}${safety}`;
}
