import { MIN_SAMPLE_SIZE } from "./stats";
import type { Analysis, Finding } from "./insights";

// The brief (section 3): compute the stats first, then write prose over the
// structured summary — never free-associate over raw entries. In this prototype
// the "language layer" is deterministic; in production `Analysis` is exactly the
// summary you'd hand Claude, and only these functions change.

export function headlineNarrative(a: Analysis): string {
  const targetLabel = a.target.label.toLowerCase();
  if (!a.enoughData) {
    return `You've logged ${a.entryCount} ${a.entryCount === 1 ? "entry" : "entries"} against ${targetLabel}. Patterns need about ${MIN_SAMPLE_SIZE} before they mean anything — keep logging and this will fill in.`;
  }
  if (a.topInsights.length === 0) {
    return `Across ${a.entryCount} entries, nothing you're tracking shows a clear link to ${targetLabel} yet. That's a real finding — it may be driven by something you're not logging.`;
  }
  const top = a.topInsights[0];
  let out = top.headline;
  const second = a.topInsights[1];
  if (second) out += ` ${second.headline}`;
  return out;
}

export function answerQuestion(q: string, a: Analysis): string {
  const query = q.toLowerCase();
  const targetLabel = a.target.label.toLowerCase();

  if (!a.enoughData) {
    return `I can't answer that with confidence yet — there are only ${a.entryCount} entries against ${targetLabel}, and I don't report patterns below ${MIN_SAMPLE_SIZE}. Ask me again once you've logged a couple more weeks.`;
  }

  // A specific factor mentioned?
  const named = a.findings.find((f) =>
    query.includes(f.factor.label.toLowerCase().split(" ")[0])
  );
  if (named) {
    if (named.confidence === "none") {
      return `${cap(named.factor.label)} doesn't show a clear relationship with ${targetLabel} in your ${named.n} days of data.`;
    }
    return `${named.headline} (${confidenceWord(named)}, n=${named.n}).${
      named.recommendation ? ` ${named.recommendation}` : ""
    }`;
  }

  if (/worse|increase|higher|trigger|cause|bad/.test(query)) {
    const bad = a.findings.filter(
      (f) => f.confidence !== "none" && f.beneficialIncrease === false
    );
    if (bad.length === 0) return `Nothing you're tracking clearly worsens ${targetLabel}.`;
    return `Linked to worse ${targetLabel}: ${bad.slice(0, 3).map((f) => f.factor.label.toLowerCase()).join(", ")}.`;
  }
  if (/better|reduce|lower|help|improve|fix/.test(query)) {
    const good = a.findings.filter(
      (f) => f.confidence !== "none" && f.beneficialIncrease === true && f.controllable
    );
    if (good.length === 0) return `Nothing you're tracking clearly improves ${targetLabel} yet.`;
    const rec = good[0].recommendation;
    return rec ?? `Linked to better ${targetLabel}: ${good.map((f) => f.factor.label.toLowerCase()).join(", ")}.`;
  }

  return headlineNarrative(a) + ` You have ${a.entryCount} entries so far — ask about a specific factor for detail.`;
}

function confidenceWord(f: Finding): string {
  return f.confidence === "strong"
    ? "strong pattern"
    : f.confidence === "moderate"
    ? "moderate pattern"
    : "early signal";
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const SUGGESTED_QUESTIONS = ["What helps?", "What makes it worse?", "What should I try?"];
