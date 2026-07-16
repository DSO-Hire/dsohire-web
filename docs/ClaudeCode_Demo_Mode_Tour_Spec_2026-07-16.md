# Demo Mode + In-App Guided Tour — build spec (agreed 2026-07-16, build ~Sun 2026-07-19 or early next week)

**Decision record.** Cam and Claude Code agreed on launch day (Jul 16) to replace the
flat-screenshot sales tour with a **blended approach built into the real product**:
a read-only Demo Mode on demo.dsohire.com plus a guided-tour overlay, instead of
using an external interactive-demo vendor (Navattic / Storylane / Arcade / Walnut).
Rationale: those vendors exist to DOM-capture apps they don't own; we own the source
and the database, so we can serve the real living product safely, which is strictly
better. Free, no vendor lock-in, and the extras they charge for (analytics,
per-prospect personalization) are cheap for us.

Timing per Cam: NOT before Fri Jul 18. Target Sunday Jul 20 or early the following
week. (Cam noted Claude Fable access ends Jul 19 and suggested using Fable for this
build — if building on/before the 19th, use Fable; capability matters more than
speed here.) NOTE: Cam said "Sunday, since Fable access ends July 19" — the 19th is
a Saturday; treat "get it done while Fable is still available" as the intent and
confirm the actual date with Cam.

## Why (the conversation, condensed — do not retread)

- v1 tour = flat screenshots in a hand-built shell (`~/dsohire-studio/tour/`,
  commit c637034). Cam's verdict: decent starting point, "rough around the edges";
  flat screenshots don't translate well.
- Industry standard tiers: (1) live demo env driven by the founder on calls —
  Cam already has this (demo.dsohire.com, Bridgeway Dental Partners, reset button);
  (2) DOM-captured interactive demos (the vendor category above) for async
  "Take a tour" links; (3) guided overlay on the live app — premium, but blocked
  for vendors/most teams by the shared-demo-org problem (concurrent prospects
  trample each other; resets yank the rug).
- Our unlock: we own RLS + server actions, so we can make demo sessions
  **read-only**, which dissolves the shared-org problem and lets us run tier 3
  with tier 2's safety. This is the keystone of the whole design.
- Interim (now → build): live calls use the real demo env with the v1 tour's
  chapter order as the talk track; v1 single-file tour
  (`~/dsohire-studio/tour/dist/dsohire-tour.html`) is the email-able leave-behind.
  No further polish on v1 (its DSO HIRE lockup in the header isn't the real logo —
  known, deliberately not fixed).

## Architecture

### 1. Keystone: `demo_viewer` read-only sessions (build FIRST — independently valuable)

- A demo visitor browses the REAL employer app with the REAL live Bridgeway seed
  data, but every mutation is blocked server-side and answered with a friendly
  "You're in demo mode — this action is disabled" toast.
