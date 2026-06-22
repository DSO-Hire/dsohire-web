# Phase 4.0 — "View as" read-only impersonation: design note

**Status:** DESIGN SPIKE — for Cam's approval before any Phase 4.1 build. Nothing
shipped. (Tranche 1, §4 hard pause.)
**Date:** 2026-06-22. Grounded in the live tree.

## Goal
Let the founder see exactly what a given DSO user or candidate sees on their own
screens — **read-only**, fully audited, with zero risk of accidental writes,
masked-identity leaks, or EEO exposure.

## Verified architecture facts (read 2026-06-22)
- Auth is Supabase SSR via httpOnly cookies. `src/proxy.ts` (Next 16 "proxy",
  i.e. middleware) runs on every dynamic request and ends in
  `updateSupabaseSession(request)` — **this is the one authoritative server-side
  choke point** every request passes through.
- HMAC token pattern already exists and is the thing to reuse:
  `src/lib/notifications/unsubscribe-token.ts` (`createHmac` SHA-256 +
  `timingSafeEqual`, payload signed-not-encrypted).
- Masking / comp re-application primitives exist: `src/lib/candidate/anonymity.ts`
  (`anonymousDisplayLabel`, `getDsoAppliedCandidateIds`) and
  `src/lib/permissions/capabilities.ts` (`effectivePermissions`, `can(role,
  overrides, "comp.view")`). EEO lives in `application_eeo_responses` and is
  never to be rendered through impersonation, full stop.
- Platform audit sink: `recordAdminAudit()` → immutable `audit_log`
  (Phase 3). Never the DSO-scoped `audit_events`.

## The mechanism (recommended)
**Read-only render path — NOT a session swap.** The admin keeps their own auth
session throughout. A separate signed cookie marks an active impersonation.

1. **Cookie.** `dsohire_view_as`, value = base64url(JSON
   `{admin_user_id, target_type:"candidate"|"dso", target_id, started_at}`) + "." +
   HMAC-SHA256(payload, `IMPERSONATION_COOKIE_SECRET`). Flags: `httpOnly`,
   `Secure`, `SameSite=Strict`, `path=/`, **TTL ≤ 30 min** (both the cookie
   maxAge AND a `started_at` check on every read — belt and suspenders).
2. **Issuance.** `/admin/view-as/start` (server action): Tier-2 gate
   (`requireSuperadmin`), service-role ownership/existence check on the target,
   audit `admin.impersonation.start`, set cookie, redirect to the target surface.
3. **Verification.** A single helper `readImpersonation()` parses + HMAC-verifies
   (`timingSafeEqual`) + TTL-checks the cookie. A forged/expired/tampered cookie
   → treated as absent.
4. **Data scoping.** When a valid cookie is present, the request renders the
   target's screens with **the target's identity resolved server-side via
   service-role**, and the target's role/permissions re-applied in code:
   anonymity through `anonymity.ts` with the **target's** `dso_id`, comp through
   `can(targetRole, …, "comp.view")`. The founder sees precisely what the target
   sees. **EEO is never rendered**, even if the target role technically could.
5. **Mutation block (authoritative, server-side).** In `proxy.ts`, after a valid
   impersonation cookie is detected: **reject every write** — any request with
   method ∉ {GET, HEAD} or carrying the `Next-Action` header (server actions) —
   with a 403, EXCEPT the allow-listed exit endpoint. Log
   `admin.impersonation.mutation_blocked`. This is server-authoritative; hidden
   buttons are cosmetic only.
6. **UI.** A loud persistent banner ("Viewing as {target} — READ ONLY · Exit")
   with the real admin identity in a breadcrumb, on every impersonated page.
   `/admin/view-as/exit` clears the cookie + audits `admin.impersonation.end`.

## The one real design fork (need Cam's call)
**How the founder views the target's actual screens:**

- **Option A — identity override on the real (app) layouts (recommended).**
  The candidate `(app)` and employer `(app)` layouts already resolve "who am I"
  once at the top. Teach them: if a valid `view_as` cookie is present (and the
  real user is a Tier-2 founder), resolve identity to the **target** via
  service-role instead of the signed-in admin, and thread the target's
  role/dso/permissions downstream as today. The existing screens then render the
  target's data with all existing masking/comp logic applying naturally — no
  mirror, no drift. **Cost/risk:** edits two critical auth-resolution layouts;
  must be airtight (the mutation block + EEO-never are the guardrails).

- **Option B — dedicated read-only mirror routes** under `/admin/view-as/…`.
  Safer isolation (customer layouts untouched), but we'd re-render the target's
  key screens ourselves → more code + drift risk (mirrors fall behind the real
  UI). Narrower coverage.

**Recommendation: Option A**, candidate-side + employer-side, because the whole
point is "see *exactly* what they see," and A reuses the real, always-current
screens. The compliance risk is contained by the server-authoritative write
block + the EEO-never rule + the audit trail.

## Risks → mitigations
- Cookie tampering → HMAC + `timingSafeEqual`; fail-closed on any mismatch.
- Stale/forever sessions → maxAge + `started_at` TTL recheck (≤30 min).
- Accidental write → **server-side** block in `proxy.ts` (not a client flag);
  every blocked attempt audited.
- Masked-identity leak → anonymity re-applied with the **target's** dso_id, so
  the founder sees the same masking the target would.
- EEO exposure → never rendered through impersonation, unconditionally.
- Session confusion → banner + breadcrumb always show the real admin identity;
  Exit is one click.

## Env / new pieces (Phase 4.1, on approval)
- `IMPERSONATION_COOKIE_SECRET` (new env; Vercel + local).
- `src/lib/admin/impersonation.ts` (sign/verify/read helpers + constants).
- `/admin/view-as/start` + `/admin/view-as/exit` actions; banner component.
- `proxy.ts` write-guard + the chosen layout integration (Option A).
- Audit kinds already defined in `src/lib/admin/audit.ts`.

---
**PAUSE — awaiting Cam's approval of (1) the mechanism and (2) Option A vs B
before building Phase 4.1.**
