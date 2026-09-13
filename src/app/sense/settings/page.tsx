"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AppHeader, Button, Card, LinkButton, Loading, Pill } from "@/components/ui";
import { CATEGORIES, ENTRY_TYPES, categoryEmoji, entryTypeMeta } from "@/lib/entryTypes";
import { goalOf, isControllable } from "@/lib/insights";
import { FactorSuggestions } from "@/components/factor-suggestions";
import { ContextEditor } from "@/components/context-editor";
import { RemindersSection } from "@/components/reminders-section";
import { combinedContextForAI } from "@/lib/context";
import { useStore } from "@/lib/store";
import type { EntryType, FactorCategory, SenseFactor } from "@/lib/types";

export default function SenseSettingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SettingsInner />
    </Suspense>
  );
}

function SettingsInner() {
  const id = useSearchParams().get("sense") ?? "";
  const router = useRouter();
  const {
    ready,
    getSense,
    factorsFor,
    entriesFor,
    updateFactor,
    setTargetFactor,
    deleteFactor,
    addFactorToSense,
    addFactorsToSense,
    updateSense,
    deleteSense,
  } = useStore();

  const [confirmText, setConfirmText] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const factors = useMemo(() => (ready ? factorsFor(id) : []), [ready, factorsFor, id]);
  const entries = useMemo(() => (ready ? entriesFor(id) : []), [ready, entriesFor, id]);

  if (!ready) return <Loading />;
  const sense = getSense(id);
  if (!sense) {
    return (
      <main className="px-4">
        <AppHeader title="Manage Sense" back="/" />
        <p className="py-16 text-center text-muted">That Sense doesn&apos;t exist.</p>
      </main>
    );
  }

  const hasEntriesFor = (factorId: string) =>
    entries.some((e) => e.values.some((v) => v.factorId === factorId));

  const doDelete = () => {
    deleteSense(id);
    router.push("/");
  };

  return (
    <main className="px-4 pb-24">
      <AppHeader title={`Manage · ${sense.title}`} back={`/insights?sense=${id}`} />

      <section className="mt-4">
        <SenseDetails
          key={sense.id}
          initialTitle={sense.title}
          initialQuestion={sense.question}
          onSave={(patch) => updateSense(id, patch)}
        />
      </section>

      <div className="mt-4">
        <LinkButton href={`/sense/entries?sense=${id}`} variant="soft" className="w-full text-sm">
          Browse &amp; edit entries ({entries.length})
        </LinkButton>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold text-ink">Context</h2>
        <ContextEditor senseId={id} />
      </section>

      <section className="mt-6">
        <RemindersSection senseId={id} senseFrequency={sense.frequency} factors={factors} />
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">Factors</h2>
          <span className="text-xs text-faint">{factors.length} total</span>
        </div>

        <div className="mb-3">
          <FactorSuggestions
            title={sense.title}
            question={sense.question}
            existing={factors.map((f) => f.label)}
            context={combinedContextForAI(id)}
            onAdd={(chosen) =>
              addFactorsToSense(
                id,
                chosen.map((s) => ({
                  label: s.label,
                  category: s.category,
                  entryType: s.entryType,
                  config: {
                    ...(s.entryType === "number" && s.unit ? { unit: s.unit } : {}),
                    ...(s.entryType === "list"
                      ? { options: s.options ?? [], multiple: s.multiple ?? false }
                      : {}),
                    ...(typeof s.controllable === "boolean" ? { controllable: s.controllable } : {}),
                  },
                }))
              )
            }
          />
        </div>

        <div className="space-y-3">
          {factors.map((f) => (
            <FactorRow
              key={f.id}
              factor={f}
              locked={hasEntriesFor(f.id)}
              canDelete={factors.length > 1}
              onUpdate={(patch) => updateFactor(f.id, patch)}
              onSetTarget={() => setTargetFactor(id, f.id)}
              onDelete={() => deleteFactor(f.id)}
            />
          ))}
        </div>

        <Button
          variant="outline"
          className="mt-3 w-full"
          onClick={() =>
            addFactorToSense(id, {
              label: "New factor",
              category: "Custom",
              entryType: "yes_no",
              config: {},
            })
          }
        >
          + Add factor
        </Button>
      </section>

      {/* Danger zone */}
      <section className="mt-8">
        <h2 className="mb-2 text-sm font-bold text-negative">Danger zone</h2>
        <Card className="border-negative/30 p-4">
          <p className="text-sm font-semibold text-ink">Delete this Sense</p>
          <p className="mt-1 text-sm text-muted">
            Permanently removes <span className="font-medium text-ink">{sense.title}</span>, its{" "}
            {factors.length} factors and all {entries.length} logged entries. This can&apos;t be
            undone.
          </p>
          <Button
            variant="outline"
            className="mt-3 border-negative/50 text-negative hover:bg-negative/10"
            onClick={() => {
              setConfirmText("");
              setShowConfirm(true);
            }}
          >
            Delete Sense
          </Button>
        </Card>
      </section>

      {showConfirm && (
        <DeleteConfirm
          senseTitle={sense.title}
          value={confirmText}
          onChange={setConfirmText}
          onCancel={() => setShowConfirm(false)}
          onConfirm={doDelete}
        />
      )}
    </main>
  );
}

