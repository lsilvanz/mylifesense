import type { Correlation } from "./stats";
import { MIN_SAMPLE_SIZE } from "./stats";
import type { Sense, SenseFactor } from "./types";

// The brief (section 3) is emphatic: never free-associate over raw entries.
// Compute the stats first, hand a small structured summary to the language
// layer, and let it write prose. In this local prototype the "language layer"
// is the deterministic generator below; in production this function's inputs
// are exactly the summary you would send to Claude/GPT, and its body is the
// only thing you would replace.

export interface StatsSummary {
  sense: Sense;
  target: SenseFactor;
  entryCount: number;
  correlations: Correlation[];
  enoughData: boolean;
}

export function headlineNarrative(s: StatsSummary): string {
  if (!s.enoughData) {
    return `You've logged ${s.entryCount} ${s.entryCount === 1 ? "entry" : "entries"} against ${s.target.label.toLowerCase()}. Correlations need about ${MIN_SAMPLE_SIZE} before they mean anything — keep logging and this will fill in.`;
  }
  const meaningful = s.correlations.filter((c) => c.strength !== "negligible");
  if (meaningful.length === 0) {
    return `Across ${s.entryCount} entries, nothing you're tracking shows a clear link to ${s.target.label.toLowerCase()} yet. That's a real finding — it may be driven by something you're not logging.`;
  }
  const top = meaningful[0];
  const dir = top.r < 0 ? "lower" : "higher";
  const lead = `Over ${top.sampleSize} entries, higher ${top.factor.label.toLowerCase()} tends to go with ${dir} ${s.target.label.toLowerCase()} (r ${top.r >= 0 ? "+" : ""}${top.r.toFixed(2)}, a ${top.strength} link).`;
  const second = meaningful[1];
  if (!second) return lead;
  const dir2 = second.r < 0 ? "lower" : "higher";
  return `${lead} ${cap(second.factor.label)} also moves with it — more of it, ${dir2} ${s.target.label.toLowerCase()}.`;
}

// Very small keyword router so Chat feels alive without an API key. It only
// ever speaks from the pre-computed summary, and refuses to invent a trend
// below the sample-size floor — the same guardrail the real LLM prompt gets.
export function answerQuestion(q: string, s: StatsSummary): string {
  const query = q.toLowerCase();

  if (!s.enoughData) {
    return `I can't answer that with confidence yet — there are only ${s.entryCount} entries against ${s.target.label.toLowerCase()}, and I don't report patterns below ${MIN_SAMPLE_SIZE}. Ask me again once you've logged a couple more weeks.`;
  }

  const named = s.correlations.find((c) => query.includes(c.factor.label.toLowerCase().split(" ")[0]));
  if (named) {
    if (named.strength === "negligible") {
      return `${cap(named.factor.label)} doesn't show a clear relationship with ${s.target.label.toLowerCase()} in your ${named.sampleSize} paired entries (r ${named.r.toFixed(2)}).`;
    }
    const dir = named.r < 0 ? "less" : "more";
    return `In your data, more ${named.factor.label.toLowerCase()} goes with ${dir} ${s.target.label.toLowerCase()} — a ${named.strength} ${named.r < 0 ? "negative" : "positive"} link (r ${named.r >= 0 ? "+" : ""}${named.r.toFixed(2)}, n=${named.sampleSize}). Correlation isn't proof, but it's worth watching.`;
  }

  const meaningful = s.correlations.filter((c) => c.strength !== "negligible");
  if (/worse|increase|higher|trigger|cause/.test(query)) {
    const up = meaningful.filter((c) => c.r > 0);
    if (up.length === 0) return `Nothing you're tracking clearly pushes ${s.target.label.toLowerCase()} up.`;
    return `Things that go with higher ${s.target.label.toLowerCase()}: ${list(up)}.`;
  }
  if (/better|reduce|lower|help|improve/.test(query)) {
    const down = meaningful.filter((c) => c.r < 0);
    if (down.length === 0) return `Nothing you're tracking clearly brings ${s.target.label.toLowerCase()} down.`;
    return `Things that go with lower ${s.target.label.toLowerCase()}: ${list(down)}.`;
  }

  // Default: summarise.
  return headlineNarrative(s) + ` You have ${s.entryCount} entries so far — ask about a specific factor for detail.`;
}

function list(cs: Correlation[]): string {
  return cs
    .map((c) => `${c.factor.label.toLowerCase()} (r ${c.r >= 0 ? "+" : ""}${c.r.toFixed(2)})`)
    .join(", ");
}

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}

export const SUGGESTED_QUESTIONS = [
  "What makes it worse?",
  "What helps?",
  "Does coffee matter?",
];
