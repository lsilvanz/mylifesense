"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef, useState } from "react";
import { AppHeader, Loading, Pill } from "@/components/ui";
import { MIN_SAMPLE_SIZE, computeCorrelations, targetEntryCount } from "@/lib/stats";
import { SUGGESTED_QUESTIONS, answerQuestion, type StatsSummary } from "@/lib/narrative";
import { useStore } from "@/lib/store";

interface Msg {
  role: "user" | "assistant";
  text: string;
}

export default function ChatPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ChatInner />
    </Suspense>
  );
}

function ChatInner() {
  const id = useSearchParams().get("sense") ?? "";
  const { ready, getSense, factorsFor, entriesFor } = useStore();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const summary = useMemo<StatsSummary | null>(() => {
    if (!ready) return null;
    const sense = getSense(id);
    if (!sense) return null;
    const factors = factorsFor(id);
    const entries = entriesFor(id);
    const target = factors.find((f) => f.isTarget) ?? factors[0];
    if (!target) return null;
    const correlations = computeCorrelations(factors, entries, target.id);
    const entryCount = targetEntryCount(entries, target.id);
    return { sense, target, correlations, entryCount, enoughData: entryCount >= MIN_SAMPLE_SIZE };
  }, [ready, id, getSense, factorsFor, entriesFor]);

  if (!ready) return <Loading />;
  const sense = getSense(id);
  if (!sense || !summary) {
    return (
      <main className="px-4">
        <AppHeader title="Chat" back="/" />
        <p className="py-16 text-center text-muted">Nothing to talk about yet.</p>
      </main>
    );
  }

  const ask = (q: string) => {
    const question = q.trim();
    if (!question) return;
    const answer = answerQuestion(question, summary);
    setMessages((prev) => [...prev, { role: "user", text: question }, { role: "assistant", text: answer }]);
    setDraft("");
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }));
  };

  return (
    <main className="flex h-screen flex-col">
      <AppHeader title={`Chat · ${sense.title}`} back="/" />

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="rounded-2xl border border-line bg-surface p-5 text-sm leading-relaxed text-muted">
            <p className="font-semibold text-ink">Ask about {sense.title.toLowerCase()}.</p>
            <p className="mt-1">
              I answer only from your logged data and the computed correlations — and I won&apos;t
              claim a pattern below {MIN_SAMPLE_SIZE} entries.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-gradient-accent text-white shadow-glow"
                  : "glass border border-line text-ink"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-line bg-ground/90 px-4 py-3 backdrop-blur">
        {messages.length === 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <Pill key={q} onClick={() => ask(q)}>
                {q}
              </Pill>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
          className="flex items-center gap-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask a question…"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-accent text-white shadow-glow transition disabled:opacity-40 disabled:shadow-none"
            aria-label="Send"
          >
            ↑
          </button>
        </form>
      </div>
    </main>
  );
}
