"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppHeader, Button, Card, Pill } from "@/components/ui";
import { CATEGORIES, ENTRY_TYPES, categoryEmoji } from "@/lib/entryTypes";
import { suggestFactors } from "@/lib/ai";
import { combinedContextForAI, getContext, setContext, ME_ID } from "@/lib/context";
import { isConnected as fitbitConnected } from "@/lib/fitbit";
import { useStore } from "@/lib/store";
import type { EntryType, FactorCategory, FactorConfig, Frequency } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * A friendly, guided way to create a Sense.
 * Topic → About you → What might matter (AI) → Sources → Ready.
 * The technical bits (entry types, categories, targets) are chosen for
 * the user and only revealed behind an "Adjust" toggle.
 * ------------------------------------------------------------------ */

interface DraftFactor {
  key: string;
  label: string;
  category: FactorCategory;
  entryType: EntryType;
  options: string[]; // list
  multiple: boolean; // list
  unit: string; // number
  isTarget: boolean;
  goalDirection: "minimize" | "maximize";
  controllable?: boolean;
  on: boolean;
  origin: "ai" | "starter" | "custom";
}

let keyCounter = 0;
const nextKey = () => `d${keyCounter++}`;

// Plain-language "how you'll log it" so no one sees entry-type jargon.
function loggedAsHint(f: { entryType: EntryType; unit?: string }): string {
  switch (f.entryType) {
    case "yes_no":
      return "a quick Yes / No";
    case "scale_0_10":
      return "a 0–10 rating";
    case "low_med_high":
      return "Low · Medium · High";
    case "number":
      return f.unit ? `a number (${f.unit})` : "a number";
    case "list":
      return "pick from a list";
    case "free_text":
      return "a short note";
    case "integration":
      return "synced from a device";
    default:
      return "a quick entry";
  }
}

interface Seed {
  label: string;
  category: FactorCategory;
  entryType: EntryType;
  isTarget?: boolean;
  goalDirection?: "minimize" | "maximize";
  unit?: string;
  controllable?: boolean;
}

const seedToDraft = (s: Seed, origin: DraftFactor["origin"]): DraftFactor => ({
  key: nextKey(),
  label: s.label,
  category: s.category,
  entryType: s.entryType,
  options: [],
  multiple: false,
  unit: s.unit ?? "",
  isTarget: s.isTarget ?? false,
  goalDirection: s.goalDirection ?? "minimize",
  controllable: s.controllable,
  on: true,
  origin,
});

const STARTERS: { key: string; emoji: string; title: string; question: string }[] = [
  { key: "sleep", emoji: "🌙", title: "My sleep", question: "What helps me sleep well — and what wrecks it?" },
  { key: "energy", emoji: "⚡", title: "My energy", question: "What makes my energy crash or soar during the day?" },
  { key: "symptom", emoji: "🩺", title: "A symptom", question: "What makes this symptom better or worse?" },
  { key: "focus", emoji: "🎯", title: "My focus", question: "What helps me focus — and what breaks it?" },
  { key: "mood", emoji: "🙂", title: "My mood", question: "What lifts or lowers my mood?" },
  { key: "fitness", emoji: "🏃", title: "My workouts", question: "What drives how good my workouts feel?" },
];

