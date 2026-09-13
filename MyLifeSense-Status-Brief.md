# MyLifeSense — Status Brief (for commercial analysis)

_Prepared 2026-09-14. Working prototype, live in production._

## What it is
A personal self-tracking app built on a simple model: a user defines a **Sense** (something they want to understand about themselves — e.g. "What triggers my chest pain?"), attaches **Sense Factors** (things to track, across 7 entry types — number, scale, yes/no, list, text, time, integration), **logs entries**, and receives **AI-surfaced correlations, insights, and a plain-language narrative** plus a **chat** to interrogate their own data.

Positioning: a "quantified self" / health-and-behaviour insight tool that turns everyday logging into causal-ish, goal-aware guidance ("this is a lever you control; that is context").

## Product maturity
**Functional end-to-end prototype, deployed and verified live** — not a mockup. Real database, real auth, real AI, real analytics engine.

### Built & verified
- **Core loop:** Home, guided New Sense wizard, free-order Log, Insights, Chat.
- **Analytics engine v2:** Spearman rank correlation, Student's-t p-values, Benjamini-Hochberg FDR control (guards against false positives from testing many factors), group-mean effect sizes, same-day vs next-day lag detection, confidence tiers, and a ranked value score. 15-entry minimum before claims are shown.
- **Goal/lever model:** each factor tagged minimize/maximize + controllable/context, so recommendations are safe and actionable (clinician note auto-added for symptom targets).
- **Real AI (Claude):** narrative + chat + AI factor suggestions + voice-log interpretation, via a serverless function. **Privacy-forward: only computed statistics are sent to the model, never raw entries.** Graceful fallback to a deterministic engine if AI is off.
- **Voice:** WhatsApp-style hold-to-talk logging (speak → AI parses → confirms aloud → saves) and text-to-speech talk-back.
- **Context injection:** per-Sense and global "About me" free-text/document context feeds the AI for tailored insight.
- **Management:** edit senses/factors, focus a sense, browse/edit/delete entries, delete-sense with typed confirmation.
- **Auth:** anonymous guest mode + email magic-link + Google sign-in (Google verified live); guest data upgrades in place on sign-in.

### Built, needs user activation (not yet fully proven end-to-end)
- **Reminders / Web Push** — per-Sense and per-factor, real push. Code complete (app + separate cron Worker); requires a DB migration + Worker deploy + on-device enable. Push delivery unverified from dev environment.
- **Fitbit integration (real OAuth):** live data feeds insights/chat (steps, resting HR), never written to storage. Needs the user's registered Fitbit app to test past the auth boundary.
- **Email magic-link:** built, not yet tested end-to-end.

### Explicitly out / deferred
- **Garmin, Apple Health, Oura, Google Fit, Gemini** — "coming soon." Garmin blocked by partner-only Health API (not self-serve).

## Tech & cost profile (commercially relevant)
- **Stack:** Next.js static export, TypeScript, Tailwind. **No server to run** — pure static site.
- **Hosting:** Cloudflare Pages (free tier viable); live at **https://mylifesense.pages.dev**.
- **Database/auth:** Supabase (Postgres + row-level security + anonymous auth), called directly from the browser. Owner-only data isolation.
- **AI:** single Cloudflare Pages Function holds the Anthropic key; model configurable (currently running low-cost Haiku). Cost scales with narrative/chat usage only, and only summary-sized payloads are sent.
- **Implication:** extremely low fixed infrastructure cost; near-zero marginal cost per user at prototype scale. Variable cost is dominated by AI calls, which are small and controllable.

## Commercial considerations / open questions
- **Regulatory:** health-adjacent (symptom tracking, correlations). Currently framed as insight, not diagnosis, with clinician notes on symptom targets — but any health-claim positioning needs a compliance review.
- **Data sensitivity:** stores personal health/behaviour data. Privacy design is good (RLS, summary-only AI), but a formal privacy policy / data-handling posture is needed for commercial launch.
- **Moat:** the analytics rigour (FDR-controlled, lag-aware, goal/lever-aware) + AI narrative is the differentiator vs generic habit trackers.
- **Monetization not yet designed** — no billing, tiers, or paywall exist.
- **Verification gaps to close before selling:** push delivery, Fitbit live path, email login, and multi-user scale testing.

## One-line summary
A privacy-conscious, low-cost, AI-powered self-insight app with a working production prototype and a genuinely differentiated analytics engine — closest gaps to commercial readiness are monetization design, a compliance/privacy review, and closing a few verification items (push, wearables, scale).
