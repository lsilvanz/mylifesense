# MyLifeSense — prototype

A self-tracking app: define a **Sense** (something you want to understand about
yourself), give it **Sense Factors** (the variables you think matter, with one of
7 entry types each), log entries over time, and let the app surface correlations
and a narrative.

Built per `MyPatterns-Technical-Brief.md`. This is **Phase 1 (core loop)** plus a
real client-side **Insights** stats layer with honest sample-size gating.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3100.

## Deploy (Cloudflare Pages)

Pure client-side app (localStorage, no backend), exported as a static site:

```bash
npm run build        # -> ./out
npx wrangler pages deploy out --project-name mylifesense
``` It ships seeded with a rich **Chest Pain** demo Sense
(26 entries, real correlations) and a sparse **Lack of Concentration** Sense that
demonstrates the "not enough data yet" gating.

## What's real vs. stubbed

- **Real:** data model (7 entry types), create-Sense wizard, free-order logging,
  Pearson correlation + trend computation, the ~15-entry minimum-sample gate.
- **Stubbed for local:** persistence is `localStorage` (structured behind
  `src/lib/store.tsx` to swap for Supabase/Postgres); the Insights narrative and
  Chat answers are generated deterministically from the computed stats summary —
  the exact seam where a Claude/GPT call slots in (`src/lib/narrative.ts`).
- **Schema-only (per brief):** the `integration` entry type exists end-to-end but
  no real provider is wired up.

## Structure

- `src/lib/types.ts` — core data model
- `src/lib/store.tsx` — persistence + actions (the swappable layer)
- `src/lib/stats.ts` — correlation & trend math, `MIN_SAMPLE_SIZE`
- `src/lib/narrative.ts` — stats-summary → prose (the LLM seam)
- `src/lib/seed.ts` — deterministic demo data
- `src/app/**` — the 5 screens: Home, New Sense wizard, Log, Insights, Chat
