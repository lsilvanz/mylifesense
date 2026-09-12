"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { buildSeed, DB_VERSION } from "./seed";
import { supabase, supabaseEnabled } from "./supabase";
import { captureRedirect } from "./fitbit";
import type { DB, Entry, EntryValue, EntryValueData, Frequency, Sense, SenseFactor } from "./types";

const STORAGE_KEY = "mypatterns.db.v1";

// ---------------------------------------------------------------------------
// Two interchangeable backends live behind this module:
//   - Supabase (Postgres + RLS) when NEXT_PUBLIC_SUPABASE_* is configured
//   - localStorage otherwise (zero-config local dev / offline demo)
// Components read synchronously from an in-memory cache (`db`); the Supabase
// backend hydrates that cache on mount + on every auth change, and writes
// through on every mutation.
//
// Auth: users start as a Supabase anonymous account. Signing in with email or
// Google LINKS that anonymous account to a permanent one, so the guest's data
// (same user id) carries over instead of being lost.
// ---------------------------------------------------------------------------

function uid(): string {
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

// Remap the seeded demo (friendly string ids) onto fresh UUIDs so it can be
// inserted into Postgres while preserving every relationship.
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

// ---- auth helpers ---------------------------------------------------------
export interface AuthUser {
  id: string;
  email: string | null;
  isAnonymous: boolean;
}

function sessionToUser(session: Session | null): AuthUser | null {
  const u = session?.user;
  if (!u) return null;
  return { id: u.id, email: u.email ?? null, isAnonymous: Boolean(u.is_anonymous) };
}

export interface AuthResult {
  ok: boolean;
  message: string;
}

interface NewFactorInput {
  label: string;
  category: SenseFactor["category"];
  entryType: SenseFactor["entryType"];
  config: SenseFactor["config"];
  isTarget?: boolean;
}

const GUEST_KEY = "mylifesense.guest";
const FOCUS_KEY = "mylifesense.focus";

interface StoreValue {
  ready: boolean;
  usingSupabase: boolean;
  initError: string | null;
  user: AuthUser | null;
  guest: boolean;
  continueAsGuest: () => void;
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
  updateEntry: (entryId: string, values: EntryValue[], loggedAt?: string) => void;
  deleteEntry: (entryId: string) => void;
  focusedSenseId: string | null;
  setFocusedSense: (senseId: string) => void;
  archiveSense: (senseId: string) => void;
  deleteSense: (senseId: string) => void;
  updateFactor: (
    factorId: string,
    patch: Partial<Pick<SenseFactor, "label" | "category" | "entryType" | "config">>
  ) => void;
  setTargetFactor: (senseId: string, factorId: string) => void;
  deleteFactor: (factorId: string) => void;
  addFactorToSense: (senseId: string, input: NewFactorInput) => void;
  resetDemo: () => void;
  signInWithEmail: (email: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

const EMPTY_DB: DB = { version: DB_VERSION, senses: [], factors: [], entries: [] };

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(EMPTY_DB);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [guest, setGuest] = useState(false);
  const [focusedSenseId, setFocusedId] = useState<string | null>(null);
  const currentUserId = useRef<string | null>(null);

  // Remember a visitor's choice to skip the sign-in gate + which Sense is focused.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(GUEST_KEY) === "1") setGuest(true);
      setFocusedId(window.localStorage.getItem(FOCUS_KEY));
    } catch {
      /* ignore */
    }
  }, []);

  // Capture a Fitbit OAuth token if we've just returned from the provider
  // (runs on any route, since this provider wraps the whole app).
  useEffect(() => {
    try {
      captureRedirect();
    } catch {
      /* ignore */
    }
  }, []);

  // Load every row the current user can see (RLS scopes to them automatically).
  const hydrateData = useCallback(async () => {
    if (!supabase) return;
    const [senses, factors, entries] = await Promise.all([
      supabase.from("senses").select("*"),
      supabase.from("factors").select("*"),
      supabase.from("entries").select("*, entry_values(factor_id, value)"),
    ]);
    const firstError = senses.error || factors.error || entries.error;
    if (firstError) throw new Error(firstError.message);
    setDb({
      version: DB_VERSION,
      senses: (senses.data ?? []).map(mapSense),
      factors: (factors.data ?? []).map(mapFactor),
      entries: (entries.data ?? []).map(mapEntry),
    });
  }, []);

  useEffect(() => {
    if (!supabaseEnabled || !supabase) {
      setDb(loadLocal());
      setReady(true);
      return;
    }
    let cancelled = false;

    // React to every auth transition: hydrate when the identity changes.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const newId = session?.user?.id ?? null;
      setUser(sessionToUser(session));
      if (newId && newId !== currentUserId.current) {
        currentUserId.current = newId;
        hydrateData()
          .catch((e) => setInitError(e instanceof Error ? e.message : "Failed to load data"))
          .finally(() => {
            if (!cancelled) setReady(true);
          });
      }
    });

    // Ensure a session exists; the listener above does the hydration.
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          const { error } = await supabase.auth.signInAnonymously();
          if (error) throw new Error(`Anonymous sign-in failed: ${error.message}`);
        }
      } catch (e) {
        setInitError(e instanceof Error ? e.message : "Failed to sign in");
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [hydrateData]);

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

    const origin = typeof window !== "undefined" ? window.location.origin : undefined;

    return {
      ready,
      usingSupabase: supabaseEnabled,
      initError,
      user,
      guest,
      continueAsGuest: () => {
        setGuest(true);
        try {
          window.localStorage.setItem(GUEST_KEY, "1");
        } catch {
          /* ignore */
        }
      },
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
            logError("createSense/sense")(
              await supabase.from("senses").insert({
                id: sense.id,
                title,
                question,
                frequency,
                created_at: sense.createdAt,
              })
            );
            logError("createSense/factors")(
              await supabase.from("factors").insert(newFactors.map(factorToRow))
            );
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
            logError("addEntry/entry")(
              await supabase
                .from("entries")
                .insert({ id: entry.id, sense_id: senseId, logged_at: entry.loggedAt })
            );
            if (values.length) {
              logError("addEntry/values")(
                await supabase
                  .from("entry_values")
                  .insert(
                    values.map((v) => ({ entry_id: entry.id, factor_id: v.factorId, value: v.value }))
                  )
              );
            }
          })();
        }
      },

      updateEntry: (entryId, values, loggedAt) => {
        const next = {
          ...db,
          entries: db.entries.map((e) =>
            e.id === entryId ? { ...e, values, loggedAt: loggedAt ?? e.loggedAt } : e
          ),
        };
        setDb(next);
        persist(next);
        if (supabase) {
          (async () => {
            if (loggedAt) {
              logError("updateEntry/at")(
                await supabase.from("entries").update({ logged_at: loggedAt }).eq("id", entryId)
              );
            }
            // Replace this entry's values wholesale.
            logError("updateEntry/clear")(
              await supabase.from("entry_values").delete().eq("entry_id", entryId)
            );
            if (values.length) {
              logError("updateEntry/insert")(
                await supabase
                  .from("entry_values")
                  .insert(values.map((v) => ({ entry_id: entryId, factor_id: v.factorId, value: v.value })))
              );
            }
          })();
        }
      },

      deleteEntry: (entryId) => {
        const next = { ...db, entries: db.entries.filter((e) => e.id !== entryId) };
        setDb(next);
        persist(next);
        if (supabase) supabase.from("entries").delete().eq("id", entryId).then(logError("deleteEntry"));
      },

      focusedSenseId,
      setFocusedSense: (senseId) => {
        setFocusedId(senseId);
        try {
          window.localStorage.setItem(FOCUS_KEY, senseId);
        } catch {
          /* ignore */
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

      deleteSense: (senseId) => {
        const next = {
          ...db,
          senses: db.senses.filter((s) => s.id !== senseId),
          factors: db.factors.filter((f) => f.senseId !== senseId),
          entries: db.entries.filter((e) => e.senseId !== senseId),
        };
        setDb(next);
        persist(next);
        // FK on delete cascade removes factors/entries/entry_values in Postgres.
        if (supabase) supabase.from("senses").delete().eq("id", senseId).then(logError("deleteSense"));
      },

      updateFactor: (factorId, patch) => {
        const next = {
          ...db,
          factors: db.factors.map((f) => (f.id === factorId ? { ...f, ...patch } : f)),
        };
        setDb(next);
        persist(next);
        if (supabase) {
          const row: Row = {};
          if (patch.label !== undefined) row.label = patch.label;
          if (patch.category !== undefined) row.category = patch.category;
          if (patch.entryType !== undefined) row.entry_type = patch.entryType;
          if (patch.config !== undefined) row.config = patch.config;
          supabase.from("factors").update(row).eq("id", factorId).then(logError("updateFactor"));
        }
      },

      setTargetFactor: (senseId, factorId) => {
        const next = {
          ...db,
          factors: db.factors.map((f) =>
            f.senseId === senseId ? { ...f, isTarget: f.id === factorId } : f
          ),
        };
        setDb(next);
        persist(next);
        if (supabase) {
          (async () => {
            logError("setTarget/off")(
              await supabase.from("factors").update({ is_target: false }).eq("sense_id", senseId)
            );
            logError("setTarget/on")(
              await supabase.from("factors").update({ is_target: true }).eq("id", factorId)
            );
          })();
        }
      },

      deleteFactor: (factorId) => {
        const next = {
          ...db,
          factors: db.factors.filter((f) => f.id !== factorId),
          entries: db.entries.map((e) => ({
            ...e,
            values: e.values.filter((v) => v.factorId !== factorId),
          })),
        };
        setDb(next);
        persist(next);
        if (supabase) supabase.from("factors").delete().eq("id", factorId).then(logError("deleteFactor"));
      },

      addFactorToSense: (senseId, input) => {
        const maxSort = db.factors
          .filter((f) => f.senseId === senseId)
          .reduce((m, f) => Math.max(m, f.sortOrder), -1);
        const factor: SenseFactor = {
          id: uid(),
          senseId,
          label: input.label,
          category: input.category,
          entryType: input.entryType,
          config: input.config,
          sortOrder: maxSort + 1,
          isTarget: false,
        };
        const next = { ...db, factors: [...db.factors, factor] };
        setDb(next);
        persist(next);
        if (supabase) supabase.from("factors").insert(factorToRow(factor)).then(logError("addFactor"));
      },

      resetDemo: () => {
        if (supabase) {
          (async () => {
            logError("resetDemo/delete")(
              await supabase.from("senses").delete().not("id", "is", null)
            );
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

      // ---- auth actions -----------------------------------------------------
      signInWithEmail: async (raw) => {
        if (!supabase) return { ok: false, message: "Auth is only available with Supabase configured." };
        const email = raw.trim();
        if (!email) return { ok: false, message: "Enter an email address." };
        const { data } = await supabase.auth.getUser();
        // Anonymous user -> link the email (keeps their data). Falls back to a
        // plain magic link if that email already belongs to an account.
        if (data.user?.is_anonymous) {
          const linked = await supabase.auth.updateUser({ email });
          if (!linked.error) {
            return { ok: true, message: `Confirmation link sent to ${email}. Open it to finish and keep your data.` };
          }
          const otp = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: origin } });
          return otp.error
            ? { ok: false, message: otp.error.message }
            : { ok: true, message: `Magic link sent to ${email}.` };
        }
        const otp = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: origin } });
        return otp.error
          ? { ok: false, message: otp.error.message }
          : { ok: true, message: `Magic link sent to ${email}.` };
      },

      signInWithGoogle: async () => {
        if (!supabase) return { ok: false, message: "Auth is only available with Supabase configured." };
        const { data } = await supabase.auth.getUser();
        const options = { redirectTo: origin };
        if (data.user?.is_anonymous) {
          const linked = await supabase.auth.linkIdentity({ provider: "google", options });
          if (!linked.error) return { ok: true, message: "Redirecting to Google…" };
          // Manual linking may be disabled; fall back to a normal OAuth sign-in.
          const oauth = await supabase.auth.signInWithOAuth({ provider: "google", options });
          return oauth.error ? { ok: false, message: oauth.error.message } : { ok: true, message: "Redirecting to Google…" };
        }
        const oauth = await supabase.auth.signInWithOAuth({ provider: "google", options });
        return oauth.error ? { ok: false, message: oauth.error.message } : { ok: true, message: "Redirecting to Google…" };
      },

      signOut: async () => {
        if (!supabase) return;
        // Clear the guest-skip so the sign-in gate returns after signing out.
        setGuest(false);
        try {
          window.localStorage.removeItem(GUEST_KEY);
        } catch {
          /* ignore */
        }
        await supabase.auth.signOut();
        currentUserId.current = null;
        setDb(EMPTY_DB);
        // Return to a fresh guest session so the app stays usable.
        await supabase.auth.signInAnonymously();
      },
    };
  }, [db, ready, initError, user, guest, focusedSenseId, persist]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within <StoreProvider>");
  return ctx;
}
