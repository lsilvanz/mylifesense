"use client";

import Link from "next/link";
import { AppHeader, Card, LinkButton, Loading } from "@/components/ui";
import { useStore } from "@/lib/store";

const FREQUENCY_LABEL: Record<string, string> = {
  daily: "Daily",
  few_per_week: "A few / week",
  weekly: "Weekly",
};

export default function ManageSensesPage() {
  const { ready, senses, factorsFor, entriesFor, focusedSenseId, setFocusedSense, archiveSense } =
    useStore();

  if (!ready) return <Loading />;

  const focused = senses.find((s) => s.id === focusedSenseId) ?? senses[0];

  return (
    <main className="px-4 pb-28">
      <AppHeader title="Your Senses" back="/" />

      <p className="mt-4 text-sm text-muted">
        Pick the Sense to keep <strong className="text-ink">in focus</strong> on your home screen,
        or jump into any of them.
      </p>

      <div className="mt-4 space-y-3">
        {senses.map((s) => {
          const isFocus = focused?.id === s.id;
          return (
            <Card key={s.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-lg font-bold text-ink">{s.title}</h2>
                    {isFocus && (
                      <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-ink">
                        In focus
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm text-muted">{s.question}</p>
                  <p className="mt-1 text-xs text-faint">
                    {factorsFor(s.id).length} factors · {entriesFor(s.id).length} entries ·{" "}
                    {FREQUENCY_LABEL[s.frequency]}
                  </p>
                </div>
                <button
                  onClick={() => setFocusedSense(s.id)}
                  aria-label={isFocus ? "In focus" : "Set as focus"}
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg transition ${
                    isFocus
                      ? "bg-gradient-accent text-white shadow-glow"
                      : "border border-line bg-surface text-faint hover:text-accent-ink"
                  }`}
                >
                  {isFocus ? "★" : "☆"}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <LinkButton href={`/insights?sense=${s.id}`} variant="soft" className="text-sm">
                  Insights
                </LinkButton>
                <LinkButton href={`/log?sense=${s.id}`} variant="outline" className="text-sm">
                  Log
                </LinkButton>
                <LinkButton href={`/sense/entries?sense=${s.id}`} variant="ghost" className="text-sm">
                  Entries
                </LinkButton>
                <LinkButton href={`/sense/settings?sense=${s.id}`} variant="ghost" className="text-sm">
                  Manage
                </LinkButton>
                <button
                  onClick={() => {
                    if (confirm(`Archive "${s.title}"? It will be hidden from your lists.`)) {
                      archiveSense(s.id);
                    }
                  }}
                  className="ml-auto rounded-xl px-3 py-2 text-sm font-medium text-faint transition hover:text-negative"
                >
                  Archive
                </button>
              </div>
            </Card>
          );
        })}

        {senses.length === 0 && (
          <p className="py-10 text-center text-sm text-muted">No Senses yet.</p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-2xl border-t border-line bg-ground/90 px-4 py-3 backdrop-blur">
        <Link
          href="/sense/new"
          className="flex w-full items-center justify-center rounded-xl bg-gradient-accent px-4 py-2.5 text-sm font-semibold text-white shadow-glow"
        >
          + New Sense
        </Link>
      </div>
    </main>
  );
}
