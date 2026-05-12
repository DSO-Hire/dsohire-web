-- ─────────────────────────────────────────────────────────────────────
-- 20260512000003_reference_requests.sql
--
-- Track D — Reference Check Workflow (Phase 5A).
--
-- DSOs collect 2-3 professional references on a candidate once the
-- application has moved past the screen stage. Each reference contact
-- gets a unique opaque token + a public no-auth URL where they fill
-- out a short structured form. Submissions appear inline on the
-- application detail page.
--
-- Single transaction. No enum extensions — `status` uses a CHECK
-- constraint per feedback_postgres_enum_two_transactions.md. The
-- `response_data` jsonb keeps the 7-question shape flexible without a
-- schema change when we tweak v1 → v2 fields.
--
-- Public route posture:
--   • The reference themselves has NO auth. Their reads + writes go
--     through service-role in the app handler, gated on the token
--     matching an actual row. We do NOT add an anon RLS policy here.
--   • Employer-side reads + writes go through the standard
--     authenticated client. RLS scopes by the application→job→dso
--     join + current_dso_id() / current_dso_user_role() helpers.
-- ─────────────────────────────────────────────────────────────────────

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. reference_requests
-- ═════════════════════════════════════════════════════════════════════════

create table public.reference_requests (
  id                       uuid primary key default gen_random_uuid(),
  application_id           uuid not null references public.applications(id) on delete cascade,
  candidate_id             uuid not null references public.candidates(id) on delete cascade,
  -- requested_by stays nullable so an employer leaving the DSO doesn't
  -- nuke the audit history. ON DELETE SET NULL preserves the row when
  -- the auth user is later deleted.
  requested_by_user_id     uuid references auth.users(id) on delete set null,

  reference_name           text not null,
  reference_email          text not null,
  reference_role           text,
  relationship             text,

  -- Opaque URL-safe id. Generated server-side via crypto.randomBytes —
  -- the column-level default below is the in-DB fallback for SQL-only
  -- inserts (e.g., a future bulk import path).
  token                    text not null unique
    default encode(gen_random_bytes(24), 'base64'),

  status                   text not null default 'pending',
  sent_at                  timestamptz,
  completed_at             timestamptz,
  response_data            jsonb,
  decline_reason           text,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint reference_requests_status_check check (status in (
    'pending',
    'sent',
    'completed',
    'declined'
  ))
);

-- Strip the +/= chars the SQL fallback default emits so the token is
-- URL-safe (the app-side generator already uses base64url; this only
-- normalizes the rare SQL-only insert path).
alter table public.reference_requests
  alter column token set default replace(replace(replace(
    encode(gen_random_bytes(24), 'base64'),
    '+', '-'),
    '/', '_'),
    '=', '');

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Indexes
-- ═════════════════════════════════════════════════════════════════════════

-- Primary read on the application detail page.
create index reference_requests_application_idx
  on public.reference_requests (application_id, created_at desc);

-- Partial index over active tokens — the public /r/[token] route does a
-- constant-time lookup that skips declined rows. The `unique` on token
-- already creates a btree, this is an additional partial for the
-- exclude-declined common path. Cost is small (declined rows are rare).
create index reference_requests_active_token_idx
  on public.reference_requests (token)
  where status <> 'declined';

-- Candidate's own "references on file" view (post-launch follow-up).
create index reference_requests_candidate_idx
  on public.reference_requests (candidate_id);

-- ═════════════════════════════════════════════════════════════════════════
-- 3. updated_at trigger
-- ═════════════════════════════════════════════════════════════════════════

create trigger reference_requests_set_updated_at
  before update on public.reference_requests
  for each row execute function public.set_updated_at();

-- ═════════════════════════════════════════════════════════════════════════
-- 4. RLS
--
-- Employer-only. The reference's public route uses the service-role
-- client in the app handler — no anon policy here.
-- ═════════════════════════════════════════════════════════════════════════

alter table public.reference_requests enable row level security;

-- DSO members can SELECT reference rows on any application that belongs
-- to a job in their DSO.
create policy "References: DSO read own"
  on public.reference_requests for select
  using (
    exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      where a.id = reference_requests.application_id
        and j.dso_id = public.current_dso_id()
    )
  );

-- DSO members in the owner/admin/recruiter roles can INSERT.
create policy "References: DSO insert own"
  on public.reference_requests for insert
  with check (
    public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
    and exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      where a.id = reference_requests.application_id
        and j.dso_id = public.current_dso_id()
    )
  );

-- DSO members in the owner/admin/recruiter roles can UPDATE (resend,
-- mark declined). The reference's own submission goes through the
-- service-role client from the public route.
create policy "References: DSO update own"
  on public.reference_requests for update
  using (
    public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
    and exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      where a.id = reference_requests.application_id
        and j.dso_id = public.current_dso_id()
    )
  )
  with check (
    public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
    and exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      where a.id = reference_requests.application_id
        and j.dso_id = public.current_dso_id()
    )
  );

-- DSO members in the owner/admin/recruiter roles can DELETE.
create policy "References: DSO delete own"
  on public.reference_requests for delete
  using (
    public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
    and exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      where a.id = reference_requests.application_id
        and j.dso_id = public.current_dso_id()
    )
  );

-- ═════════════════════════════════════════════════════════════════════════
-- 5. Grants
-- ═════════════════════════════════════════════════════════════════════════

grant select, insert, update, delete on public.reference_requests to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────
-- Post-apply: hand-patch src/lib/supabase/database.types.ts to add the
-- reference_requests table type. Row/Insert/Update/Relationships follow
-- the standard generated pattern.
-- ─────────────────────────────────────────────────────────────────────
