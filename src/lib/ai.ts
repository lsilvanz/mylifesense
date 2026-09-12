import type { Analysis } from "./insights";

// Compact, privacy-preserving summary sent to the serverless Claude endpoint —
// only computed statistics, never raw entries.
export function buildSummary(a: Analysis) {
  return {
    target: a.target.label,
    goal: a.goal,
    isSymptom: a.isSymptom,
    entryCount: a.entryCount,
    enoughData: a.enoughData,
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
  question?: string
): Promise<string | null> {
  try {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, summary: buildSummary(a), question }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: string; error?: string };
    if (data.error || !data.text) return null;
    return data.text;
  } catch {
    return null;
  }
}

export function askClaudeChat(a: Analysis, question: string) {
  return callClaude("chat", a, question);
}

export function askClaudeNarrative(a: Analysis) {
  return callClaude("narrative", a);
}
