"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { buildSeed, DB_VERSION } from "./seed";
import { supabase, supabaseEnabled } from "./supabase";
import type { DB, Entry, EntryValue, Frequency, Sense, SenseFactor } from "./types";

const STORAGE_KEY = "mypatterns.db.v1";

// ---------------------------------------------------------------------------
// Two interchangeable backends live behind this module:
//   - Supabase (Postgres + RLS) when NEXT_PUBLIC_SUPABASE_* is configured
//   - localStorage otherwise (zero-config local dev / offline demo)
// Components read synchronously from an in-memory cache (`db`); the Supabase
// backend hydrates that cache on mount and writes through on every mutation.
// ---------------------------------------------------------------------------

function uid(): string {
  // Real UUIDs so the same ids are valid as Postgres primary keys.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---- localStorage backend -------------------------------------------------
function loadLocal(): DB {
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

function persistLocal(db: DB) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* quota / private mode */
  }
}

// ---- row <-> app mappers (Supabase) ---------------------------------------
type Row = Record<string, unknown>;

const mapSense = (r: Row): Sense => ({
  id: r.id as string,
  title: r.title as string,
  question: (r.question as string) ?? "",
  frequency: r.frequency as Frequency,
  createdAt: r.created_at as string,
  archivedAt: (r.archived_at as string) ?? null,
});

const mapFactor = (r: Row): SenseFactor => ({
  id: r.id as string,
  senseId: r.sense_id as string,
  label: r.label as string,
  category: r.category as SenseFactor["category"],
  entryType: r.entry_type as SenseFactor["entryType"],
  config: (r.config as SenseFactor["config"]) ?? {},
  sortOrder: (r.sort_order as number) ?? 0,
  isTarget: Boolean(r.is_target),
});

const mapEntry = (r: Row): Entry => ({
  id: r.id as string,
  senseId: r.sense_id as string,
  loggedAt: r.logged_at as string,
  values: ((r.entry_values as Row[]) ?? []).map((v) => ({
    factorId: v.factor_id as string,
    value: v.value as EntryValue["value"],
  })),
});

const factorToRow = (f: SenseFactor): Row => ({
  id: f.id,
  sense_id: f.senseId,
  label: f.label,
  category: f.category,
  entry_type: f.entryType,
  config: f.config,
  sort_order: f.sortOrder,
  is_target: f.isTarget ?? false,
});

// Remap the seeded demo (which uses friendly string ids) onto fresh UUIDs so it
// can be inserted into Postgres while preserving every relationship.
function remapSeed(seed: DB): DB {
  const map = new Map<string, string>();
  const rid = (old: string) => {
    if (!map.has(old)) map.set(old, uid());
    return map.get(old) as string;
  };
  const senses = seed.senses.map((s) => ({ ...s, id: rid(s.id) }));
  const factors = seed.factors.map((f) => ({ ...f, id: rid(f.id), senseId: rid(f.senseId) }));
  const entries = seed.entries.map((e) => ({
    ...e,
    id: rid(e.id),
    senseId: rid(e.senseId),
    values: e.values.map((v) => ({ ...v, factorId: rid(v.factorId) })),
  }));
  return { version: seed.version, senses, factors, entries };
}

