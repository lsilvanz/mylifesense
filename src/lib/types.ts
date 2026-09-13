// Core data model for MyLifeSense.
// Mirrors the technical brief (section 2). Factors belong to a Sense (not a
// global library); EntryValue.value is polymorphic and stored loosely so new
// entry types never require a schema migration.

export type EntryType =
  | "yes_no"
  | "scale_0_10"
  | "low_med_high"
  | "number"
  | "free_text"
  | "integration"
  | "list";

export type Frequency = "daily" | "few_per_week" | "weekly";

export type FactorCategory =
  | "Symptoms"
  | "Food"
  | "Exercise"
  | "Sleep"
  | "Environment"
  | "Mood"
  | "Custom";

export interface FactorConfig {
  // list
  options?: string[];
  // number
  unit?: string;
  // integration
  provider?: string;
  metric?: string;
  // insights metadata (stored in jsonb — no schema migration needed)
  //   goalDirection: only meaningful on the target — is lower or higher better?
  //   controllable:  is this a "lever" the user can change, vs. context?
  goalDirection?: "minimize" | "maximize";
  controllable?: boolean;
}

export interface SenseFactor {
  id: string;
  senseId: string;
  label: string;
  category: FactorCategory;
  entryType: EntryType;
  config: FactorConfig;
  sortOrder: number;
  // Whether this factor is the "target" measure a Sense is trying to understand
  // (e.g. pain level). Correlations are computed against the target.
  isTarget?: boolean;
}

export interface Sense {
  id: string;
  title: string;
  question: string;
  frequency: Frequency;
  createdAt: string;
  archivedAt?: string | null;
}

// value is polymorphic per entry_type:
//   yes_no        -> boolean
//   scale_0_10    -> number (0..10)
//   low_med_high  -> "low" | "med" | "high"
//   number        -> number
//   free_text     -> string
//   list          -> string[] (one or more of config.options; legacy: a string)
//   integration   -> number (synthetic in the prototype)
export type EntryValueData = boolean | number | string | string[] | null;

export interface EntryValue {
  factorId: string;
  value: EntryValueData;
}

export interface Entry {
  id: string;
  senseId: string;
  loggedAt: string;
  values: EntryValue[];
}

export interface DB {
  version: number;
  senses: Sense[];
  factors: SenseFactor[];
  entries: Entry[];
}