const FALLBACK: Record<string, Seed[]> = {
  sleep: [
    { label: "Sleep quality", category: "Sleep", entryType: "low_med_high", isTarget: true, goalDirection: "maximize" },
    { label: "Caffeine after noon", category: "Food", entryType: "yes_no", controllable: true },
    { label: "Screen time before bed", category: "Environment", entryType: "low_med_high", controllable: true },
    { label: "Exercised today", category: "Exercise", entryType: "yes_no", controllable: true },
    { label: "Stress level", category: "Mood", entryType: "scale_0_10" },
    { label: "Alcohol", category: "Food", entryType: "yes_no", controllable: true },
  ],
  energy: [
    { label: "Energy level", category: "Mood", entryType: "scale_0_10", isTarget: true, goalDirection: "maximize" },
    { label: "Hours slept", category: "Sleep", entryType: "number", unit: "hours" },
    { label: "Caffeine", category: "Food", entryType: "number", unit: "cups", controllable: true },
    { label: "Skipped a meal", category: "Food", entryType: "yes_no", controllable: true },
    { label: "Exercised today", category: "Exercise", entryType: "yes_no", controllable: true },
    { label: "Mood", category: "Mood", entryType: "low_med_high" },
  ],
  symptom: [
    { label: "Symptom severity", category: "Symptoms", entryType: "scale_0_10", isTarget: true, goalDirection: "minimize" },
    { label: "Ate a trigger food", category: "Food", entryType: "yes_no", controllable: true },
    { label: "Exercised today", category: "Exercise", entryType: "yes_no", controllable: true },
    { label: "Sleep quality", category: "Sleep", entryType: "low_med_high" },
    { label: "Stress level", category: "Mood", entryType: "scale_0_10" },
    { label: "Took medication", category: "Symptoms", entryType: "yes_no", controllable: true },
  ],
  focus: [
    { label: "Focus level", category: "Mood", entryType: "scale_0_10", isTarget: true, goalDirection: "maximize" },
    { label: "Sleep quality", category: "Sleep", entryType: "low_med_high" },
    { label: "Caffeine", category: "Food", entryType: "number", unit: "cups", controllable: true },
    { label: "Exercised today", category: "Exercise", entryType: "yes_no", controllable: true },
    { label: "Deep-work blocks", category: "Custom", entryType: "number", controllable: true },
    { label: "Distractions", category: "Environment", entryType: "low_med_high" },
  ],
  mood: [
    { label: "Mood", category: "Mood", entryType: "low_med_high", isTarget: true, goalDirection: "maximize" },
    { label: "Sleep quality", category: "Sleep", entryType: "low_med_high" },
    { label: "Exercised today", category: "Exercise", entryType: "yes_no", controllable: true },
    { label: "Time outdoors", category: "Environment", entryType: "low_med_high", controllable: true },
    { label: "Social time", category: "Custom", entryType: "yes_no", controllable: true },
    { label: "Stress level", category: "Mood", entryType: "scale_0_10" },
  ],
  fitness: [
    { label: "How the workout felt", category: "Exercise", entryType: "scale_0_10", isTarget: true, goalDirection: "maximize" },
    { label: "Hours slept", category: "Sleep", entryType: "number", unit: "hours" },
    { label: "Ate well", category: "Food", entryType: "yes_no", controllable: true },
    { label: "Rest day yesterday", category: "Exercise", entryType: "yes_no" },
    { label: "Soreness", category: "Symptoms", entryType: "low_med_high" },
    { label: "Hydration", category: "Food", entryType: "low_med_high", controllable: true },
  ],
};

function genericFallback(title: string): Seed[] {
  const t = title.trim() || "How today went";
  return [
    { label: t, category: "Custom", entryType: "scale_0_10", isTarget: true, goalDirection: "maximize" },
    { label: "Sleep quality", category: "Sleep", entryType: "low_med_high" },
    { label: "Exercised today", category: "Exercise", entryType: "yes_no", controllable: true },
    { label: "Mood", category: "Mood", entryType: "low_med_high" },
    { label: "Stress level", category: "Mood", entryType: "scale_0_10" },
    { label: "Caffeine", category: "Food", entryType: "number", unit: "cups", controllable: true },
  ];
}

const STEPS = ["Topic", "About you", "Factors", "Sources", "Ready"];

