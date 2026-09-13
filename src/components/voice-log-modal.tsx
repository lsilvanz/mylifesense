"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";
import { parseLog } from "@/lib/ai";
import { speak, stopSpeaking, ttsSupported } from "@/lib/speak";
import { formatValue } from "@/lib/entryTypes";
import { useStore } from "@/lib/store";
import type { EntryValueData, SenseFactor } from "@/lib/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Phase = "idle" | "recording" | "interpreting" | "confirm" | "empty" | "saved" | "unsupported";

function summaryPairs(map: Record<string, EntryValueData>, factors: SenseFactor[]) {
  return Object.entries(map)
    .map(([fid, v]) => {
      const f = factors.find((x) => x.id === fid);
      if (!f) return null;
      return { label: f.label, text: formatValue(f.entryType, v, f.config.unit) };
    })
    .filter(Boolean) as { label: string; text: string }[];
}

function MicIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z" />
      <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21a1 1 0 1 0 2 0v-3.08A7 7 0 0 0 19 11z" />
    </svg>
  );
}

export function VoiceLogModal({ senseId, onClose }: { senseId: string; onClose: () => void }) {
  const { getSense, factorsFor, addEntry } = useStore();
  const sense = getSense(senseId);
  const factors = factorsFor(senseId);

  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [values, setValues] = useState<Record<string, EntryValueData>>({});
  const [elapsed, setElapsed] = useState(0);
  const recRef = useRef<any>(null);
  const finalRef = useRef("");
  const timerRef = useRef<any>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setPhase("unsupported");
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
    setValues({});
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
    setTimeout(async () => {
      const text = (finalRef.current || transcript).trim();
      if (!text) {
        setPhase("empty");
        return;
      }
      const map = await parseLog(text, factors);
      if (!map || Object.keys(map).length === 0) {
        setPhase("empty");
        if (ttsSupported()) speak("I didn't catch anything to log. Try again.");
        return;
      }
      setValues(map);
      setPhase("confirm");
      if (ttsSupported()) {
        const spoken = summaryPairs(map, factors)
          .map((p) => `${p.label}, ${p.text}`)
          .join("; ");
        speak(`Do you want to log ${spoken} now?`);
      }
    }, 500);
  };

  const save = () => {
    const entryValues = Object.entries(values).map(([factorId, value]) => ({ factorId, value }));
    if (entryValues.length) addEntry(senseId, entryValues);
    if (ttsSupported()) speak("Saved.");
    setPhase("saved");
    setTimeout(onClose, 900);
  };

  const pairs = summaryPairs(values, factors);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-5 shadow-card">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">
            Voice log{sense ? ` · ${sense.title}` : ""}
          </p>
          <button onClick={onClose} className="text-sm text-faint hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        {phase === "unsupported" ? (
          <p className="py-8 text-center text-sm text-muted">
            Voice capture isn&apos;t supported in this browser. Try Chrome, or use the Log screen to
            type.
          </p>
        ) : phase === "confirm" ? (
          <div className="py-2">
            <p className="text-sm text-muted">Log this now?</p>
            <ul className="mt-2 space-y-1">
              {pairs.map((p) => (
                <li key={p.label} className="flex items-center justify-between rounded-lg bg-raised px-3 py-2 text-sm">
                  <span className="text-muted">{p.label}</span>
                  <span className="font-semibold text-ink">{p.text}</span>
                </li>
              ))}
            </ul>
            {transcript && <p className="mt-2 text-xs italic text-faint">“{transcript}”</p>}
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPhase("idle")}>
                Redo
              </Button>
              <Button className="flex-1" onClick={save}>
                Save now
              </Button>
            </div>
          </div>
        ) : phase === "saved" ? (
          <p className="py-10 text-center text-lg font-semibold text-positive">Saved ✓</p>
        ) : (
          <div className="flex flex-col items-center py-6">
            <button
              onPointerDown={start}
              onPointerUp={stop}
              onPointerCancel={stop}
              disabled={phase === "interpreting"}
              style={{ touchAction: "none" }}
              className={`grid h-24 w-24 select-none place-items-center rounded-full text-white transition ${
                phase === "recording"
                  ? "scale-110 bg-negative shadow-glow"
                  : "bg-gradient-accent shadow-glow active:scale-95"
              } ${phase === "recording" ? "animate-pulse" : ""}`}
            >
              <MicIcon className="h-10 w-10" />
            </button>
            <p className="mt-4 text-sm font-medium text-ink">
              {phase === "recording"
                ? `Listening… ${elapsed}s — release to log`
                : phase === "interpreting"
                ? "Interpreting…"
                : phase === "empty"
                ? "Didn't catch that — hold and try again"
                : "Hold to talk"}
            </p>
            <p className="mt-1 max-w-[15rem] text-center text-xs text-faint">
              e.g. “pain was a 6, two coffees, exercised this morning, slept badly”
            </p>
            {phase === "recording" && transcript && (
              <p className="mt-2 max-w-[16rem] text-center text-xs italic text-muted">{transcript}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
