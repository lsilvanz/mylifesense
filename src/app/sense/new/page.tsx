"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppHeader, Button, Card, Pill } from "@/components/ui";
import { CATEGORIES, ENTRY_TYPES, categoryEmoji, entryTypeMeta } from "@/lib/entryTypes";
import { suggestFactors } from "@/lib/ai";
import { useStore } from "@/lib/store";
import type { EntryType, FactorCategory, FactorConfig, Frequency } from "@/lib/types";

interface DraftFactor {
  key: string;
  label: string;
  category: FactorCategory;
  entryType: EntryType;
  options: string; // comma-separated, for list
  unit: string; // for number
  provider: string; // for integration
  metric: string;
  isTarget: boolean;
  controllable?: boolean;
  multiple?: boolean; // list: allow multiple selection
}

const SUGGESTED: { label: string; category: FactorCategory; entryType: EntryType }[] = [
  { label: "Symptom severity", category: "Symptoms", entryType: "scale_0_10" },
  { label: "Exercised today", category: "Exercise", entryType: "yes_no" },
  { label: "Sleep quality", category: "Sleep", entryType: "low_med_high" },
  { label: "Coffee", category: "Food", entryType: "number" },
  { label: "Mood", category: "Mood", entryType: "low_med_high" },
  { label: "Weather", category: "Environment", entryType: "list" },
];

let keyCounter = 0;
const nextKey = () => `d${keyCounter++}`;

