# Claude Code Spec — Rich Demo Seed Environment

**Date:** 2026-06-25 · **Ships to:** the CURRENT Supabase project (`viapivvlhjqvjhoflxmp`), which becomes **demo.dsohire.com**. A fresh clean project will be prod later — so this seed must NEVER be required by prod. · **Mode:** plan-first, GUI on "Accept edits."

## Goal
Turn the current environment into a **rich, realistic, "full-steam" demo** good enough to (a) film product videos and (b) run live DSO demos. It must feel like a thriving, real DSO Hire instance — not a sparse test bed. Everything fictional; no real people or real DSO names.

## Architecture context
Per the launch plan: current seeded project → **demo**; a fresh clean project → **prod** (born clean, no destructive purge). This spec builds the demo. Commit the seed as code so it's re-runnable (the reset).

## Run context + existing-data cleanup (confirmed 2026-06-25)
- There is **one** Supabase project today — `dsohire-prod` (`viapivvlhjqvjhoflxmp`); `dsohire.com` points to it and is **gated + noindexed (pre-launch)**, so reseeding it is invisible to the public. This project BECOMES the demo. (A fresh clean project becomes prod later — out of scope here.)
- **Clean up the existing junk** as part of the seed: hard-delete the throwaway demo DSOs + their jobs/apps/candidates by slug — e.g. `douche-dental-partners`, `pig-dental`, `pv-fake-dentistry`, `test`, `test-2`, `eslinger-dental`, and the duplicate `eslinger-dental-consultants*` records. **KEEP + absorb the good ones** into the curated set so Cam keeps his bearings: **Eslinger Dental Partners** (→ becomes the HERO unless renamed), plus the candidates **Maria Lopez** and **Jordan Bailey**. All real candidate/DSO data here is fictional demo seed — nothing real is lost.
- After cleanup, the only DSOs/candidates that exist are the curated demo set below.

## Hard guardrails (P0 — even in demo)
- **Fully fictional.** No real candidate identities, no real DSO/company names (avoid trademarks). Headshots are stock/AI — clearly not real individuals.
- **EEO/demographic firewall** — never seed data that surfaces EEO anywhere; the demo must model the firewall, not break it.
- **Masking/consent honored** — seed candidates across visibility states so the talent pool shows masked AND named profiles correctly.
- **Demo-scoped + reversible** — every seeded row is tagged so reset can wipe-and-reseed ONLY the demo set, never anything else. Reuse the existing `dsos.is_demo=true` flag plus a stable slug prefix (e.g. `demo-`) and/or a `seed_batch='demo_v1'` marker on a metadata column where available.

## Idempotency + reset (req)
- One committed entry point: `scripts/seed-demo.ts` (follow the existing `scripts/` pattern; run with service-role). Running it twice = same result (delete-by-marker then insert, or upsert by stable slug/email).
- **Admin "Reset demo data" button** in `/admin` (founder-gated): calls the same delete-by-marker + reseed, so Cam can reset to pristine between demos in one click. Server-side, founder-only, demo-marker-scoped (asserts it can only touch demo rows).
- A `scripts/verify-demo.ts` sanity check: asserts the wow-beats below all exist after a seed (so a reset never silently produces an empty demo).

## Data to build

### DSOs — the tier ladder (~5–6, fictional names + simple logos)
- **Solo** — single practice (1 location).
- **Growth** — small group (~3–6 locations).
- **Scale (HERO)** — multi-location DSO (~15–25 locations); THIS is the flagship demo stage, built to full steam.
- **Enterprise** — large multi-state group (~40+ locations).
- (+1 extra Growth/Scale optional for variety.)
Each: fictional brand name, generated/placeholder logo, varied metros, realistic plan tier matching size, correct caps.