- Enforcement must be **defense in depth**, same discipline as prod RLS:
  a) DB layer: demo-viewer JWT/role gets SELECT-only on everything (RLS policies
     or a dedicated Postgres role); no INSERT/UPDATE/DELETE path exists even if
     app code has a bug.
  b) App layer: server actions check a `isDemoViewer` gate and return a typed
     `{ ok: false, demoBlocked: true }` so the UI can toast nicely instead of
     erroring. (Sweep: all "use server" files in src/app/employer/** — the
     use-server lint infrastructure from launch day lists them.)
  c) It must be STRUCTURALLY impossible for demo-mode logic to engage for real
     customers: key off the demo Supabase project / a dedicated demo auth user +
     env flag that only exists on the demo deployment, never a runtime-guessable
     condition in prod.
- Auth shape: one shared demo account auto-signed-in (magic session minted by a
  /demo entry route), OR anonymous sessions with the demo role. Decide at build
  time; shared+read-only is fine since nobody can write.
- Existing infra that makes this cheap: demo env is its own Supabase project
  (zfnyljmrgmyyzzntqxnl — NEVER prod viapivvlhjqvjhoflxmp); seed batch
  `demo_v1` with reseed via `npm run seed:demo` and an /admin reset card;
  hero org = Bridgeway Dental Partners (20 CO locations, 22 jobs, Sarah Chen
  97/100 PracticeFit story, Sofia Russo inbox thread, Devin Park internal note).
- Note: demo.dsohire.com blocks datacenter/cloud IPs (Vercel system mitigations)
  — prospects on residential IPs are fine; cloud agents can't browse it (that's
  why launch-day tour captures were done from Cam's machine via Playwright).
- Why first: the moment this exists, Cam can hand ANY prospect a demo login /
  link with zero risk, tour or no tour.

### 2. Guided-tour overlay on the live app

- Entry: `demo.dsohire.com/?tour=owner|regional|exec` (or /demo/tour/[role]).
  Loads the real app in demo mode + a tour layer: bottom caption bar (the talk
  track), 1–2 green pulse hotspots per step, step dots + role label top-right,
  arrows/Esc keyboard nav — the exact interaction model of v1, rendered over the
  living product.
- Steps deep-link to real pages (dashboard → pipeline → Sarah Chen's application
  → inbox/Sofia → talent pool → locations → analytics per role path). A step =
  { route, hotspot selector(s), label, caption }. Selectors are data-attributes
  added to the product (e.g. `data-tour="pipeline-aging"`), NOT brittle CSS
  paths — that's what makes maintenance beat the vendors' "re-record it" answer.
  Optional CI check: tour config's data-tour targets must exist in the codebase.
- Off-script wandering is allowed (everything is read-only); a persistent
  "Resume tour" pill returns to the current step.
- Build with a tiny hand-rolled overlay (v1 shell proves the pattern; ~200 lines)
  or driver.js if it saves time — hand-rolled preferred, zero deps, brand-exact.
- CONTENT IS ALREADY WRITTEN: role paths, chapter order, captions, and hotspot
  targets live in `~/dsohire-studio/tour/site/index.html` (CHAPTERS + PATHS
  objects) — port, don't rewrite. Brand voice rules apply (no em dashes, no
  exclamation points, no hype, no invented metrics; close card says
  "Flat monthly. No placement fees." — NOT "unlimited postings", tiers cap
  openings).

### 3. Cheap extras (each ~an afternoon, all optional per priority)

- **Analytics into Vantage:** tour_started(role), step_viewed(n), step_dropped,
  tour_completed, cta_clicked — feed the existing Vantage event pipeline
  (mind the cookieless-hash decision, see vantage-cookie memory).
- **Per-prospect personalization:** `?for=Summit+Dental` renders the prospect
  name in a welcome/close card (display-only; never into demo data). This was
  the v1 "v2 backlog" item and a paid vendor tier.
- **Offline artifact:** keep regenerating the v1 single-file
  (`node ~/dsohire-studio/tour/build.mjs`) as the email-able fallback from the
  same content definitions.

## Build order (agreed)

1. `demo_viewer` read-only enforcement (~1 focused day; the only real engineering)
2. Overlay engine + port v1 content, all 3 role paths (~1 day)
3. Analytics events (afternoon)
4. Personalization + polish (afternoon)
Total ≈ 3–4 focused days; MVP demo-able after step 2.

## Risks / guardrails

- #1 failure mode: a writable path reachable by a demo viewer → DB-level
  read-only is the backstop, not app checks alone. Verify with role-simulation
  tests (the "DB role-sim" step in definition-of-done).
- #2: demo-mode logic engaging in prod → key off demo project/env only; add a
  test that prod build with prod env cannot enter demo mode.
- Realtime surfaces (kanban echoes) should no-op gracefully read-only.
- After the PracticeFit/DSOFit AI match summary ships (separate task, parked
  2026-07-16, cost-conscious design required — it renders on every applicant
  page), the demo's flagship screen gets a real summary: re-verify that step's
  caption/hotspot, and re-capture v1's practicefit screenshot
  (`~/dsohire-studio/tour/capture-practicefit-clean.mjs` currently hides the
  unfinished summary skeleton).

## Explicitly rejected / deferred

- External vendors (Navattic/Storylane/Arcade/Walnut): rejected — cost, lock-in,
  and inferior to owning the stack. Revisit only if we abandon self-hosting.
- Per-prospect ephemeral WRITE sandboxes (each prospect mutates their own copy):
  deferred — heavy; read-only covers the sales need for now.
- v1 screenshot-tour polish (real logo lockup, "C" caption toggle from its spec):
  dropped unless v1 outlives expectations; do not spend time there.
- Deploying anything to tour.dsohire.com: still Cam's call, nothing deployed.

## Related artifacts

- v1 tour + notes: `~/dsohire-studio/tour/` (NOTES.md there points here)
- Launch-day tour captures: `~/dsohire-studio/public/screens/tour/*.png`
  (3200x2000; `.auth-state.json` beside them is gitignored Playwright auth)
- Demo seed spec: `docs/ClaudeCode_Demo_Seed_Spec_2026-06-25.md`
- Admin impersonation design (adjacent read pattern): `docs/admin-impersonation-design.md`