export default function NewSensePage() {
  const router = useRouter();
  const { createSense } = useStore();

  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [factors, setFactors] = useState<DraftFactor[]>([]);
  const [goalDir, setGoalDir] = useState<"minimize" | "maximize">("minimize");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);

  const addFactor = (seed?: Partial<DraftFactor>) => {
    setFactors((prev) => [
      ...prev,
      {
        key: nextKey(),
        label: seed?.label ?? "",
        category: seed?.category ?? "Custom",
        entryType: seed?.entryType ?? "yes_no",
        options: seed?.options ?? "",
        unit: seed?.unit ?? "",
        provider: seed?.provider ?? "fitbit",
        metric: seed?.metric ?? "steps",
        // First factor added defaults to the target.
        isTarget: prev.length === 0,
      },
    ]);
  };

  const updateFactor = (key: string, patch: Partial<DraftFactor>) =>
    setFactors((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const removeFactor = (key: string) =>
    setFactors((prev) => {
      const next = prev.filter((f) => f.key !== key);
      if (next.length && !next.some((f) => f.isTarget)) next[0].isTarget = true;
      return next;
    });

  const setTarget = (key: string) =>
    setFactors((prev) => prev.map((f) => ({ ...f, isTarget: f.key === key })));

  const suggestWithAI = async () => {
    setAiBusy(true);
    setAiMsg(null);
    const existing = factors.map((f) => f.label).filter(Boolean);
    const suggestions = await suggestFactors(title.trim(), question.trim(), existing);
    if (!suggestions) {
      setAiMsg("AI suggestions aren't available on this deployment (or nothing came back).");
      setAiBusy(false);
      return;
    }
    setFactors((prev) => {
      const have = new Set(prev.map((f) => f.label.trim().toLowerCase()));
      const alreadyHasTarget = prev.some((f) => f.isTarget);
      const additions: DraftFactor[] = [];
      for (const s of suggestions) {
        if (have.has(s.label.toLowerCase())) continue;
        have.add(s.label.toLowerCase());
        const makeTarget = s.isTarget === true && !alreadyHasTarget && additions.every((a) => !a.isTarget);
        if (makeTarget && s.goalDirection) setGoalDir(s.goalDirection);
        additions.push({
          key: nextKey(),
          label: s.label,
          category: s.category,
          entryType: s.entryType,
          options: s.options?.join(", ") ?? "",
          unit: s.unit ?? "",
          provider: "fitbit",
          metric: "steps",
          isTarget: makeTarget,
          controllable: s.controllable,
          multiple: s.multiple,
        });
      }
      const combined = [...prev, ...additions];
      if (combined.length && !combined.some((f) => f.isTarget)) combined[0].isTarget = true;
      return combined;
    });
    setAiBusy(false);
  };

  const canStep1 = title.trim().length > 0 && question.trim().length > 0;
  const namedFactors = factors.filter((f) => f.label.trim().length > 0);
  const canStep2 = namedFactors.length >= 2 && namedFactors.some((f) => f.isTarget);

  const confirm = () => {
    const id = createSense({
      title: title.trim(),
      question: question.trim(),
      frequency,
      factors: namedFactors.map((f) => {
        const base =
          f.entryType === "list"
            ? {
                options: f.options.split(",").map((o) => o.trim()).filter(Boolean),
                multiple: f.multiple ?? false,
              }
            : f.entryType === "number"
            ? { unit: f.unit.trim() || undefined }
            : f.entryType === "integration"
            ? { provider: f.provider.trim(), metric: f.metric.trim() }
            : {};
        const config: FactorConfig = { ...base };
        if (f.isTarget) config.goalDirection = goalDir;
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
    router.push(`/log?sense=${id}`);
  };

  return (
    <main className="pb-28">
      <AppHeader title="New Sense" back="/" />
      <Stepper step={step} />

      <div className="px-4">
        {step === 1 && (
          <div className="space-y-4">
            <Field label="What do you want to understand?">
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Chest Pain, Focus, Tennis Performance"
                className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-base outline-none focus:border-accent"
              />
            </Field>
            <Field label="The question you're really asking">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={3}
                placeholder="What makes my evening chest pain better or worse?"
                className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-base outline-none focus:border-accent"
              />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Add the factors you think might matter. Pick a few suggestions or add your own — you
              need at least two, and one must be the <strong className="text-ink">target</strong>{" "}
              you want to explain.
            </p>

            <Card className="overflow-hidden">
              <div className="relative overflow-hidden bg-accent-soft px-4 py-3.5">
                <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gradient-accent opacity-25 blur-2xl" />
                <div className="relative flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">✦ Let Claude suggest factors</p>
                    <p className="mt-0.5 text-xs text-muted">
                      Based on your question, get a tailored starting set to tweak.
                    </p>
                  </div>
                  <Button className="shrink-0" disabled={aiBusy || !title.trim()} onClick={suggestWithAI}>
                    {aiBusy ? "Thinking…" : "Suggest"}
                  </Button>
                </div>
              </div>
              {aiMsg && <p className="px-4 py-2 text-xs text-negative">{aiMsg}</p>}
            </Card>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                Quick suggestions
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED.map((s) => (
                  <Pill key={s.label} onClick={() => addFactor(s)}>
                    {categoryEmoji(s.category)} {s.label}
                  </Pill>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {factors.map((f) => (
                <FactorEditor
                  key={f.key}
                  factor={f}
                  onChange={(p) => updateFactor(f.key, p)}
                  onRemove={() => removeFactor(f.key)}
                  onMakeTarget={() => setTarget(f.key)}
                />
              ))}
            </div>

            <Button variant="outline" className="w-full" onClick={() => addFactor()}>
              + Add custom factor
            </Button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <Card className="p-5">
              <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
              <p className="mt-1 text-sm text-muted">{question}</p>
            </Card>

            <Field label="How often will you log?">
              <div className="flex flex-wrap gap-2">
                {(["daily", "few_per_week", "weekly"] as Frequency[]).map((fq) => (
                  <Pill key={fq} active={frequency === fq} onClick={() => setFrequency(fq)}>
                    {fq === "daily" ? "Daily" : fq === "few_per_week" ? "A few / week" : "Weekly"}
                  </Pill>
                ))}
              </div>
            </Field>

            <Field
              label={`For "${namedFactors.find((f) => f.isTarget)?.label ?? "your target"}", which is better?`}
            >
              <div className="flex flex-wrap gap-2">
                <Pill active={goalDir === "minimize"} onClick={() => setGoalDir("minimize")}>
                  🎯 Lower is better
                </Pill>
                <Pill active={goalDir === "maximize"} onClick={() => setGoalDir("maximize")}>
                  🎯 Higher is better
                </Pill>
              </div>
              <p className="mt-1.5 text-xs text-faint">
                Drives the recommendations — e.g. lower for pain, higher for focus.
              </p>
            </Field>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                {namedFactors.length} factors
              </p>
              <Card className="divide-y divide-line">
                {namedFactors.map((f) => (
                  <div key={f.key} className="flex items-center justify-between px-4 py-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-ink">
                      {categoryEmoji(f.category)} {f.label}
                      {f.isTarget && (
                        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-ink">
                          target
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-faint">{entryTypeMeta(f.entryType).label}</span>
                  </div>
                ))}
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div className="fixed inset-x-0 bottom-0 mx-auto flex max-w-2xl gap-3 border-t border-line bg-ground/90 px-4 py-3 backdrop-blur">
        {step > 1 && (
          <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
        )}
        {step < 3 && (
          <Button
            className="flex-1"
            disabled={step === 1 ? !canStep1 : !canStep2}
            onClick={() => setStep((s) => s + 1)}
          >
            Continue
          </Button>
        )}
        {step === 3 && (
          <Button className="flex-1" onClick={confirm}>
            Create Sense & log first entry
          </Button>
        )}
      </div>
    </main>
  );
}

function Stepper({ step }: { step: number }) {
  const labels = ["Define", "Factors", "Review"];
  return (
    <div className="flex items-center gap-2 px-4 py-4">
      {labels.map((l, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <div key={l} className="flex flex-1 items-center gap-2">
            <div
              className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
                active
                  ? "bg-accent text-white"
                  : done
                  ? "bg-accent-soft text-accent-ink"
                  : "bg-raised text-faint"
              }`}
            >
              {done ? "✓" : n}
            </div>
            <span className={`text-xs font-medium ${active ? "text-ink" : "text-faint"}`}>{l}</span>
            {i < labels.length - 1 && <div className="h-px flex-1 bg-line" />}
          </div>
        );
      })}
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

function FactorEditor({
  factor,
  onChange,
  onRemove,
  onMakeTarget,
}: {
  factor: DraftFactor;
  onChange: (p: Partial<DraftFactor>) => void;
  onRemove: () => void;
  onMakeTarget: () => void;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2">
        <input
          value={factor.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Factor name"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          onClick={onRemove}
          className="grid h-8 w-8 place-items-center rounded-lg text-faint transition hover:bg-raised hover:text-negative"
          aria-label="Remove factor"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <select
          value={factor.category}
          onChange={(e) => onChange({ category: e.target.value as FactorCategory })}
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
          onChange={(e) => onChange({ entryType: e.target.value as EntryType })}
          className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent"
        >
          {ENTRY_TYPES.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          onClick={onMakeTarget}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
            factor.isTarget
              ? "bg-accent text-white"
              : "border border-line bg-surface text-muted hover:text-ink"
          }`}
        >
          {factor.isTarget ? "★ Target" : "Set as target"}
        </button>
      </div>

      {factor.entryType === "list" && (
        <div className="mt-2 space-y-2">
          <input
            value={factor.options}
            onChange={(e) => onChange({ options: e.target.value })}
            placeholder="Options, comma-separated: Sunny, Cloudy, Rain"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none focus:border-accent"
          />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-faint">Selection:</span>
            <button
              type="button"
              onClick={() => onChange({ multiple: false })}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                !factor.multiple ? "bg-accent text-white" : "border border-line bg-surface text-muted"
              }`}
            >
              Single
            </button>
            <button
              type="button"
              onClick={() => onChange({ multiple: true })}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                factor.multiple ? "bg-accent text-white" : "border border-line bg-surface text-muted"
              }`}
            >
              Multiple
            </button>
          </div>
        </div>
      )}
      {factor.entryType === "number" && (
        <input
          value={factor.unit}
          onChange={(e) => onChange({ unit: e.target.value })}
          placeholder="Unit: cups, hours, mg…"
          className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none focus:border-accent"
        />
      )}
      {factor.entryType === "integration" && (
        <div className="mt-2 flex gap-2">
          <input
            value={factor.provider}
            onChange={(e) => onChange({ provider: e.target.value })}
            placeholder="provider (e.g. fitbit)"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none focus:border-accent"
          />
          <input
            value={factor.metric}
            onChange={(e) => onChange({ metric: e.target.value })}
            placeholder="metric (e.g. steps)"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none focus:border-accent"
          />
        </div>
      )}
      <p className="mt-1.5 text-xs text-faint">{entryTypeMeta(factor.entryType).hint}</p>
    </Card>
  );
}
