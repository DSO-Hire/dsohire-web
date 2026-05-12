-- ─────────────────────────────────────────────────────────────────────
-- 20260512000004_offer_letters.sql
--
-- Track E — Offer Letter Library (Phase 5A).
--
-- DSOs maintain a per-DSO library of offer-letter templates. When an
-- application reaches the `offer` stage kind, the recruiter picks a
-- template, fills the per-offer merge values (start_date, comp, etc.),
-- previews, and sends. The send creates a permanent
-- application_offer_sends row with a snapshot of the rendered HTML —
-- so the legal record of what was sent survives template edits or
-- archival.
--
-- Single transaction. No Postgres enums (CHECK constraints / text only
-- per feedback_postgres_enum_two_transactions.md). Tier-gating: offer
-- letters are on every paying tier (per Cam's prior locks); RLS is
-- DSO + role only.
-- ─────────────────────────────────────────────────────────────────────

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. dso_offer_letter_templates — per-DSO template library
--
-- `body` is markdown with `{{merge}}` placeholders. The app pre-renders
-- to HTML at send time and snapshots the result into
-- application_offer_sends.body_html (see below).
--
-- `is_archived` soft-deletes a template so historic sends keep a
-- readable link to "the template this came from" even after a DSO
-- decides to retire the template.
-- ═════════════════════════════════════════════════════════════════════════

create table public.dso_offer_letter_templates (
  id                    uuid primary key default gen_random_uuid(),
  dso_id                uuid not null references public.dsos(id) on delete cascade,
  name                  text not null,
  body                  text not null,
  is_archived           boolean not null default false,
  created_by_user_id    uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Primary read pattern: list active templates first, then by recency,
-- on the settings page + the "pick a template" dropdown.
create index dso_offer_letter_templates_dso_idx
  on public.dso_offer_letter_templates (dso_id, is_archived, updated_at desc);

create trigger dso_offer_letter_templates_set_updated_at
  before update on public.dso_offer_letter_templates
  for each row execute function public.set_updated_at();

alter table public.dso_offer_letter_templates enable row level security;

-- DSO members read their DSO's templates (recruiters need read access
-- to pick a template at send time; only admins/owners can edit).
create policy "Offer letters: DSO read"
  on public.dso_offer_letter_templates for select
  to authenticated
  using (dso_id = public.current_dso_id());

-- DSO owners/admins can mutate. Recruiters are read-only on the library
-- (they pick templates at send time but don't shape the catalog).
create policy "Offer letters: DSO admin write"
  on public.dso_offer_letter_templates for all
  to authenticated
  using (
    dso_id = public.current_dso_id()
    and public.current_dso_user_role() in ('owner', 'admin')
  )
  with check (
    dso_id = public.current_dso_id()
    and public.current_dso_user_role() in ('owner', 'admin')
  );

grant select, insert, update, delete on public.dso_offer_letter_templates to authenticated;


-- ═════════════════════════════════════════════════════════════════════════
-- 2. application_offer_sends — immutable audit trail of every offer sent
--
-- We snapshot subject + recipient_email + fully-rendered body_html so
-- the historical record survives template edits, archival, candidate
-- record changes, or DSO renames. This is the legal record of "what
-- the candidate actually received."
--
-- merge_values jsonb captures the per-offer fields the sender filled
-- (start_date, compensation, signing_bonus, etc.) for analytics + a
-- future "re-send same offer" affordance.
--
-- No UPDATE / DELETE on these rows from the authenticated client —
-- INSERT happens via the service-role from the sendOffer action so
-- the audit trail stays clean. Hence no INSERT/UPDATE/DELETE RLS
-- policies here.
-- ═════════════════════════════════════════════════════════════════════════

create table public.application_offer_sends (
  id                    uuid primary key default gen_random_uuid(),
  application_id        uuid not null references public.applications(id) on delete cascade,
  -- template_id stays nullable on delete so archiving/deleting a
  -- template doesn't nuke historic sends.
  template_id           uuid references public.dso_offer_letter_templates(id) on delete set null,
  sent_by_user_id       uuid references auth.users(id) on delete set null,
  recipient_email       text not null,
  subject               text not null,
  body_html             text not null,
  merge_values          jsonb not null default '{}'::jsonb,
  sent_at               timestamptz not null default now(),
  created_at            timestamptz not null default now()
);

-- Primary read pattern: most recent offer per application (the
-- application detail page renders the latest, plus historic).
create index application_offer_sends_application_idx
  on public.application_offer_sends (application_id, sent_at desc);

alter table public.application_offer_sends enable row level security;

-- DSO members can SELECT offer-send rows on any application that
-- belongs to a job in their DSO. Subquery-EXISTS join through
-- applications → jobs mirrors the reference_requests pattern.
create policy "Offer sends: DSO read own"
  on public.application_offer_sends for select
  to authenticated
  using (
    exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      where a.id = application_offer_sends.application_id
        and j.dso_id = public.current_dso_id()
    )
  );

-- No INSERT / UPDATE / DELETE policies — the sendOffer server action
-- writes via service-role for the audit-trail-integrity reason above.
-- Candidate read is intentionally not added: the email itself is the
-- canonical delivery; a "view past offers" page can land later.

grant select on public.application_offer_sends to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────
-- Post-apply: hand-patch src/lib/supabase/database.types.ts to add the
-- dso_offer_letter_templates + application_offer_sends table types.
-- Row/Insert/Update/Relationships follow the standard generated pattern.
-- ─────────────────────────────────────────────────────────────────────
