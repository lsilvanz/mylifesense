"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { Button, Card, LinkButton, Loading, Wordmark, EmptyState } from "@/components/ui";
import { categoryEmoji } from "@/lib/entryTypes";
import type { Sense } from "@/lib/types";

const FREQUENCY_LABEL: Record<string, string> = {
  daily: "Daily",
  few_per_week: "A few times a week",
  weekly: "Weekly",
};

export default function HomePage() {
  const { ready, senses, factorsFor, entriesFor, resetDemo, initError } = useStore();
  if (!ready) return <Loading />;

  const [featured, ...rest] = senses;

  return (
    <main className="px-4 pb-24">
      <div className="flex items-center justify-between py-4">
        <Wordmark />
        <Link
          href="/about"
          className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium text-muted transition hover:text-ink"
        >
          About me
        </Link>
      </div>

      <p className="mb-5 text-[15px] leading-relaxed text-muted">
        Track the things you want to understand about yourself — and let the patterns surface.
      </p>

      {initError && (
        <div className="mb-4 rounded-xl border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-negative">
          Couldn&apos;t reach the database: {initError}. Check that the schema is applied and
          anonymous sign-ins are enabled.
        </div>
      )}

      {senses.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            emoji="🔍"
            title="No Senses yet"
            body="A Sense is something you want to understand. Create your first one to start."
          />
          <Button variant="outline" className="w-full" onClick={resetDemo}>
            Load demo data
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {featured && (
            <FeaturedCard
              sense={featured}
              factorCount={factorsFor(featured.id).length}
              entryCount={entriesFor(featured.id).length}
              targetLabel={factorsFor(featured.id).find((f) => f.isTarget)?.label}
            />
          )}
          {rest.map((s) => (
            <CompactCard
              key={s.id}
              sense={s}
              factorCount={factorsFor(s.id).length}
              entryCount={entriesFor(s.id).length}
            />
          ))}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-2xl border-t border-line bg-ground/90 px-4 py-3 backdrop-blur">
        <LinkButton href="/sense/new" className="w-full">
          + New Sense
        </LinkButton>
      </div>
    </main>
  );
}

function FeaturedCard({
  sense,
  factorCount,
  entryCount,
  targetLabel,
}: {
  sense: Sense;
  factorCount: number;
  entryCount: number;
  targetLabel?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="relative overflow-hidden bg-accent-soft px-5 py-5">
        <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-gradient-accent opacity-30 blur-3xl" />
        <Link
          href={`/sense/settings?sense=${sense.id}`}
          aria-label="Manage Sense"
          className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full text-accent-ink transition hover:bg-raised"
        >
          ⚙
        </Link>
        <div className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-ink">
          <span className="h-1.5 w-1.5 rounded-full bg-gradient-accent" /> Active Sense
        </div>
        <h2 className="relative mt-1.5 text-2xl font-extrabold tracking-tight text-ink">
          {sense.title}
        </h2>
        <p className="relative mt-1 text-sm text-muted">{sense.question}</p>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 px-5 pt-3 text-xs text-faint">
        <span>{factorCount} factors</span>
        <span>{entryCount} entries</span>
        <span>{FREQUENCY_LABEL[sense.frequency]}</span>
        {targetLabel && <span>Tracking: {targetLabel}</span>}
      </div>
      <div className="grid grid-cols-3 gap-2 p-4 pt-3">
        <LinkButton href={`/log?sense=${sense.id}`} variant="primary">
          Log
        </LinkButton>
        <LinkButton href={`/insights?sense=${sense.id}`} variant="soft">
          Insights
        </LinkButton>
        <LinkButton href={`/chat?sense=${sense.id}`} variant="outline">
          Chat
        </LinkButton>
      </div>
    </Card>
  );
}

function CompactCard({
  sense,
  factorCount,
  entryCount,
}: {
  sense: Sense;
  factorCount: number;
  entryCount: number;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold text-ink">{sense.title}</h3>
          <p className="truncate text-sm text-muted">{sense.question}</p>
          <p className="mt-1 text-xs text-faint">
            {factorCount} factors · {entryCount} entries
          </p>
        </div>
        <Link
          href={`/sense/settings?sense=${sense.id}`}
          aria-label="Manage Sense"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-faint transition hover:bg-raised hover:text-ink"
        >
          ⚙
        </Link>
      </div>
      <div className="mt-3 flex gap-2">
        <LinkButton href={`/log?sense=${sense.id}`} variant="soft" className="flex-1">
          Log
        </LinkButton>
        <LinkButton href={`/insights?sense=${sense.id}`} variant="ghost">
          Insights
        </LinkButton>
        <LinkButton href={`/chat?sense=${sense.id}`} variant="ghost">
          Chat
        </LinkButton>
      </div>
    </Card>
  );
}
