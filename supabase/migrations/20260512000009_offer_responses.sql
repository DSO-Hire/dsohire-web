-- ─────────────────────────────────────────────────────────────────────
-- 20260512000009_offer_responses.sql
--
-- Track E completion — candidate-side Accept / Decline flow.
--
-- The send half shipped in 20260512000004_offer_letters.sql. This
-- migration adds:
--
--   1. `token` (text, unique-when-set) on application_offer_sends so
--      each send carries an opaque token we embed in the candidate
--      email's CTA link. Mirrors the reference_requests.token pattern
--      used for /r/[token].
--
--   2. `application_offer_responses` — one row per response per send.
--      Captures response kind (accepted/declined), optional decline
--      reason, candidate-typed signed_name (soft-sig), responded_at,
--      ip, user_agent. UNIQUE(offer_send_id) so a send can be answered
--      exactly once.
--
-- RLS posture:
--   • DSO read on responses through application → job → dso_id.
--   • No INSERT / UPDATE / DELETE policies — the public response page
--     writes via service-role (token is the authorization).
--
-- Why a soft-sig column now: candidates in legal-defensible offer
-- accept flows are expected to type their full legal name as
-- acknowledgement. We capture it as text now; full e-sig integration
-- (DocuSign/HelloSign) lands in Phase 6+ as a Growth-tier differentiator.
-- ─────────────────────────────────────────────────────────────────────

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Token on application_offer_sends
--
-- Nullable so historical rows (sent before this migration) don't need
-- a backfill — they remain tokenless and the candidate-side flow will
-- simply not surface a response page for them. The send action will
-- generate a fresh 24-byte base64url token on every new insert from
-- here forward.
-- ═════════════════════════════════════════════════════════════════════════

alter table public.application_offer_sends
  add column if not exists token text;

-- Unique when set. A null token is fine (legacy rows); a present token
-- must be one-to-one with its send row. Partial unique index over the
-- non-null subset gets us both properties in one constraint.
create unique index if not exists application_offer_sends_token_uidx
  on public.application_offer_sends (token)
  where token is not null;

comment on column public.application_offer_sends.token is
  'Opaque base64url token (24 bytes / 32 chars) embedded in the candidate'
  '''s offer email. Possession of the token authorizes accept/decline '
  'on /o/[token]. Nullable for legacy rows; one-to-one with rows that '
  'have it.';


-- ═════════════════════════════════════════════════════════════════════════
-- 2. application_offer_responses
--
-- One row per response per send. The UNIQUE(offer_send_id) constraint
-- means a candidate can't accept-then-decline (or vice versa) by
-- replaying the email's CTA — if they want to change their mind they
-- have to reach out and ask the employer to re-send. This mirrors how
-- Greenhouse/Lever model offer responses: response is terminal, not
-- editable.
-- ═════════════════════════════════════════════════════════════════════════

create table public.application_offer_responses (
  id                    uuid primary key default gen_random_uuid(),
  offer_send_id         uuid not null
                          references public.application_offer_sends(id)
                          on delete cascade,
  application_id        uuid not null
                          references public.applications(id)
                          on delete cascade,
  response              text not null
                          check (response in ('accepted', 'declined')),
  reason                text,
  signed_name           text,
  ip                    text,
  user_agent            text,
  responded_at          timestamptz not null default now(),
  created_at            timestamptz not null default now()
);

-- One response per send. Possession of the token = right to record
-- exactly one terminal response. Re-clicks on the email CTA after a
-- response is recorded land on the read-only "already responded" view.
create unique index application_offer_responses_send_uidx
  on public.application_offer_responses (offer_send_id);

-- Read pattern: most recent response per application for the employer
-- detail page's OfferSection ("Accepted on May 12 at 3:42pm").
create index application_offer_responses_application_idx
  on public.application_offer_responses (application_id, responded_at desc);

alter table public.application_offer_responses enable row level security;

-- DSO members read responses for offer-sends on their own jobs. Joins
-- offer_send → application → job → dso match. Mirrors the
-- application_offer_sends read policy.
create policy "Offer responses: DSO read own"
  on public.application_offer_responses for select
  to authenticated
  using (
    exists (
      select 1
      from public.application_offer_sends s
      join public.applications a on a.id = s.application_id
      join public.jobs j on j.id = a.job_id
      where s.id = application_offer_responses.offer_send_id
        and j.dso_id = public.current_dso_id()
    )
  );

-- No INSERT / UPDATE / DELETE policies. The /o/[token] route writes via
-- service-role: the token is the authorization. Keeping the table
-- read-only-via-RLS prevents authenticated-but-unrelated parties from
-- forging responses by bypassing the token path.

grant select on public.application_offer_responses to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────
-- Post-apply: regenerate src/lib/supabase/database.types.ts or hand-
-- patch in the application_offer_responses Row/Insert/Update +
-- application_offer_sends.token additions.
-- ─────────────────────────────────────────────────────────────────────
