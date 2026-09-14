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
import { getAutoSpeak, setAutoSpeak, speak, stopSpeaking, ttsSupported } from "@/lib/speak";
import { UpgradeModal } from "@/components/plans";
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
  const { ready, getSense, factorsFor, entriesFor, isPlus } = useStore();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [autoSpeak, setAuto] = useState(false);
  const [upsell, setUpsell] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toBottom = () =>
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }));

  useEffect(() => {
    setAuto(getAutoSpeak());
    return () => stopSpeaking(); // stop reading aloud when leaving Chat
  }, []);

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

  if (!isPlus) {
    return (
      <main className="px-4">
        <AppHeader title={`Chat · ${sense.title}`} back="/" />
        <div className="px-1 py-12">
          <div className="mx-auto max-w-sm rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-2xl">
              ✦
            </div>
            <p className="text-lg font-extrabold text-ink">Chat is a Plus feature</p>
            <p className="mt-1 text-sm text-muted">
              Ask questions about your data in plain language and get AI answers grounded in your own
              patterns. Upgrade to Plus to unlock chat, AI insights, integrations and more.
            </p>
            <button
              onClick={() => setUpsell(true)}
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-gradient-accent px-4 py-2.5 text-sm font-semibold text-white shadow-glow"
            >
              See Plus
            </button>
          </div>
        </div>
        <UpgradeModal
          open={upsell}
          onClose={() => setUpsell(false)}
          reason="AI chat is part of MyLifeSense Plus."
        />
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
    if (autoSpeak) speak(answer);
  };

  const toggleAuto = () => {
    const next = !autoSpeak;
    setAuto(next);
    setAutoSpeak(next);
    if (!next) stopSpeaking();
  };

  return (
    <main className="flex h-screen flex-col">
      <AppHeader
        title={`Chat · ${sense.title}`}
        back="/"
        right={
          ttsSupported() ? (
            <button
              onClick={toggleAuto}
              aria-label={autoSpeak ? "Turn off spoken replies" : "Read replies aloud"}
              title={autoSpeak ? "Spoken replies on" : "Read replies aloud"}
              className={`grid h-9 w-9 place-items-center rounded-full transition ${
                autoSpeak ? "bg-gradient-accent text-white shadow-glow" : "text-muted hover:bg-raised hover:text-ink"
              }`}
            >
              {autoSpeak ? "🔊" : "🔇"}
            </button>
          ) : undefined
        }
      />

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
            <div className="max-w-[85%]">
              <div
                className={`whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-gradient-accent text-white shadow-glow"
                    : "glass border border-line text-ink"
                }`}
              >
                {m.text}
              </div>
              {m.role === "assistant" && ttsSupported() && (
                <button
                  onClick={() => speak(m.text)}
                  className="mt-1 text-xs text-faint transition hover:text-accent-ink"
                  aria-label="Read aloud"
                >
                  🔊 Read aloud
                </button>
              )}
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
