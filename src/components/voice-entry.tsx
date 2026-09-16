"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";
import { parseLog } from "@/lib/ai";
import { speak, stopSpeaking, ttsSupported } from "@/lib/speak";
import { formatValue } from "@/lib/entryTypes";
import type { EntryValueData, SenseFactor } from "@/lib/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Phase = "idle" | "recording" | "interpreting" | "empty" | "filled" | "unsupported";

function MicIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z" />
      <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21a1 1 0 1 0 2 0v-3.08A7 7 0 0 0 19 11z" />
    </svg>
  );
}

// Hold-to-talk voice logging for the Log page — the same press-and-hold gesture
// as the home cards, but instead of saving it fills the factors below for review.
export function VoiceEntry({
  factors,
  onResult,
}: {
  factors: SenseFactor[];
  onResult: (values: Record<string, EntryValueData>, times: Record<string, string>) => void;
  autoStart?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [filledCount, setFilledCount] = useState(0);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const recRef = useRef<any>(null);
  const finalRef = useRef("");
  const timerRef = useRef<any>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setPhase("unsupported");
      setTyping(true);
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalRef.current += t + " ";
        else interim += t;
      }
      setTranscript((finalRef.current + interim).trim());
    };
    recRef.current = rec;
    return () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      stopSpeaking();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const interpret = async (raw: string) => {
    const t = raw.trim();
    if (!t) {
      setPhase("empty");
      return;
    }
    const parsed = await parseLog(t, factors);
    if (!parsed || Object.keys(parsed.values).length === 0) {
      setPhase("empty");
      if (ttsSupported()) speak("I didn't catch anything to log. Try again.");
      return;
    }
    onResult(parsed.values, parsed.times);
    const n = Object.keys(parsed.values).length;
    setFilledCount(n);
    setPhase("filled");
    if (ttsSupported()) {
      const spoken = Object.entries(parsed.values)
        .map(([fid, v]) => {
          const f = factors.find((x) => x.id === fid);
          if (!f) return "";
          const t = parsed.times[fid]
            ? ` at ${new Date(parsed.times[fid]).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}`
            : "";
          return `${f.label}, ${formatValue(f.entryType, v, f.config.unit)}${t}`;
        })
        .filter(Boolean)
        .join("; ");
      speak(`Filled ${spoken}. Review and save below.`);
    }
  };

  const start = (e: React.PointerEvent) => {
    if (phase === "recording" || phase === "interpreting" || !recRef.current) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    stopSpeaking();
    finalRef.current = "";
    setTranscript("");
    try {
      recRef.current.start();
      setPhase("recording");
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      /* already started */
    }
  };

  const stop = () => {
    if (phase !== "recording") return;
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      recRef.current.stop();
    } catch {
      /* ignore */
    }
    setPhase("interpreting");
    // Give recognition a beat to flush final results, then interpret.
    setTimeout(() => interpret(finalRef.current || transcript), 500);
  };

  const interpretTyped = async () => {
    if (!text.trim()) return;
    setBusy(true);
    await interpret(text);
    setBusy(false);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="relative overflow-hidden bg-accent-soft px-4 py-3.5">
        <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gradient-accent opacity-25 blur-2xl" />
        <p className="relative text-sm font-semibold text-ink">✦ Log by voice</p>
        <p className="relative mt-0.5 text-xs text-muted">
          Hold the mic and describe your day — Claude fills the factors below to review.
        </p>
      </div>

      {phase !== "unsupported" && (
        <div className="flex flex-col items-center px-4 py-5">
          <button
            onPointerDown={start}
            onPointerUp={stop}
            onPointerCancel={stop}
            disabled={phase === "interpreting"}
            style={{ touchAction: "none" }}
            aria-label="Hold to talk"
            className={`grid h-16 w-16 select-none place-items-center rounded-full text-white transition ${
              phase === "recording"
                ? "scale-110 animate-pulse bg-negative shadow-glow"
                : "bg-gradient-accent shadow-glow active:scale-95"
            }`}
          >
            <MicIcon className="h-7 w-7" />
          </button>
          <p className="mt-3 text-sm font-medium text-ink">
            {phase === "recording"
              ? `Listening… ${elapsed}s — release to fill`
              : phase === "interpreting"
              ? "Interpreting…"
              : phase === "filled"
              ? `Filled ${filledCount} factor${filledCount === 1 ? "" : "s"} below — review & save`
              : phase === "empty"
              ? "Didn't catch that — hold and try again"
              : "Hold to talk"}
          </p>
          {phase === "recording" && transcript && (
            <p className="mt-2 max-w-[18rem] text-center text-xs italic text-muted">{transcript}</p>
          )}
          {phase !== "recording" && (
            <button
              onClick={() => setTyping((v) => !v)}
              className="mt-2 text-xs font-medium text-accent-ink underline underline-offset-2"
            >
              {typing ? "Hide typing" : "Type instead"}
            </button>
          )}
        </div>
      )}

      {(typing || phase === "unsupported") && (
        <div className="border-t border-line p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="e.g. pain was about a 6, two coffees, exercised this morning, slept badly"
            className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button className="text-sm" disabled={busy || !text.trim()} onClick={interpretTyped}>
              {busy ? "Interpreting…" : "Interpret"}
            </Button>
            {text && (
              <button
                onClick={() => setText("")}
                className="ml-auto text-xs text-faint transition hover:text-ink"
              >
                Clear
              </button>
            )}
          </div>
          {phase === "unsupported" && (
            <p className="mt-2 text-[11px] text-faint">
              Voice capture isn&apos;t supported in this browser — type above instead.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
