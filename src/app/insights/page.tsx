"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AppHeader, Button, Card, LinkButton, Loading } from "@/components/ui";
import { CorrelationBars } from "@/components/correlation-bars";
import { TrendChart } from "@/components/trend-chart";
import {
  MIN_SAMPLE_SIZE,
  computeCorrelations,
  targetEntryCount,
  targetTrend,
} from "@/lib/stats";
import { headlineNarrative } from "@/lib/narrative";
import { useStore } from "@/lib/store";
import { fetchMetric, getSession } from "@/lib/fitbit";

function ymd(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function InsightsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <InsightsInner />
    </Suspense>
  );
}

function InsightsInner() {
  const id = useSearchParams().get("sense") ?? "";
  const { ready, getSense, factorsFor, entriesFor, applyIntegrationData } = useStore();
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fitbitFactors = useMemo(
    () =>
      (ready ? factorsFor(id) : []).filter(
        (f) => f.entryType === "integration" && (f.config.provider ?? "").toLowerCase() === "fitbit"
      ),
    [ready, factorsFor, id]
  );

  const syncFitbit = async () => {
    if (!getSession()) {
      setSyncMsg({ ok: false, text: "Connect Fitbit in About → Connect devices first." });
      return;
    }
    setSyncing(true);
    setSyncMsg(null);
    try {
      const end = ymd(new Date());
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      const start = ymd(startDate);
      let points = 0;
      for (const f of fitbitFactors) {
        const series = await fetchMetric(f.config.metric ?? "steps", start, end);
        applyIntegrationData(f.id, series);
        points += series.length;
      }
      setSyncMsg({ ok: true, text: `Synced ${points} days from Fitbit.` });
    } catch (e) {
      setSyncMsg({ ok: false, text: e instanceof Error ? e.message : "Fitbit sync failed." });
    } finally {
      setSyncing(false);
    }
  };

  const model = useMemo(() => {
    if (!ready) return null;
    const factors = factorsFor(id);
    const entries = entriesFor(id);
    const target = factors.find((f) => f.isTarget) ?? factors[0];
    if (!target) return null;
    const correlations = computeCorrelations(factors, entries, target.id);
    const entryCount = targetEntryCount(entries, target.id);
    const enoughData = entryCount >= MIN_SAMPLE_SIZE;
    const trend = targetTrend(entries, target.id, target.entryType);
    return {
      target,
      correlations,
      entryCount,
      enoughData,
      trend,
      sense: getSense(id)!,
    };
  }, [ready, id, factorsFor, entriesFor, getSense]);

  if (!ready) return <Loading />;
  const sense = getSense(id);
  if (!sense || !model) {
    return (
      <main className="px-4">
        <AppHeader title="Insights" back="/" />
        <p className="py-16 text-center text-muted">Nothing to analyse yet.</p>
      </main>
    );
  }

  const narrative = headlineNarrative({
    sense,
    target: model.target,
    entryCount: model.entryCount,
    correlations: model.correlations,
    enoughData: model.enoughData,
  });

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

      {/* Headline narrative */}
      <Card className="mt-4 overflow-hidden">
        <div className="relative overflow-hidden bg-accent-soft px-5 py-4">
          <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-gradient-accent opacity-25 blur-3xl" />
          <div className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-ink">
            ✦ AI narrative
          </div>
          <p className="relative mt-1.5 text-[15px] leading-relaxed text-ink">{narrative}</p>
        </div>
        <p className="px-5 py-2 text-xs text-faint">
          Generated from {model.entryCount} entries · statistics computed on-device, prose written
          over the summary (no raw entries sent to a model).
        </p>
      </Card>

      {fitbitFactors.length > 0 && (
        <Card className="mt-4 flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              ⌚ Fitbit
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Pull the last 30 days into{" "}
              {fitbitFactors.map((f) => f.label).join(", ")}.
            </p>
            {syncMsg && (
              <p className={`mt-1 text-xs ${syncMsg.ok ? "text-positive" : "text-negative"}`}>
                {syncMsg.text}
              </p>
            )}
          </div>
          <Button className="shrink-0" disabled={syncing} onClick={syncFitbit}>
            {syncing ? "Syncing…" : "Sync Fitbit"}
          </Button>
        </Card>
      )}

      {!model.enoughData && (
        <Card className="mt-4 border-dashed p-4">
          <p className="text-sm font-semibold text-ink">Not enough data yet</p>
          <div className="mt-2 h-2 w-full rounded-full bg-raised">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${Math.min(100, (model.entryCount / MIN_SAMPLE_SIZE) * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            {model.entryCount} / {MIN_SAMPLE_SIZE} entries. Below this a correlation is mostly
            noise, so we won&apos;t show one — and neither will Chat.
          </p>
        </Card>
      )}

      {/* Trend */}
      {model.trend.length > 1 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold text-ink">{model.target.label} over time</h2>
          <Card className="p-4">
            <TrendChart data={model.trend} label={model.target.label} />
          </Card>
        </section>
      )}

      {/* Correlations */}
      {model.enoughData && (
        <section className="mt-6">
          <h2 className="mb-1 text-sm font-bold text-ink">
            What moves with {model.target.label.toLowerCase()}
          </h2>
          <p className="mb-3 text-xs text-faint">
            <span className="text-positive">Green</span> = goes with lower{" "}
            {model.target.label.toLowerCase()}, <span className="text-negative">red</span> = higher.
          </p>
          <Card className="p-4">
            <CorrelationBars correlations={model.correlations} targetLabel={model.target.label} />
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
    </main>
  );
}
