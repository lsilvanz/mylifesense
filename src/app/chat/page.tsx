"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AppHeader, Loading, Pill } from "@/components/ui";
import { MIN_SAMPLE_SIZE } from "@/lib/stats";
import { analyzeSense, type Analysis, type IntegrationOverlay } from "@/lib/insights";
import { SUGGESTED_QUESTIONS, answerQuestion } from "@/lib/narrative";
import { askClaudeChat } from "@/lib/ai";
import { combinedContextForAI } from "@/lib/context";
import { fetchIntegrationData, isConnected } from "@/lib/fitbit";
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
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toBottom = () =>
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }));

  const [overlay, setOverlay] = useState<IntegrationOverlay | null>(null);

  // Fold live Fitbit data into the analysis (in memory only).
  useEffect(() => {
    if (!ready || !getSense(id)) return;
    const factors = factorsFor(id);
    const hasFitbit = factors.some(
      (f) => f.entryType === "integration" && (f.config.provider ?? "").toLowerCase() === "fitbit"
    );
    if (!hasFitbit || !isConnected()) {
      setOverlay(null);
      return;
    }
    let cancelled = false;
    fetchIntegrationData(factors).then((o) => !cancelled && setOverlay(o));
    return () => {
      cancelled = true;
    };
  }, [ready, id, getSense, factorsFor]);

  const analysis = useMemo<Analysis | null>(() => {
    if (!ready) return null;
    if (!getSense(id)) return null;
    return analyzeSense(factorsFor(id), entriesFor(id), overlay ?? undefined);
  }, [ready, id, getSense, factorsFor, entriesFor, overlay]);

  if (!ready) return <Loading />;
  const sense = getSense(id);
  if (!sense || !analysis) {
    return (
      <main className="px-4">
        <AppHeader title="Chat" back="/" />
        <p className="py-16 text-center text-muted">Nothing to talk about yet.</p>
      </main>
    );
  }

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || thinking) return;
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setDraft("");
    setThinking(true);
    toBottom();
    // Try the real Claude endpoint; fall back to the deterministic layer when
    // AI isn't configured (e.g. local dev, or no API key set in production).
    const ai = await askClaudeChat(analysis, question, combinedContextForAI(id));
    const answer = ai ?? answerQuestion(question, analysis);
    setMessages((prev) => [...prev, { role: "assistant", text: answer }]);
    setThinking(false);
    toBottom();
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
              className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-gradient-accent text-white shadow-glow"
                  : "glass border border-line text-ink"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="glass rounded-2xl border border-line px-4 py-3 text-sm text-muted">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.1s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
              </span>
            </div>
          </div>
        )}
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