function FactorRow({
  factor,
  locked,
  canDelete,
  onUpdate,
  onSetTarget,
  onDelete,
}: {
  factor: SenseFactor;
  locked: boolean;
  canDelete: boolean;
  onUpdate: (patch: Partial<Pick<SenseFactor, "label" | "category" | "entryType" | "config">>) => void;
  onSetTarget: () => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(factor.label);
  const [options, setOptions] = useState((factor.config.options ?? []).join(", "));
  const [unit, setUnit] = useState(factor.config.unit ?? "");
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <Card className="p-3">
      <div className="flex items-center gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => label.trim() && label !== factor.label && onUpdate({ label: label.trim() })}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
        {!confirmDel ? (
          <button
            onClick={() => (canDelete ? setConfirmDel(true) : null)}
            disabled={!canDelete}
            title={canDelete ? "Delete factor" : "A Sense needs at least one factor"}
            className="grid h-8 w-8 place-items-center rounded-lg text-faint transition hover:bg-raised hover:text-negative disabled:opacity-30"
          >
            ✕
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={onDelete}
              className="rounded-lg bg-negative/10 px-2 py-1 text-xs font-semibold text-negative"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmDel(false)}
              className="rounded-lg px-2 py-1 text-xs text-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
          disabled={locked}
          onChange={(e) => onUpdate({ entryType: e.target.value as EntryType })}
          className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent disabled:opacity-50"
        >
          {ENTRY_TYPES.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </select>

        {factor.isTarget ? (
          <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-white">
            ★ Target
          </span>
        ) : (
          <button
            onClick={onSetTarget}
            className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-muted hover:text-ink"
          >
            Set as target
          </button>
        )}
      </div>

      {/* Insights metadata: lever vs context, and the target's goal direction. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => onUpdate({ config: { ...factor.config, controllable: !isControllable(factor) } })}
          className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-muted transition hover:text-ink"
          title="Can you directly change this?"
        >
          {isControllable(factor) ? "🎚️ Lever" : "🌦️ Context"}
        </button>
        {factor.isTarget && (
          <button
            onClick={() =>
              onUpdate({
                config: {
                  ...factor.config,
                  goalDirection: goalOf(factor) === "minimize" ? "maximize" : "minimize",
                },
              })
            }
            className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-muted transition hover:text-ink"
            title="Which direction is better?"
          >
            {goalOf(factor) === "minimize" ? "🎯 Lower is better" : "🎯 Higher is better"}
          </button>
        )}
      </div>

      {locked && (
        <p className="mt-1.5 text-xs text-faint">
          Type is locked — this factor already has entries. To change it, add a new factor instead
          (changing the type would invalidate its history).
        </p>
      )}

      {factor.entryType === "list" && (
        <div className="mt-2 space-y-2">
          <input
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            onBlur={() =>
              onUpdate({
                config: { ...factor.config, options: options.split(",").map((o) => o.trim()).filter(Boolean) },
              })
            }
            placeholder="Options, comma-separated"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none focus:border-accent"
          />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-faint">Selection:</span>
            <button
              onClick={() => onUpdate({ config: { ...factor.config, multiple: false } })}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                !factor.config.multiple ? "bg-accent text-white" : "border border-line bg-surface text-muted"
              }`}
            >
              Single
            </button>
            <button
              onClick={() => onUpdate({ config: { ...factor.config, multiple: true } })}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                factor.config.multiple ? "bg-accent text-white" : "border border-line bg-surface text-muted"
              }`}
            >
              Multiple
            </button>
          </div>
        </div>
      )}
      {factor.entryType === "number" && (
        <input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          onBlur={() => onUpdate({ config: { ...factor.config, unit: unit.trim() || undefined } })}
          placeholder="Unit: cups, hours, mg…"
          className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none focus:border-accent"
        />
      )}
      <p className="mt-1.5 text-xs text-faint">{entryTypeMeta(factor.entryType).hint}</p>
    </Card>
  );
}

function DeleteConfirm({
  senseTitle,
  value,
  onChange,
  onCancel,
  onConfirm,
}: {
  senseTitle: string;
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const armed = value.trim().toLowerCase() === "delete";
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <Card className="w-full max-w-sm p-5">
        <p className="text-lg font-bold text-ink">Delete “{senseTitle}”?</p>
        <p className="mt-1 text-sm text-muted">
          This permanently deletes the Sense and everything logged against it. To confirm, type{" "}
          <span className="font-semibold text-negative">delete</span> below.
        </p>
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && armed) onConfirm();
          }}
          placeholder="delete"
          className="mt-3 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-negative"
        />
        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <button
            disabled={!armed}
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-negative px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Delete Sense
          </button>
        </div>
      </Card>
    </div>
  );
}

function SenseDetails({
  initialTitle,
  initialQuestion,
  onSave,
}: {
  initialTitle: string;
  initialQuestion: string;
  onSave: (patch: { title?: string; question?: string }) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [question, setQuestion] = useState(initialQuestion);

  return (
    <Card className="p-4">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-ink">Name</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            const t = title.trim();
            if (t && t !== initialTitle) onSave({ title: t });
            else if (!t) setTitle(initialTitle);
          }}
          className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-semibold outline-none focus:border-accent"
        />
      </label>
      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-semibold text-ink">Question</span>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          onBlur={() => {
            const q = question.trim();
            if (q !== initialQuestion) onSave({ question: q });
          }}
          className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
      </label>
    </Card>
  );
}
