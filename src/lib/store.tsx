"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { buildSeed, DB_VERSION } from "./seed";
import type { DB, Entry, EntryValue, Frequency, Sense, SenseFactor } from "./types";

const STORAGE_KEY = "mypatterns.db.v1";

// ---------------------------------------------------------------------------
// Persistence layer. Deliberately isolated behind this module so it can be
// swapped for a Supabase/Postgres client later without touching components.
// ---------------------------------------------------------------------------
function load(): DB {
  if (typeof window === "undefined") return buildSeed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildSeed();
    const parsed = JSON.parse(raw) as DB;
    if (!parsed || parsed.version !== DB_VERSION) return buildSeed();
    return parsed;
  } catch {
    return buildSeed();
  }
}

function persist(db: DB) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* quota / private mode — prototype tolerates in-memory only */
  }
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

interface NewFactorInput {
  label: string;
  category: SenseFactor["category"];
  entryType: SenseFactor["entryType"];
  config: SenseFactor["config"];
  isTarget?: boolean;
}

interface StoreValue {
  ready: boolean;
  senses: Sense[];
  factorsFor: (senseId: string) => SenseFactor[];
  entriesFor: (senseId: string) => Entry[];
  getSense: (senseId: string) => Sense | undefined;
  createSense: (input: {
    title: string;
    question: string;
    frequency: Frequency;
    factors: NewFactorInput[];
  }) => string;
  addEntry: (senseId: string, values: EntryValue[], loggedAt?: string) => void;
  archiveSense: (senseId: string) => void;
  resetDemo: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(() => buildSeed());
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage after mount (avoids SSR/CSR mismatch).
  useEffect(() => {
    setDb(load());
    setReady(true);
  }, []);

  const update = useCallback((next: DB) => {
    setDb(next);
    persist(next);
  }, []);

  const value = useMemo<StoreValue>(() => {
    const factorsFor = (senseId: string) =>
      db.factors.filter((f) => f.senseId === senseId).sort((a, b) => a.sortOrder - b.sortOrder);
    const entriesFor = (senseId: string) =>
      db.entries
        .filter((e) => e.senseId === senseId)
        .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));

    return {
      ready,
      senses: db.senses.filter((s) => !s.archivedAt),
      factorsFor,
      entriesFor,
      getSense: (senseId) => db.senses.find((s) => s.id === senseId),

      createSense: ({ title, question, frequency, factors }) => {
        const senseId = uid("sense");
        const sense: Sense = {
          id: senseId,
          title,
          question,
          frequency,
          createdAt: new Date().toISOString(),
          archivedAt: null,
        };
        const newFactors: SenseFactor[] = factors.map((f, i) => ({
          id: uid("f"),
          senseId,
          label: f.label,
          category: f.category,
          entryType: f.entryType,
          config: f.config,
          sortOrder: i,
          isTarget: f.isTarget,
        }));
        update({
          ...db,
          senses: [...db.senses, sense],
          factors: [...db.factors, ...newFactors],
        });
        return senseId;
      },

      addEntry: (senseId, values, loggedAt) => {
        const entry: Entry = {
          id: uid("e"),
          senseId,
          loggedAt: loggedAt ?? new Date().toISOString(),
          values,
        };
        update({ ...db, entries: [...db.entries, entry] });
      },

      archiveSense: (senseId) => {
        update({
          ...db,
          senses: db.senses.map((s) =>
            s.id === senseId ? { ...s, archivedAt: new Date().toISOString() } : s
          ),
        });
      },

      resetDemo: () => {
        const seed = buildSeed();
        update(seed);
      },
    };
  }, [db, ready, update]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within <StoreProvider>");
  return ctx;
}