async function insertSeed(db: DB) {
  if (!supabase) return;
  await supabase.from("senses").insert(
    db.senses.map((s) => ({
      id: s.id,
      title: s.title,
      question: s.question,
      frequency: s.frequency,
      created_at: s.createdAt,
      archived_at: s.archivedAt ?? null,
    }))
  );
  await supabase.from("factors").insert(db.factors.map(factorToRow));
  await supabase
    .from("entries")
    .insert(db.entries.map((e) => ({ id: e.id, sense_id: e.senseId, logged_at: e.loggedAt })));
  const values = db.entries.flatMap((e) =>
    e.values.map((v) => ({ entry_id: e.id, factor_id: v.factorId, value: v.value }))
  );
  if (values.length) await supabase.from("entry_values").insert(values);
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
  usingSupabase: boolean;
  initError: string | null;
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

const EMPTY_DB: DB = { version: DB_VERSION, senses: [], factors: [], entries: [] };

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(EMPTY_DB);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Hydrate the in-memory cache from whichever backend is active.
  useEffect(() => {
    let cancelled = false;

    async function hydrateSupabase() {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw new Error(`Anonymous sign-in failed: ${error.message}`);
      }
      const [senses, factors, entries] = await Promise.all([
        supabase.from("senses").select("*"),
        supabase.from("factors").select("*"),
        supabase.from("entries").select("*, entry_values(factor_id, value)"),
      ]);
      const firstError = senses.error || factors.error || entries.error;
      if (firstError) throw new Error(firstError.message);
      if (cancelled) return;
      setDb({
        version: DB_VERSION,
        senses: (senses.data ?? []).map(mapSense),
        factors: (factors.data ?? []).map(mapFactor),
        entries: (entries.data ?? []).map(mapEntry),
      });
    }

    (async () => {
      try {
        if (supabaseEnabled) await hydrateSupabase();
        else setDb(loadLocal());
      } catch (e) {
        setInitError(e instanceof Error ? e.message : "Failed to load data");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Local-only persistence mirror.
  const persist = useCallback((next: DB) => {
    if (!supabaseEnabled) persistLocal(next);
  }, []);

  const value = useMemo<StoreValue>(() => {
    const factorsFor = (senseId: string) =>
      db.factors.filter((f) => f.senseId === senseId).sort((a, b) => a.sortOrder - b.sortOrder);
    const entriesFor = (senseId: string) =>
      db.entries
        .filter((e) => e.senseId === senseId)
        .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));

    const logError = (label: string) => (res: { error: { message: string } | null }) => {
      if (res?.error) console.error(`[MyLifeSense] ${label}:`, res.error.message);
    };

    return {
      ready,
      usingSupabase: supabaseEnabled,
      initError,
      senses: db.senses.filter((s) => !s.archivedAt),
      factorsFor,
      entriesFor,
      getSense: (senseId) => db.senses.find((s) => s.id === senseId),

      createSense: ({ title, question, frequency, factors }) => {
        const senseId = uid();
        const sense: Sense = {
          id: senseId,
          title,
          question,
          frequency,
          createdAt: new Date().toISOString(),
          archivedAt: null,
        };
        const newFactors: SenseFactor[] = factors.map((f, i) => ({
          id: uid(),
          senseId,
          label: f.label,
          category: f.category,
          entryType: f.entryType,
          config: f.config,
          sortOrder: i,
          isTarget: f.isTarget,
        }));
        const next = {
          ...db,
          senses: [...db.senses, sense],
          factors: [...db.factors, ...newFactors],
        };
        setDb(next); // optimistic
        persist(next);
        if (supabase) {
          (async () => {
            const s = await supabase
              .from("senses")
              .insert({
                id: sense.id,
                title,
                question,
                frequency,
                created_at: sense.createdAt,
              });
            logError("createSense/sense")(s);
            const fr = await supabase.from("factors").insert(newFactors.map(factorToRow));
            logError("createSense/factors")(fr);
          })();
        }
        return senseId;
      },

      addEntry: (senseId, values, loggedAt) => {
        const entry: Entry = {
          id: uid(),
          senseId,
          loggedAt: loggedAt ?? new Date().toISOString(),
          values,
        };
        const next = { ...db, entries: [...db.entries, entry] };
        setDb(next); // optimistic
        persist(next);
        if (supabase) {
          (async () => {
            const e = await supabase
              .from("entries")
              .insert({ id: entry.id, sense_id: senseId, logged_at: entry.loggedAt });
            logError("addEntry/entry")(e);
            if (values.length) {
              const ev = await supabase
                .from("entry_values")
                .insert(values.map((v) => ({ entry_id: entry.id, factor_id: v.factorId, value: v.value })));
              logError("addEntry/values")(ev);
            }
          })();
        }
      },

      archiveSense: (senseId) => {
        const next = {
          ...db,
          senses: db.senses.map((s) =>
            s.id === senseId ? { ...s, archivedAt: new Date().toISOString() } : s
          ),
        };
        setDb(next);
        persist(next);
        if (supabase) {
          supabase
            .from("senses")
            .update({ archived_at: new Date().toISOString() })
            .eq("id", senseId)
            .then(logError("archiveSense"));
        }
      },

      resetDemo: () => {
        if (supabase) {
          (async () => {
            const del = await supabase.from("senses").delete().not("id", "is", null);
            logError("resetDemo/delete")(del);
            const seed = remapSeed(buildSeed());
            await insertSeed(seed);
            setDb(seed);
          })();
        } else {
          const seed = buildSeed();
          setDb(seed);
          persistLocal(seed);
        }
      },
    };
  }, [db, ready, initError, persist]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within <StoreProvider>");
  return ctx;
}
