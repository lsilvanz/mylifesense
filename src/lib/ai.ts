import type { Analysis } from "./insights";
import type { EntryType, EntryValueData, FactorCategory, SenseFactor } from "./types";

// Compact, privacy-preserving summary sent to the serverless Claude endpoint —
// only computed statistics (never raw entries) plus any user-provided context.
export function buildSummary(a: Analysis, context?: string) {
  return {
    target: a.target.label,
    goal: a.goal,
    isSymptom: a.isSymptom,
    entryCount: a.entryCount,
    enoughData: a.enoughData,
    ...(context ? { context } : {}),
    findings: a.findings.slice(0, 8).map((f) => ({
      factor: f.factor.label,
      controllable: f.controllable,
      lag: f.lag === 1 ? "previous-day" : "same-day",
      r: Number(f.r.toFixed(2)),
      confidence: f.confidence,
      effect: f.deltaText ? `${a.target.label} averages ${f.deltaText}` : undefined,
      direction:
        f.beneficialIncrease === undefined
          ? "unclear"
          : f.beneficialIncrease
          ? "more of it is better"
          : "more of it is worse",
      n: f.n,
    })),
  };
}

// Returns Claude's text, or null when the AI endpoint is unavailable/unconfigured
// (the caller then falls back to the deterministic layer).
async function callClaude(
  mode: "chat" | "narrative",
  a: Analysis,
  question?: string,
  context?: string
): Promise<string | null> {
  try {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, summary: buildSummary(a, context), question }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: string; error?: string };
    if (data.error || !data.text) return null;
    return data.text;
  } catch {
    return null;
  }
}

export function askClaudeChat(a: Analysis, question: string, context?: string) {
  return callClaude("chat", a, question, context);
}

export function askClaudeNarrative(a: Analysis, context?: string) {
  return callClaude("narrative", a, undefined, context);
}

// ---- AI factor suggestions ------------------------------------------------
export interface SuggestedFactor {
  label: string;
  category: FactorCategory;
  entryType: EntryType;
  controllable?: boolean;
  isTarget?: boolean;
  goalDirection?: "minimize" | "maximize";
  unit?: string;
  options?: string[];
  multiple?: boolean;
}

const CATEGORIES: FactorCategory[] = [
  "Symptoms",
  "Food",
  "Exercise",
  "Sleep",
  "Environment",
  "Mood",
  "Custom",
];
const ENTRY_TYPES: EntryType[] = [
  "yes_no",
  "scale_0_10",
  "low_med_high",
  "number",
  "free_text",
  "integration",
  "list",
];

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Returns suggested factors, or null when AI is unavailable/unparseable.
// ---- Voice / text -> structured log values --------------------------------
function coerce(factor: SenseFactor, raw: unknown): EntryValueData | undefined {
  switch (factor.entryType) {
    case "yes_no":
      if (typeof raw === "boolean") return raw;
      if (typeof raw === "string") return /^(y|t|true|yes)/i.test(raw);
      return undefined;
    case "scale_0_10": {
      const n = Math.round(Number(raw));
      return Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : undefined;
    }
    case "number": {
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    case "low_med_high": {
      const s = String(raw).toLowerCase();
      if (s.startsWith("l")) return "low";
      if (s.startsWith("h")) return "high";
      if (s.startsWith("m")) return "med";
      return undefined;
    }
    case "list": {
      const opts = factor.config.options ?? [];
      const match = (v: unknown) =>
        opts.find((o) => o.toLowerCase() === String(v).toLowerCase());
      if (factor.config.multiple) {
        const arr = (Array.isArray(raw) ? raw : [raw]).map(match).filter(Boolean) as string[];
        return arr.length ? arr : undefined;
      }
      return match(Array.isArray(raw) ? raw[0] : raw);
    }
    case "free_text":
      return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
    default:
      return undefined;
  }
}

// Returns a map of factorId -> value parsed from a transcript, or null on failure.
export async function parseLog(
  transcript: string,
  factors: SenseFactor[]
): Promise<Record<string, EntryValueData> | null> {
  try {
    const slim = factors
      .filter((f) => f.entryType !== "integration")
      .map((f) => ({
        id: f.id,
        label: f.label,
        entryType: f.entryType,
        options: f.config.options,
        unit: f.config.unit,
        multiple: f.config.multiple,
      }));
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "parse_log", transcript, factors: slim }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: string; error?: string };
    if (data.error || !data.text) return null;
    const parsed = extractJson(data.text) as { values?: { factorId: string; value: unknown }[] } | null;
    if (!parsed || !Array.isArray(parsed.values)) return null;

    const out: Record<string, EntryValueData> = {};
    for (const v of parsed.values) {
      const factor = factors.find((f) => f.id === v.factorId);
      if (!factor) continue;
      const value = coerce(factor, v.value);
      if (value !== undefined) out[factor.id] = value;
    }
    return out;
  } catch {
    return null;
  }
}

export async function suggestFactors(
  title: string,
  question: string,
  existing: string[],
  context?: string
): Promise<SuggestedFactor[] | null> {
  try {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "suggest_factors",
        title,
        sense_question: question,
        existing,
        context,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: string; error?: string };
    if (data.error || !data.text) return null;
    const parsed = extractJson(data.text) as { factors?: unknown[] } | null;
    if (!parsed || !Array.isArray(parsed.factors)) return null;

    const out: SuggestedFactor[] = [];
    for (const raw of parsed.factors) {
      const f = raw as Record<string, unknown>;
      const label = typeof f.label === "string" ? f.label.trim() : "";
      if (!label) continue;
      const category = CATEGORIES.includes(f.category as FactorCategory)
        ? (f.category as FactorCategory)
        : "Custom";
      const entryType = ENTRY_TYPES.includes(f.entryType as EntryType)
        ? (f.entryType as EntryType)
        : "yes_no";
      out.push({
        label,
        category,
        entryType,
        controllable: typeof f.controllable === "boolean" ? f.controllable : undefined,
        isTarget: f.isTarget === true,
        goalDirection:
          f.goalDirection === "minimize" || f.goalDirection === "maximize"
            ? (f.goalDirection as "minimize" | "maximize")
            : undefined,
        unit: typeof f.unit === "string" ? f.unit : undefined,
        options: Array.isArray(f.options) ? (f.options as unknown[]).map(String) : undefined,
        multiple: typeof f.multiple === "boolean" ? f.multiple : undefined,
      });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}
