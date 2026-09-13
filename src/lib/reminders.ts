import { supabase } from "./supabase";
import type { Frequency } from "./types";

export interface Reminder {
  id: string;
  senseId: string;
  factorId: string | null; // null = whole Sense
  frequency: Frequency;
  timeLocal: string; // HH:MM
  tz: string;
  enabled: boolean;
}

type Row = Record<string, unknown>;
const map = (r: Row): Reminder => ({
  id: r.id as string,
  senseId: r.sense_id as string,
  factorId: (r.factor_id as string) ?? null,
  frequency: r.frequency as Frequency,
  timeLocal: r.time_local as string,
  tz: r.tz as string,
  enabled: Boolean(r.enabled),
});

export function localTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function isSetupError(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  return Boolean(
    err && (err.code === "PGRST205" || (err.message ?? "").toLowerCase().includes("schema cache"))
  );
}

export async function listReminders(senseId: string): Promise<Reminder[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("reminders").select("*").eq("sense_id", senseId);
  if (error) throw error;
  return (data ?? []).map(map);
}

export async function upsertReminder(r: Omit<Reminder, "id"> & { id?: string }): Promise<Reminder | null> {
  if (!supabase) return null;
  const row = {
    sense_id: r.senseId,
    factor_id: r.factorId,
    frequency: r.frequency,
    time_local: r.timeLocal,
    tz: r.tz,
    enabled: r.enabled,
  };
  if (r.id) {
    const { error } = await supabase.from("reminders").update(row).eq("id", r.id);
    if (error) throw error;
    return { ...(r as Reminder) };
  }
  const { data, error } = await supabase.from("reminders").insert(row).select().single();
  if (error) throw error;
  return data ? map(data) : null;
}

export async function deleteReminder(id: string): Promise<void> {
  if (supabase) await supabase.from("reminders").delete().eq("id", id);
}
