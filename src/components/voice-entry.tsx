"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card } from "./ui";
import { parseLog } from "@/lib/ai";
import type { EntryValueData, SenseFactor } from "@/lib/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function VoiceEntry({
  factors,
  onValues,
  autoStart = false,
}: {
  factors: SenseFactor[];
  onValues: (values: Record<string, EntryValueData>) => void;
  autoStart?: boolean;
}) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [supported, setSupported] = useState(false);
  const recRef = useRef<any>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (e: any) => {
      let finalT = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalT += e.results[i][0].transcript;
      }
      if (finalT) setText((prev) => (prev ? prev + " " : "") + finalT.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    // Best-effort auto-start when opened via the Home "speak" shortcut.
    if (autoStart) {
      setTimeout(() => {
        try {
          rec.start();
          setListening(true);
        } catch {
          /* needs a tap — user can press Speak */
        }
      }, 400);
    }
    return () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    };
  }, [autoStart]);

  const toggle = () => {
    const rec = recRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
    } else {
      try {
        rec.start();
        setListening(true);
        setMsg(null);
      } catch {
        /* already started */
      }
    }
  };

  const interpret = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setMsg(null);
    const map = await parseLog(text.trim(), factors);
    setBusy(false);
    if (!map) {
      setMsg({ ok: false, text: "Couldn't interpret that (AI may not be set up on this deployment)." });
      return;
    }
    const n = Object.keys(map).length;
    if (n === 0) {
      setMsg({ ok: false, text: "I didn't catch any factor values — try naming them, e.g. 'pain was a 6'." });
      return;
    }
    onValues(map);
    setMsg({ ok: true, text: `Filled ${n} factor${n === 1 ? "" : "s"} below — review and save.` });
  };

  return (
    <Card className="overflow-hidden">
      <div className="relative overflow-hidden bg-accent-soft px-4 py-3.5">
        <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gradient-accent opacity-25 blur-2xl" />
        <p className="relative text-sm font-semibold text-ink">✦ Log by voice or text</p>
        <p className="relative mt-0.5 text-xs text-muted">
          Describe your day in your own words — Claude fills the factors below to review.
        </p>
      </div>
      <div className="p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="e.g. Evening pain was about a 6, had two coffees, exercised this morning, slept badly."
          className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
        <div className="mt-2 flex items-center gap-2">
          {supported && (
            <Button variant={listening ? "primary" : "outline"} className="text-sm" onClick={toggle}>
              {listening ? "● Stop" : "🎤 Speak"}
            </Button>
          )}
          <Button className="text-sm" disabled={busy || !text.trim()} onClick={interpret}>
            {busy ? "Interpreting…" : "Interpret"}
          </Button>
          {text && (
            <button
              onClick={() => {
                setText("");
                setMsg(null);
              }}
              className="ml-auto text-xs text-faint transition hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>
        {listening && <p className="mt-2 text-xs text-accent-ink">Listening… speak, then tap Stop.</p>}
        {msg && (
          <p className={`mt-2 text-xs ${msg.ok ? "text-positive" : "text-negative"}`}>{msg.text}</p>
        )}
        {!supported && (
          <p className="mt-2 text-[11px] text-faint">
            Voice capture isn&apos;t supported in this browser — type above instead.
          </p>
        )}
      </div>
    </Card>
  );
}
