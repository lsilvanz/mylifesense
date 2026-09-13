import type { EntryType, EntryValueData, FactorCategory } from "./types";

export interface EntryTypeMeta {
  type: EntryType;
  label: string;
  hint: string;
  // Whether values of this type can be turned into a number for correlation.
  quantifiable: boolean;
}

export const ENTRY_TYPES: EntryTypeMeta[] = [
  { type: "yes_no", label: "Yes / No", hint: "A simple did-it-happen toggle.", quantifiable: true },
  { type: "scale_0_10", label: "Scale 0–10", hint: "Rate intensity or amount.", quantifiable: true },
  { type: "low_med_high", label: "Low / Med / High", hint: "Three-level rating.", quantifiable: true },
  { type: "number", label: "Number", hint: "A measured value with a unit.", quantifiable: true },
  { type: "list", label: "Pick from list", hint: "Choose one of your options.", quantifiable: false },
  { type: "free_text", label: "Free text", hint: "A note in your own words.", quantifiable: false },
  { type: "integration", label: "Integration", hint: "Pulled from a connected app.", quantifiable: true },
];

export function entryTypeMeta(type: EntryType): EntryTypeMeta {
  return ENTRY_TYPES.find((t) => t.type === type) ?? ENTRY_TYPES[0];
}

export const CATEGORIES: { category: FactorCategory; emoji: string }[] = [
  { category: "Symptoms", emoji: "🩺" },
  { category: "Food", emoji: "🍽️" },
  { category: "Exercise", emoji: "🏃" },
  { category: "Sleep", emoji: "🌙" },
  { category: "Environment", emoji: "🌤️" },
  { category: "Mood", emoji: "🙂" },
  { category: "Custom", emoji: "✨" },
];

export function categoryEmoji(category: FactorCategory): string {
  return CATEGORIES.find((c) => c.category === category)?.emoji ?? "✨";
}

// Turn a stored value into a number for correlation, or null if not possible /
// not answered. Keep this the single source of truth so stats stay consistent.
export function toNumeric(type: EntryType, value: EntryValueData): number | null {
  if (value === null || value === undefined || value === "") return null;
  switch (type) {
    case "yes_no":
      return value ? 1 : 0;
    case "scale_0_10":
    case "number":
    case "integration":
      return typeof value === "number" ? value : Number(value);
    case "low_med_high":
      return value === "low" ? 0 : value === "med" ? 1 : value === "high" ? 2 : null;
    default:
      return null; // list, free_text are not quantifiable
  }
}

// True when a value counts as answered (empty arrays/strings/null do not).
export function hasValue(value: EntryValueData): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

// Human-readable rendering of a stored value.
export function formatValue(type: EntryType, value: EntryValueData, unit?: string): string {
  if (!hasValue(value)) return "—";
  switch (type) {
    case "yes_no":
      return value ? "Yes" : "No";
    case "low_med_high":
      return String(value).replace(/^\w/, (c) => c.toUpperCase());
    case "number":
    case "integration":
      return `${value}${unit ? ` ${unit}` : ""}`;
    case "scale_0_10":
      return `${value} / 10`;
    case "list":
      return Array.isArray(value) ? value.join(", ") : String(value);
    default:
      return String(value);
  }
}
