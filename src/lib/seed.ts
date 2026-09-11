import type { DB, Entry, Sense, SenseFactor } from "./types";

export const DB_VERSION = 3;

// Deterministic PRNG so the seeded demo is identical on every fresh install.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setHours(20, 30, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export function buildSeed(): DB {
  const rand = mulberry32(20260911);

  // ---- Sense 1: Chest Pain (rich history, real correlations) ----
  const chest: Sense = {
    id: "sense_chest",
    title: "Chest Pain",
    question: "What makes my evening chest pain better or worse?",
    frequency: "daily",
    createdAt: daysAgoISO(30),
    archivedAt: null,
  };

  const cf: SenseFactor[] = [
    { id: "f_pain", senseId: chest.id, label: "Evening chest pain", category: "Symptoms", entryType: "scale_0_10", config: {}, sortOrder: 0, isTarget: true },
    { id: "f_exam", senseId: chest.id, label: "Exercised in the morning", category: "Exercise", entryType: "yes_no", config: {}, sortOrder: 1 },
    { id: "f_coffee", senseId: chest.id, label: "Coffee", category: "Food", entryType: "number", config: { unit: "cups" }, sortOrder: 2 },
    { id: "f_sleep", senseId: chest.id, label: "Sleep quality", category: "Sleep", entryType: "low_med_high", config: {}, sortOrder: 3 },
    { id: "f_stress", senseId: chest.id, label: "Stress level", category: "Mood", entryType: "scale_0_10", config: {}, sortOrder: 4 },
    { id: "f_latemeal", senseId: chest.id, label: "Ate a late heavy meal", category: "Food", entryType: "yes_no", config: {}, sortOrder: 5 },
    { id: "f_steps", senseId: chest.id, label: "Steps (Fitbit)", category: "Exercise", entryType: "integration", config: { provider: "fitbit", metric: "steps" }, sortOrder: 6 },
  ];

  const chestEntries: Entry[] = [];
  // 26 days of data. Pain is driven down by morning exercise, up by coffee &
  // stress & late meals, with random noise so r is realistic (not 1.0).
  for (let i = 26; i >= 1; i--) {
    const exercised = rand() > 0.45;
    const coffee = Math.round(clamp(1 + rand() * 4, 0, 5));
    const stress = Math.round(clamp(2 + rand() * 7, 0, 10));
    const lateMeal = rand() > 0.6;
    const sleepRoll = rand();
    const sleep = sleepRoll < 0.33 ? "low" : sleepRoll < 0.66 ? "med" : "high";
    const steps = Math.round(clamp((exercised ? 7000 : 3500) + rand() * 3000, 1500, 14000));

    const noise = (rand() - 0.5) * 2.4;
    let pain =
      5 +
      (exercised ? -2.6 : 1.1) +
      coffee * 0.5 +
      (stress - 5) * 0.35 +
      (lateMeal ? 1.4 : 0) +
      (sleep === "low" ? 1.0 : sleep === "high" ? -0.6 : 0) +
      noise;
    pain = Math.round(clamp(pain, 0, 10));

    chestEntries.push({
      id: `e_chest_${i}`,
      senseId: chest.id,
      loggedAt: daysAgoISO(i),
      values: [
        { factorId: "f_pain", value: pain },
        { factorId: "f_exam", value: exercised },
        { factorId: "f_coffee", value: coffee },
        { factorId: "f_sleep", value: sleep },
        { factorId: "f_stress", value: stress },
        { factorId: "f_latemeal", value: lateMeal },
        { factorId: "f_steps", value: steps },
      ],
    });
  }

  // ---- Sense 2: Lack of Concentration (sparse — demonstrates gating) ----
  const focus: Sense = {
    id: "sense_focus",
    title: "Lack of Concentration",
    question: "Why do some afternoons feel foggy?",
    frequency: "few_per_week",
    createdAt: daysAgoISO(9),
    archivedAt: null,
  };
  const ff: SenseFactor[] = [
    { id: "ff_focus", senseId: focus.id, label: "Afternoon focus", category: "Symptoms", entryType: "scale_0_10", config: {}, sortOrder: 0, isTarget: true },
    { id: "ff_sleep", senseId: focus.id, label: "Hours slept", category: "Sleep", entryType: "number", config: { unit: "hours" }, sortOrder: 1 },
    { id: "ff_screen", senseId: focus.id, label: "Screen before bed", category: "Environment", entryType: "yes_no", config: {}, sortOrder: 2 },
    { id: "ff_mood", senseId: focus.id, label: "Mood", category: "Mood", entryType: "low_med_high", config: {}, sortOrder: 3 },
  ];
  const focusEntries: Entry[] = [];
  for (let i = 6; i >= 1; i--) {
    focusEntries.push({
      id: `e_focus_${i}`,
      senseId: focus.id,
      loggedAt: daysAgoISO(i),
      values: [
        { factorId: "ff_focus", value: Math.round(clamp(4 + rand() * 5, 0, 10)) },
        { factorId: "ff_sleep", value: Math.round((5.5 + rand() * 3) * 10) / 10 },
        { factorId: "ff_screen", value: rand() > 0.5 },
        { factorId: "ff_mood", value: rand() < 0.4 ? "low" : rand() < 0.7 ? "med" : "high" },
      ],
    });
  }

  return {
    version: DB_VERSION,
    senses: [chest, focus],
    factors: [...cf, ...ff],
    entries: [...chestEntries, ...focusEntries],
  };
}