**Proposed roster (reuse the good existing names for continuity; Cam can rename any):**
- **Solo** — *Cedarwood Dental* (NEW, single practice).
- **Growth** — *Lakeshore Dental Group* (~4 locations).
- **Scale — HERO** — *Eslinger Dental Partners* (~18 locations; the flagship demo stage). [Cam: rename if you'd rather demo from a neutral name.]
- **Enterprise** — *Summit Dental Group* (~45 locations, multi-state).
- **Extra Scale** — *Riverstone Dental Partners* (~12 locations) and/or *Longhorn Dental Partners* (TX Growth) for variety.
- Remove `Bridgeway Dental Operations` with the backdoor account cleanup.

### The HERO DSO — engineered wow-beats (MUST all be present)
The flagship must make every demo beat land. After seeding, the hero DSO has:
- Dashboard **Next-Best-Actions** populated: at least one high-fit candidate (a genuine ~95–97 fit), one SLA-breached new app, one stalled mid-pipeline cluster, one "offers out."
- **Pipeline/kanban**: candidates in EVERY stage (new/screen/interview/offer/hired), including ≥1 aged/stalled and ≥1 offer-sent-awaiting-response and ≥1 hired.
- **Conversations**: real message threads + internal notes on several candidates.
- **Credentialing**: ≥1 candidate with an expiring license (so the roll-up + digest show something).
- **Analytics (Vantage)**: backdated events so the dashboard KPIs (time-to-fill, apps/week, offers out) and `/admin/analytics` show believable numbers.
- **Talent pool / sourcing**: saved candidates + ≥1 double-blind prospect thread mid-conversation; a mix of masked + named profiles in Discover.
- Multiple **jobs** across clinical + corporate roles, varied ages/statuses.

### Jobs (rich)
- Across clinical (associate dentist, hygienist, dental assistant, OM/front desk, specialists) AND corporate (RCM, ops, etc. — to show DSOFit).
- Full **dental comp models** via the composable builder (guarantee/draw/% production/collections, lab-fee policy, W-2/1099) so deal cards render.
- Screening questions, schedules, locations; mixed statuses (active/draft/paused/filled) and realistic posted-at ages (backdated).
- Heavier on the hero; a few each on the others.

### Candidates (~65–75)
- Full profiles: first/last names (fictional), headline, current title, years (incl. dental years), license states, PMS systems, specialties, skills, languages, certifications, desired roles/locations/specialty, comp preferences, availability.
- **Completed PracticeFit AND DSOFit assessments** for most (the signal fields) so **fit scores actually compute** — then pre-warm the cache via `src/lib/practice-fit/get-or-compute.ts` against the hero's jobs so scores render instantly (don't rely on first-read compute during a live demo).
- **Headshots** on a good portion: source images are committed in-repo at `scripts/demo-assets/headshots/` (Cam's existing test headshots — fictional/stock). The seed uploads them to the avatars storage bucket + sets `avatar_url`. Add more stock/AI if you need more than provided; leave some candidates without a photo (realistic).
- **Visibility spread** (the consent model on display): mix of `hidden` (private), `recruiters_only`+`anonymous_mode=true` (anonymous-discoverable — the recommended state, should be the plurality), and `recruiters_only`/`open_to_work` named. Set `privacy_choices_reviewed_at` so they're treated as having chosen.
- Mix of clinical and corporate (DSOFit) candidates.
- Résumés: attach résumé data / files for several (the résumé builder shape) so résumé views/preview work.

### Applications + live processes (the "rich processes")
- Spread candidates across the hero's (and a couple others') jobs in **every pipeline stage**, with backdated `created_at` / `stage_entered_at` so aging is realistic.
- Include: stalled mid-pipeline (>14d), SLA-breached new apps (>5d), disposition-coded rejections, offers sent + ≥1 accepted (typed-name acceptance), scorecards, scheduled interviews, application messages + notes.
- Some candidates applied to multiple DSOs (so cross-DSO reveal works).

### The two-sided demo pair (the magic — REQUIRED)
Wire ONE specific candidate ↔ HERO DSO pairing so Cam can run the killer two-sided demo live:
- The candidate is **anonymous-discoverable** → appears masked in the hero's talent pool with a rich profile (everything but name/photo) and a high fit score.
- The flow demos cleanly: employer sees masked → candidate applies (or reveals) → identity reveals to the hero DSO only.
- Provide both logins (employer + this candidate) in the demo-logins output.

### Analytics (Vantage)
- Seed `analytics.events` (use the existing Vantage ingest shape) with backdated pageviews/events so `/admin/analytics` + dashboard metrics look alive. Believable volumes, not absurd.

## Demo personas / logins (output)
Create stable demo login accounts with simple shareable passwords (demo-only) and emit a **`DEMO_LOGINS.md`** (or print at end of seed) listing:
- Founder/admin (Cam's existing admin) — for the command center + read-only view-as.
- 1 employer login per tier (Solo/Growth/Scale-hero/Enterprise) — Cam logs into the one matching the prospect's scale.
- 2 candidate logins — the two-sided-pair candidate (anonymous) + one named/applied candidate.
All demo logins clearly fictional; passwords demo-grade (not "password" — use a shared demo passphrase).

## Build venue / sequencing
- Build + run against the CURRENT project only. Commit `scripts/seed-demo.ts` + `scripts/verify-demo.ts` + the admin reset button.
- Do NOT run any of this on the future fresh prod project.
- Straight to main/prod per workflow (the script is inert at runtime; the admin button is founder-gated).

## Acceptance criteria
- `seed-demo.ts` is idempotent (run twice → identical); `verify-demo.ts` green (all hero wow-beats present).
- Hero DSO dashboard, kanban, conversations, analytics, talent pool all look full and real; fit scores render immediately (cache pre-warmed).
- Visibility spread visible in the talent pool (masked + named); the two-sided pair demos cleanly end-to-end.
- Admin "Reset demo data" returns the environment to pristine and can ONLY touch demo-marked rows (asserted).
- Zero real PII; no EEO surfaced anywhere; no real DSO/company names.
- `npm test` stays green; Vercel green.

## Companion (Cowork will write)
`Demo_Runbook_2026-06-25.md` — the repeatable talk-track (which login → click path → the data behind each beat), doubling as the product-video storyboard. References the personas/pairs defined here.