export default function NewSensePage() {
  const router = useRouter();
  const { createSense } = useStore();

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [starterKey, setStarterKey] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<Frequency>("daily");

  // Context (know the person + the sense)
  const [aboutMe, setAboutMe] = useState("");
  const [aboutSense, setAboutSense] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  // Sources
  const [docText, setDocText] = useState("");
  const [docNames, setDocNames] = useState<string[]>([]);
  const [fitOn, setFitOn] = useState(false);

  const [factors, setFactors] = useState<DraftFactor[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const aiLoadedFor = useRef<string | null>(null);

  // Prefill "About you" from the global profile so we build on what we know.
  useEffect(() => {
    setAboutMe(getContext(ME_ID));
    setFitOn(fitbitConnected());
  }, []);

  const pickStarter = (s: (typeof STARTERS)[number]) => {
    setStarterKey(s.key);
    setTitle(s.title);
    setQuestion(s.question);
  };

  // Load suggestions the first time we reach the Factors step for a given topic.
  useEffect(() => {
    if (step !== 2) return;
    const sig = `${title.trim()}::${question.trim()}`;
    if (aiLoadedFor.current === sig) return;
    aiLoadedFor.current = sig;

    // Seed instantly from a sensible starter set so the screen is never empty.
    const seeds = (starterKey && FALLBACK[starterKey]) || genericFallback(title);
    setFactors(seeds.map((s) => seedToDraft(s, "starter")));

    // Then enrich with AI (merges de-duped; never blocks the UI).
    void runAi(seeds.map((s) => s.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const runAi = async (existingLabels: string[]) => {
    setAiBusy(true);
    setAiMsg(null);
    const ctx = buildContextPreview();
    const suggestions = await suggestFactors(title.trim(), question.trim(), existingLabels, ctx);
    setAiBusy(false);
    if (!suggestions) {
      setAiMsg("Couldn't reach the assistant — here's a solid starter set you can tweak.");
      return;
    }
    setFactors((prev) => {
      const have = new Set(prev.map((f) => f.label.trim().toLowerCase()));
      const hasTarget = prev.some((f) => f.on && f.isTarget);
      const additions: DraftFactor[] = [];
      for (const s of suggestions) {
        const key = s.label.trim().toLowerCase();
        if (!key || have.has(key)) continue;
        have.add(key);
        let et: EntryType = s.entryType;
        if (et === "integration") et = "number"; // keep the friendly flow reliable
        additions.push({
          key: nextKey(),
          label: s.label,
          category: s.category,
          entryType: et,
          options: s.options ?? [],
          multiple: s.multiple ?? false,
          unit: s.unit ?? "",
          isTarget: false,
          goalDirection: s.goalDirection ?? "minimize",
          controllable: s.controllable,
          on: true,
          origin: "ai",
        });
      }
      // If the starter had no target, let the AI's target win.
      const combined = [...prev, ...additions];
      if (!hasTarget) {
        const aiTarget = suggestions.find((s) => s.isTarget);
        const match = aiTarget
          ? combined.find((f) => f.label.trim().toLowerCase() === aiTarget.label.trim().toLowerCase())
          : undefined;
        const t = match ?? combined[0];
        if (t) {
          for (const f of combined) f.isTarget = f === t;
          if (aiTarget?.goalDirection) t.goalDirection = aiTarget.goalDirection;
        }
      }
      return combined;
    });
  };

  const toggleOn = (key: string) =>
    setFactors((prev) => {
      const next = prev.map((f) => (f.key === key ? { ...f, on: !f.on } : f));
      // Don't leave the target switched off.
      const target = next.find((f) => f.isTarget);
      if (!target?.on) {
        const first = next.find((f) => f.on);
        if (first) next.forEach((f) => (f.isTarget = f.key === first.key));
      }
      return next;
    });

  const setTarget = (key: string) =>
    setFactors((prev) => prev.map((f) => ({ ...f, isTarget: f.key === key, on: f.key === key ? true : f.on })));

  const setGoal = (dir: "minimize" | "maximize") =>
    setFactors((prev) => prev.map((f) => (f.isTarget ? { ...f, goalDirection: dir } : f)));

  const updateFactor = (key: string, patch: Partial<DraftFactor>) =>
    setFactors((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const addCustom = (label: string) => {
    const clean = label.trim();
    if (!clean) return;
    setFactors((prev) => [...prev, seedToDraft({ label: clean, category: "Custom", entryType: "yes_no" }, "custom")]);
  };

  const buildContextPreview = () => {
    const parts: string[] = [];
    const me = (rememberMe ? aboutMe : getContext(ME_ID)).trim();
    if (me) parts.push(`About the person:\n${me}`);
    if (aboutSense.trim()) parts.push(`About this Sense:\n${aboutSense.trim()}`);
    if (docText.trim()) parts.push(`Attached notes:\n${docText.trim()}`);
    const joined = parts.join("\n\n");
    return joined ? joined.slice(0, 6000) : combinedContextForAI();
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const names: string[] = [];
    let text = "";
    for (const file of Array.from(files)) {
      names.push(file.name);
      try {
        text += `\n\n— ${file.name} —\n${await file.text()}`;
      } catch {
        /* ignore unreadable file */
      }
    }
    setDocNames((prev) => [...prev, ...names]);
    setDocText((prev) => (prev + text).slice(0, 8000));
  };

  const onFactors = factors.filter((f) => f.on && f.label.trim());
  const target = onFactors.find((f) => f.isTarget);

  const canTopic = title.trim().length > 0;
  const canFactors = onFactors.length >= 2 && !!target;

  const create = () => {
    const id = createSense({
      title: title.trim(),
      question: question.trim() || `What affects ${title.trim()}?`,
      frequency,
      factors: onFactors.map((f) => {
        const base: FactorConfig =
          f.entryType === "list"
            ? { options: f.options.filter(Boolean), multiple: f.multiple }
            : f.entryType === "number"
            ? { unit: f.unit.trim() || undefined }
            : {};
        const config: FactorConfig = { ...base };
        if (f.isTarget) config.goalDirection = f.goalDirection;
        if (typeof f.controllable === "boolean") config.controllable = f.controllable;
        return {
          label: f.label.trim(),
          category: f.category,
          entryType: f.entryType,
          isTarget: f.isTarget,
          config,
        };
      }),
    });

    // Persist context so the AI keeps understanding this person + Sense.
    if (rememberMe && aboutMe.trim() !== getContext(ME_ID).trim()) setContext(ME_ID, aboutMe);
    const senseCtx = [aboutSense.trim(), docText.trim() ? `Attached notes:\n${docText.trim()}` : ""]
      .filter(Boolean)
      .join("\n\n");
    if (senseCtx) setContext(id, senseCtx);

    router.push(`/log?sense=${id}`);
  };

  return (
    <main className="pb-28">
      <AppHeader title="New Sense" back="/" />
      <Stepper step={step} />

      <div className="px-4">
        {step === 0 && (
          <TopicStep
            title={title}
            question={question}
            starterKey={starterKey}
            onPickStarter={pickStarter}
            onTitle={(t) => {
              setTitle(t);
              setStarterKey(null);
            }}
            onQuestion={setQuestion}
          />
        )}

        {step === 1 && (
          <AboutStep
            aboutMe={aboutMe}
            aboutSense={aboutSense}
            rememberMe={rememberMe}
            title={title}
            onAboutMe={setAboutMe}
            onAboutSense={setAboutSense}
            onRememberMe={setRememberMe}
          />
        )}

        {step === 2 && (
          <FactorsStep
            factors={factors}
            aiBusy={aiBusy}
            aiMsg={aiMsg}
            target={target}
            onToggle={toggleOn}
            onSetTarget={setTarget}
            onSetGoal={setGoal}
            onUpdate={updateFactor}
            onAddCustom={addCustom}
            onRetryAi={() => runAi(factors.map((f) => f.label))}
          />
        )}

        {step === 3 && (
          <SourcesStep
            docNames={docNames}
            fitOn={fitOn}
            onFiles={onFiles}
            onClearDocs={() => {
              setDocNames([]);
              setDocText("");
            }}
          />
        )}

        {step === 4 && (
          <ReadyStep
            title={title}
            question={question}
            frequency={frequency}
            onFrequency={setFrequency}
            factors={onFactors}
            target={target}
            docCount={docNames.length}
            fitOn={fitOn}
          />
        )}
      </div>

      {/* Footer nav */}
      <div className="fixed inset-x-0 bottom-0 mx-auto flex max-w-2xl gap-3 border-t border-line bg-ground/90 px-4 py-3 backdrop-blur">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button
            className="flex-1"
            disabled={step === 0 ? !canTopic : step === 2 ? !canFactors : false}
            onClick={() => setStep((s) => s + 1)}
          >
            {step === 1 ? "Find what matters →" : step === 2 ? "Continue" : "Continue"}
          </Button>
        ) : (
          <Button className="flex-1" onClick={create}>
            Create & log first entry
          </Button>
        )}
      </div>
    </main>
  );
}

/* ---------------------------------- Steps --------------------------------- */

function TopicStep({
  title,
  question,
  starterKey,
  onPickStarter,
  onTitle,
  onQuestion,
}: {
  title: string;
  question: string;
  starterKey: string | null;
  onPickStarter: (s: (typeof STARTERS)[number]) => void;
  onTitle: (t: string) => void;
  onQuestion: (q: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-ink">
          What do you want to understand about yourself?
        </h2>
        <p className="mt-1 text-sm text-muted">Pick a starting point — or write your own.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {STARTERS.map((s) => (
          <button
            key={s.key}
            onClick={() => onPickStarter(s)}
            className={`flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition ${
              starterKey === s.key
                ? "border-transparent bg-gradient-accent text-white shadow-glow"
                : "border-line bg-surface hover:border-line-strong hover:bg-raised"
            }`}
          >
            <span className="text-xl">{s.emoji}</span>
            <span className={`text-sm font-semibold ${starterKey === s.key ? "text-white" : "text-ink"}`}>
              {s.title}
            </span>
          </button>
        ))}
      </div>

      <Field label="Give it a name">
        <input
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="e.g. My sleep, My focus, Chest pain"
          className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-base outline-none focus:border-accent"
        />
      </Field>

      <Field label="In your own words, what are you trying to figure out?">
        <textarea
          value={question}
          onChange={(e) => onQuestion(e.target.value)}
          rows={3}
          placeholder="What helps my sleep — and what wrecks it?"
          className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-base outline-none focus:border-accent"
        />
        <p className="mt-1.5 text-xs text-faint">Optional — but it helps us suggest the right things to track.</p>
      </Field>
    </div>
  );
}

function AboutStep({
  aboutMe,
  aboutSense,
  rememberMe,
  title,
  onAboutMe,
  onAboutSense,
  onRememberMe,
}: {
  aboutMe: string;
  aboutSense: string;
  rememberMe: boolean;
  title: string;
  onAboutMe: (v: string) => void;
  onAboutSense: (v: string) => void;
  onRememberMe: (v: boolean) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-ink">A little about you</h2>
        <p className="mt-1 text-sm text-muted">
          The more we know, the better the suggestions and insights. All optional — and it stays on your device.
        </p>
      </div>

      <Field label="About you">
        <textarea
          value={aboutMe}
          onChange={(e) => onAboutMe(e.target.value)}
          rows={3}
          placeholder="e.g. 42, desk job, have GERD, training for a 10k, sleep is hit-and-miss."
          className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-base outline-none focus:border-accent"
        />
        <label className="mt-2 flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => onRememberMe(e.target.checked)}
            className="h-4 w-4 accent-[color:var(--accent)]"
          />
          Remember this for all my Senses
        </label>
      </Field>

      <Field label={`About “${title.trim() || "this"}” specifically`}>
        <textarea
          value={aboutSense}
          onChange={(e) => onAboutSense(e.target.value)}
          rows={3}
          placeholder="Anything relevant — when it started, what you've noticed, what you've tried."
          className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-base outline-none focus:border-accent"
        />
      </Field>
    </div>
  );
}

function FactorsStep({
  factors,
  aiBusy,
  aiMsg,
  target,
  onToggle,
  onSetTarget,
  onSetGoal,
  onUpdate,
  onAddCustom,
  onRetryAi,
}: {
  factors: DraftFactor[];
  aiBusy: boolean;
  aiMsg: string | null;
  target?: DraftFactor;
  onToggle: (key: string) => void;
  onSetTarget: (key: string) => void;
  onSetGoal: (dir: "minimize" | "maximize") => void;
  onUpdate: (key: string, patch: Partial<DraftFactor>) => void;
  onAddCustom: (label: string) => void;
  onRetryAi: () => void;
}) {
  const [custom, setCustom] = useState("");
  const onCount = factors.filter((f) => f.on).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-ink">What might matter?</h2>
        <p className="mt-1 text-sm text-muted">
          We picked a starting set. Keep what fits, switch off the rest, add your own.
        </p>
      </div>

      {/* The thing we're explaining */}
      {target && (
        <Card className="overflow-hidden">
          <div className="bg-accent-soft px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-ink">The thing you want to change</p>
            <p className="mt-1 text-base font-bold text-ink">{target.label}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Better is:</span>
              <Pill active={target.goalDirection === "minimize"} onClick={() => onSetGoal("minimize")}>
                ↓ Less
              </Pill>
              <Pill active={target.goalDirection === "maximize"} onClick={() => onSetGoal("maximize")}>
                ↑ More
              </Pill>
            </div>
          </div>
        </Card>
      )}

      {aiBusy && (
        <p className="flex items-center gap-2 text-sm text-accent-ink">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Looking for what usually matters…
        </p>
      )}
      {aiMsg && (
        <p className="text-xs text-faint">
          {aiMsg}{" "}
          <button onClick={onRetryAi} className="font-medium text-accent-ink underline underline-offset-2">
            Try again
          </button>
        </p>
      )}

      <div className="space-y-2">
        {factors.map((f) => (
          <FactorCard
            key={f.key}
            factor={f}
            isTarget={target?.key === f.key}
            onToggle={() => onToggle(f.key)}
            onSetTarget={() => onSetTarget(f.key)}
            onUpdate={(p) => onUpdate(f.key, p)}
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onAddCustom(custom);
              setCustom("");
            }
          }}
          placeholder="Add your own — e.g. Water, Meetings, Naps"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
        <Button
          variant="outline"
          onClick={() => {
            onAddCustom(custom);
            setCustom("");
          }}
          disabled={!custom.trim()}
        >
          Add
        </Button>
      </div>

      <p className="text-xs text-faint">
        {onCount} selected · tap ✎ on any to change how it&apos;s logged.
      </p>
    </div>
  );
}

function FactorCard({
  factor,
  isTarget,
  onToggle,
  onSetTarget,
  onUpdate,
}: {
  factor: DraftFactor;
  isTarget: boolean;
  onToggle: () => void;
  onSetTarget: () => void;
  onUpdate: (patch: Partial<DraftFactor>) => void;
}) {
  const [adjust, setAdjust] = useState(false);
  return (
    <Card className={`p-3 transition ${factor.on ? "" : "opacity-55"}`}>
      <div className="flex items-center gap-3">
        <button
          onClick={onToggle}
          aria-label={factor.on ? "Turn off" : "Turn on"}
          className={`relative h-6 w-10 shrink-0 rounded-full transition ${
            factor.on ? "bg-gradient-accent" : "bg-line"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              factor.on ? "left-[1.125rem]" : "left-0.5"
            }`}
          />
        </button>

        <div className="min-w-0 flex-1">
          <input
            value={factor.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            className="w-full truncate border-none bg-transparent p-0 text-sm font-semibold text-ink outline-none"
          />
          <p className="truncate text-xs text-faint">
            {categoryEmoji(factor.category)} logged as {loggedAsHint(factor)}
          </p>
        </div>

        {isTarget ? (
          <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-ink">
            ★ target
          </span>
        ) : (
          factor.on && (
            <button
              onClick={onSetTarget}
              className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-muted transition hover:text-ink"
            >
              set as goal
            </button>
          )
        )}
        <button
          onClick={() => setAdjust((a) => !a)}
          aria-label="Adjust"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-faint transition hover:bg-raised hover:text-ink"
        >
          ✎
        </button>
      </div>

      {adjust && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={factor.category}
              onChange={(e) => onUpdate({ category: e.target.value as FactorCategory })}
              className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent"
            >
              {CATEGORIES.map((c) => (
                <option key={c.category} value={c.category}>
                  {c.emoji} {c.category}
                </option>
              ))}
            </select>
            <select
              value={factor.entryType}
              onChange={(e) => onUpdate({ entryType: e.target.value as EntryType })}
              className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent"
            >
              {ENTRY_TYPES.filter((t) => t.type !== "integration").map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {factor.entryType === "list" && (
            <div className="space-y-2">
              <input
                value={factor.options.join(", ")}
                onChange={(e) => onUpdate({ options: e.target.value.split(",").map((o) => o.trim()) })}
                placeholder="Options, comma-separated: Sunny, Cloudy, Rain"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none focus:border-accent"
              />
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-faint">Selection:</span>
                <Pill active={!factor.multiple} onClick={() => onUpdate({ multiple: false })}>
                  Single
                </Pill>
                <Pill active={factor.multiple} onClick={() => onUpdate({ multiple: true })}>
                  Multiple
                </Pill>
              </div>
            </div>
          )}
          {factor.entryType === "number" && (
            <input
              value={factor.unit}
              onChange={(e) => onUpdate({ unit: e.target.value })}
              placeholder="Unit: cups, hours, mg…"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none focus:border-accent"
            />
          )}
        </div>
      )}
    </Card>
  );
}

function SourcesStep({
  docNames,
  fitOn,
  onFiles,
  onClearDocs,
}: {
  docNames: string[];
  fitOn: boolean;
  onFiles: (files: FileList | null) => void;
  onClearDocs: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-ink">Add anything that helps (optional)</h2>
        <p className="mt-1 text-sm text-muted">
          Give the assistant more to work with — notes, lab results, a device. You can always add these later.
        </p>
      </div>

      <Card className="p-4">
        <p className="text-sm font-semibold text-ink">📄 Documents & notes</p>
        <p className="mt-0.5 text-xs text-muted">
          Text files (.txt, .md, .csv, .json) get read in as background context. PDFs & images aren&apos;t supported yet.
        </p>
        <label className="mt-3 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-line bg-raised px-3 py-4 text-sm font-medium text-accent-ink transition hover:bg-accent-soft">
          <input
            type="file"
            multiple
            accept=".txt,.md,.csv,.json,.log,text/*"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          + Attach files
        </label>
        {docNames.length > 0 && (
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-muted">{docNames.join(", ")}</span>
            <button onClick={onClearDocs} className="text-faint hover:text-negative">
              Clear
            </button>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <p className="text-sm font-semibold text-ink">⌚ Devices & apps</p>
        <p className="mt-0.5 text-xs text-muted">
          Sync a service so a factor updates itself.
        </p>
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-raised p-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface text-lg">⌚</span>
          <div className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">Fitbit</span>
            <span className="block truncate text-xs text-faint">Steps &amp; resting heart rate</span>
          </div>
          {fitOn ? (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-ink">
              Connected
            </span>
          ) : (
            <Link
              href="/about"
              className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-accent-ink transition hover:bg-accent-soft"
            >
              Connect
            </Link>
          )}
        </div>
        <p className="mt-2 text-xs text-faint">
          Garmin, Apple Health, Oura and more are coming soon. Connecting opens the About page — you can finish this
          Sense first and connect after.
        </p>
      </Card>
    </div>
  );
}

function ReadyStep({
  title,
  question,
  frequency,
  onFrequency,
  factors,
  target,
  docCount,
  fitOn,
}: {
  title: string;
  question: string;
  frequency: Frequency;
  onFrequency: (f: Frequency) => void;
  factors: DraftFactor[];
  target?: DraftFactor;
  docCount: number;
  fitOn: boolean;
}) {
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="bg-gradient-accent px-5 py-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">You&apos;re all set</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight">{title}</h2>
          {question && <p className="mt-1 text-sm text-white/85">{question}</p>}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 px-5 py-3 text-xs text-faint">
          <span>{factors.length} factors</span>
          {target && <span>Tracking: {target.label}</span>}
          {docCount > 0 && <span>{docCount} document{docCount === 1 ? "" : "s"}</span>}
          {fitOn && <span>Fitbit connected</span>}
        </div>
      </Card>

      <Field label="How often will you check in?">
        <div className="flex flex-wrap gap-2">
          {(["daily", "few_per_week", "weekly"] as Frequency[]).map((fq) => (
            <Pill key={fq} active={frequency === fq} onClick={() => onFrequency(fq)}>
              {fq === "daily" ? "Daily" : fq === "few_per_week" ? "A few / week" : "Weekly"}
            </Pill>
          ))}
        </div>
      </Field>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">What you&apos;ll track</p>
        <Card className="divide-y divide-line">
          {factors.map((f) => (
            <div key={f.key} className="flex items-center justify-between px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                {categoryEmoji(f.category)} {f.label}
                {f.isTarget && (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-ink">
                    target
                  </span>
                )}
              </span>
              <span className="text-xs text-faint">{loggedAsHint(f)}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

/* --------------------------------- Bits ----------------------------------- */

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5 px-4 py-4">
      {STEPS.map((l, i) => (
        <div key={l} className="flex flex-1 items-center gap-1.5">
          <div
            className={`h-1.5 flex-1 rounded-full transition ${
              i <= step ? "bg-gradient-accent" : "bg-raised"
            }`}
          />
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      {children}
    </label>
  );
}
