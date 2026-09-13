"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AppHeader, Button, Card, LinkButton, Loading } from "@/components/ui";
import { TrendChart } from "@/components/trend-chart";
import { MIN_SAMPLE_SIZE } from "@/lib/stats";
import { analyzeSense, type Confidence, type Finding, type IntegrationOverlay } from "@/lib/insights";
import { headlineNarrative } from "@/lib/narrative";
import { categoryEmoji } from "@/lib/entryTypes";
import { askClaudeNarrative } from "@/lib/ai";
import { combinedContextForAI } from "@/lib/context";
import { useStore } from "@/lib/store";
import { fetchIntegrationData, isConnected } from "@/lib/fitbit";

export default function InsightsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <InsightsInner />
    </Suspense>
  );
}

function InsightsInner() {
  const id = useSearchParams().get("sense") ?? "";
  const { ready, getSense, factorsFor, entriesFor } = useStore();
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  // Live Fitbit data, held in memory only (never written to entries).
  const [overlay, setOverlay] = useState<IntegrationOverlay | null>(null);
  const [fbLoading, setFbLoading] = useState(false);
  const [fbNonce, setFbNonce] = useState(0);

  const fitbitFactors = useMemo(
    () =>
      (ready ? factorsFor(id) : []).filter(
        (f) => f.entryType === "integration" && (f.config.provider ?? "").toLowerCase() === "fitbit"
      ),
    [ready, factorsFor, id]
  );

  // Pull live Fitbit data when the Sense has Fitbit factors and we're connected.
  useEffect(() => {
    if (!ready) return;
    const factors = factorsFor(id);
    const hasFitbit = factors.some(
      (f) => f.entryType === "integration" && (f.config.provider ?? "").toLowerCase() === "fitbit"
    );
    if (!hasFitbit || !isConnected()) {
      setOverlay(null);
      return;
    }
    let cancelled = false;
    setFbLoading(true);
    fetchIntegrationData(factors)
      .then((o) => !cancelled && setOverlay(o))
      .finally(() => !cancelled && setFbLoading(false));
    return () => {
      cancelled = true;
    };
  }, [ready, id, factorsFor, fbNonce]);

  const analysis = useMemo(() => {
    if (!ready) return null;
    return analyzeSense(factorsFor(id), entriesFor(id), overlay ?? undefined);
  }, [ready, id, factorsFor, entriesFor, overlay]);

  if (!ready) return <Loading />;
  const sense = getSense(id);
  if (!sense || !analysis) {
    return (
      <main className="px-4">
        <AppHeader title="Insights" back="/" />
        <p className="py-16 text-center text-muted">Nothing to analyse yet.</p>
      </main>
    );
  }

  const targetLabel = analysis.target.label.toLowerCase();
  const narrative = headlineNarrative(analysis);

  const personalize = async () => {
    setAiLoading(true);
    const t = await askClaudeNarrative(analysis, combinedContextForAI(id));
    setAiText(t ?? "AI narrative isn't set up on this deployment yet — showing the computed summary.");
    setAiLoading(false);
  };

  return (
    <main className="px-4 pb-24">
      <AppHeader
        title={`Insights · ${sense.title}`}
        back="/"
        right={
          <Link
            href={`/sense/settings?sense=${id}`}
            aria-label="Manage Sense"
            className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-raised hover:text-ink"
          >
            ⚙
          </Link>
        }
      />

      {/* Headline */}
      <Card className="mt-4 overflow-hidden">
        <div className="relative overflow-hidden bg-accent-soft px-5 py-4">
          <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-gradient-accent opacity-25 blur-3xl" />
          <div className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-ink">
            ✦ AI narrative
          </div>
          <p className="relative mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-ink">
            {aiText ?? narrative}
          </p>
          {analysis.enoughData && (
            <button
              onClick={personalize}
              disabled={aiLoading}
              className="relative mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-surface/70 px-3 py-1 text-xs font-semibold text-accent-ink shadow-card transition hover:brightness-105 disabled:opacity-60"
            >
              {aiLoading ? "Thinking…" : aiText ? "↻ Regenerate with AI" : "✦ Personalize with AI"}
            </button>
          )}
        </div>
        <p className="px-5 py-2 text-xs text-faint">
          From {analysis.entryCount} entries · Spearman correlations, effect sizes and same-/next-day
          lags computed on-device; findings pass a false-discovery check.
          {aiText ? " Narrative written by Claude over the summary." : ""}
        </p>
      </Card>

      {fitbitFactors.length > 0 && (
        <Card className="mt-4 flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">⌚ Fitbit</p>
            <p className="mt-0.5 text-xs text-muted">
              {!isConnected()
                ? `Connect Fitbit to fold ${fitbitFactors
                    .map((f) => f.label)
                    .join(", ")} into these insights.`
                : fbLoading
                ? "Loading live Fitbit data…"
                : overlay && Object.keys(overlay).length
                ? `Using live ${fitbitFactors
                    .map((f) => f.label)
                    .join(", ")} — analysis only, not saved to your entries.`
                : "No Fitbit data returned for this range yet."}
            </p>
          </div>
          {isConnected() ? (
            <Button
              variant="outline"
              className="shrink-0"
              disabled={fbLoading}
              onClick={() => setFbNonce((n) => n + 1)}
            >
              {fbLoading ? "…" : "Refresh"}
            </Button>
          ) : (
            <LinkButton href="/about" variant="soft" className="shrink-0">
              Connect
            </LinkButton>
          )}
        </Card>
      )}

      {!analysis.enoughData && (
        <Card className="mt-4 border-dashed p-4">
          <p className="text-sm font-semibold text-ink">Not enough data yet</p>
          <div className="mt-2 h-2 w-full rounded-full bg-raised">
            <div
              className="h-full rounded-full bg-gradient-accent transition-all"
              style={{ width: `${Math.min(100, (analysis.entryCount / MIN_SAMPLE_SIZE) * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            {analysis.entryCount} / {MIN_SAMPLE_SIZE} entries. Below this a pattern is mostly noise,
            so we won&apos;t claim one — and neither will Chat.
          </p>
        </Card>
      )}

      {analysis.trend.length > 1 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold text-ink">{analysis.target.label} over time</h2>
          <Card className="p-4">
            <TrendChart data={analysis.trend} label={analysis.target.label} />
          </Card>
        </section>
      )}

      {/* Top insights + recommendations */}
      {analysis.topInsights.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold text-ink">Top insights</h2>
          <div className="space-y-3">
            {analysis.topInsights.map((f) => (
              <InsightCard key={f.factor.id} f={f} targetLabel={targetLabel} />
            ))}
          </div>
        </section>
      )}

      {/* All signals */}
      {analysis.enoughData && analysis.findings.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold text-ink">All signals</h2>
          <Card className="divide-y divide-line">
            {analysis.findings.map((f) => (
              <SignalRow key={f.factor.id} f={f} />
            ))}
          </Card>
        </section>
      )}

      <div className="mt-6 flex gap-3">
        <LinkButton href={`/log?sense=${id}`} variant="soft" className="flex-1">
          Log an entry
        </LinkButton>
        <LinkButton href={`/chat?sense=${id}`} variant="outline" className="flex-1">
          Ask a question
        </LinkButton>
      </div>
      <div className="mt-3">
        <LinkButton href={`/sense/entries?sense=${id}`} variant="ghost" className="w-full">
          Browse &amp; edit entries
        </LinkButton>
      </div>
    </main>
  );
}

const CONF_META: Record<Confidence, { label: string; cls: string }> = {
  strong: { label: "Strong", cls: "bg-gradient-accent text-white" },
  moderate: { label: "Moderate", cls: "bg-accent-soft text-accent-ink" },
  tentative: { label: "Early signal", cls: "bg-raised text-muted border border-line" },
  none: { label: "No clear link", cls: "bg-raised text-faint border border-line" },
};

function ConfBadge({ c }: { c: Confidence }) {
  const m = CONF_META[c];
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.cls}`}>
      {m.label}
    </span>
  );
}

function InsightCard({ f, targetLabel }: { f: Finding; targetLabel: string }) {
  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
          <span>{categoryEmoji(f.factor.category)}</span>
          {f.factor.label}
          {f.lag === 1 && (
            <span className="rounded-full bg-raised px-1.5 py-0.5 text-[10px] font-medium text-muted">
              next-day
            </span>
          )}
        </span>
        <ConfBadge c={f.confidence} />
      </div>
      <p className="text-sm leading-relaxed text-muted">{f.headline}</p>
      {f.recommendation ? (
        <div className="mt-2.5 rounded-xl bg-accent-soft px-3 py-2.5 text-[13px] leading-relaxed text-accent-ink">
          💡 {f.recommendation}
        </div>
      ) : (
        !f.controllable && (
          <p className="mt-1.5 text-xs text-faint">
            Context, not a lever — useful to know, but not something to act on directly.
          </p>
        )
      )}
    </Card>
  );
}

function SignalRow({ f }: { f: Finding }) {
  const good = f.confidence !== "none" && f.beneficialIncrease;
  const bad = f.confidence !== "none" && f.beneficialIncrease === false;
  const dot = good ? "bg-positive" : bad ? "bg-negative" : "bg-faint";
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <span className="truncate text-sm font-medium text-ink">
          {categoryEmoji(f.factor.category)} {f.factor.label}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="tabular-nums text-xs text-faint">
          r={f.r >= 0 ? "+" : ""}
          {f.r.toFixed(2)} · n={f.n}
        </span>
        <ConfBadge c={f.confidence} />
      </div>
    </div>
  );
}
