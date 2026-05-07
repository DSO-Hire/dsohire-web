-- ─────────────────────────────────────────────────────────────────────────
-- 20260507000001_phase_4_3_completions.sql
--
-- Phase 4.3 candidate Settings completions (parity sprint).
-- Canonical scope: Competitive Research/Parity_Sprint_Scope_2026-05-06.md §4.3
--
-- Closes the candidate-side Settings IA by shipping schema for the three
-- 4.3 sub-tabs that weren't finished on 2026-05-06:
--
--   1. Phase 4.3.a (Account) — `pending_email_changes` table for the
--      OTP-first email-change flow Cam locked. Replaces the Supabase
--      magic-link updateUser flow that was wired in v1; that flow used
--      a magic link rather than a 6-digit OTP and didn't notify the
--      OLD email address. This table holds the pending change + hashed
--      OTP until the candidate verifies it.
--
--   2. Phase 4.3.c (Job preferences) — adds two columns to candidates
--      that the new Settings → Job Preferences tab needs:
--        - license_states text[] — multi-select chip from a 50-state
--          combobox; powers "show me jobs in states I'm licensed in"
--          matching. Denormalized from candidate_licenses.state for
--          query speed (the Talent Pool browse + job search filter
--          read this directly without joining licenses).
--        - dso_size_preference text — 'small' | 'mid' | 'large' | 'any'
--          + CHECK constraint. Lets candidates indicate they prefer
--          small DSOs (1-9 practices) vs mid (10-49) vs large (50+).
--
--      All other job-pref columns (desired_roles, desired_specialty,
--      desired_locations, min_salary, salary_unit, schedule_preferences,
--      temp_or_perm, cv_visibility) already shipped in 4.2.a — this
--      migration just adds the two missing matching fields.
--
--   3. Phase 4.3.e (Credentials → CE tracking) — `ce_certificates`
--      table + private storage bucket. Replaces the "coming soon" stub
--      on /candidate/settings/credentials with a real CE entry surface.
--      State-specific CE-requirement lookup (e.g. "you have 12 of 24
--      required hours for KS RDH renewal") is deferred to a follow-up
--      that needs a state_ce_requirements table; v1 ships generic
--      hours-tracking + file uploads + DSO-after-apply read access.
--
-- ─────────────────────────────────────────────────────────────────────
-- Postgres-enum-two-transaction rule: this migration touches NO enums,
-- so it's safe in a single transaction. CHECK constraints are used
-- for `dso_size_preference` per the same pattern as Phase 4.3.d's
-- privacy CHECKs (avoids the two-transaction split + lets us extend
-- the allowed values without a schema migration).
-- ─────────────────────────────────────────────────────────────────────

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Phase 4.3.a — pending_email_changes
--
-- The OTP-first email-change flow:
--   1. Candidate submits a new email on /candidate/settings/account.
--   2. Server action generates a 6-digit OTP, hashes it (SHA-256 hex),
--      inserts a row here with expires_at = now() + 15 minutes.
--   3. Server action emails the OTP to the NEW address (Resend).
--   4. Server action emails a "this wasn't me" link to the OLD address
--      that, when clicked, deletes the row before it can be consumed.
--   5. Candidate enters the 6-digit code; server action looks up the
--      latest unconsumed row matching candidate_user_id + the hash of
--      the entered code, marks it consumed, and uses the service-role
--      auth admin client to update auth.users.email atomically.
--
-- Hash (not raw OTP) is stored so a database leak doesn't expose codes.
-- expires_at is enforced at read time (server action filters
-- expires_at > now()); a periodic cleanup job (future) can hard-delete
-- expired rows.
-- ═════════════════════════════════════════════════════════════════════════

create table public.pending_email_changes (
  id                      uuid primary key default gen_random_uuid(),
  -- The auth.users.id of the candidate requesting the change.
  -- We don't FK to auth.users (cross-schema FKs are awkward in Supabase);
  -- consume-time check verifies the row's auth user matches auth.uid().
  candidate_user_id       uuid not null,
  new_email               text not null,
  -- SHA-256 hex digest of the 6-digit OTP. Never store the raw code.
  otp_code_hash           text not null,
  -- 15-minute window from issue. Server action enforces.
  expires_at              timestamptz not null,
  -- Set when the OTP is successfully verified + auth row updated.
  consumed_at             timestamptz,
  -- Set when the "this wasn't me" link was clicked + the row revoked.
  revoked_at              timestamptz,
  -- Did we successfully send the heads-up to the OLD email address?
  -- Tracked so we can retry if Resend transiently fails.
  old_email_notified_at   timestamptz,
  created_at              timestamptz not null default now()
);

create index pending_email_changes_user_idx
  on public.pending_email_changes (candidate_user_id, created_at desc);

-- Used by the "this wasn't me" revoke link — the link carries the row
-- ID; the handler validates the link's signature, then sets revoked_at.
create index pending_email_changes_revocation_idx
  on public.pending_email_changes (id)
  where consumed_at is null and revoked_at is null;

alter table public.pending_email_changes enable row level security;

-- Candidate can SELECT + INSERT + UPDATE their own pending rows. They
-- cannot DELETE — we never permanently destroy these (revoke or expire
-- + cron cleanup instead) so we keep the audit trail for security
-- review. The `with check` clause ensures candidate_user_id stays
-- matched to the calling user on inserts/updates.
create policy "Candidates manage own pending email changes"
  on public.pending_email_changes for all
  to authenticated
  using (candidate_user_id = auth.uid())
  with check (candidate_user_id = auth.uid());

grant select, insert, update on public.pending_email_changes to authenticated;


-- ═════════════════════════════════════════════════════════════════════════
-- 2. Phase 4.3.c — candidates additions for Settings → Job Preferences
-- ═════════════════════════════════════════════════════════════════════════

alter table public.candidates
  add column if not exists license_states         text[] not null default '{}'::text[],
  add column if not exists dso_size_preference    text;

-- CHECK constraint on dso_size_preference (drop-and-add for rerunnability).
-- Allowed values:
--   small = 1-9 practices
--   mid   = 10-49 practices
--   large = 50+ practices
--   any   = explicit "any size" — distinct from null (no preference set)
alter table public.candidates
  drop constraint if exists candidates_dso_size_preference_check;
alter table public.candidates
  add constraint candidates_dso_size_preference_check
  check (
    dso_size_preference is null
    or dso_size_preference in ('small', 'mid', 'large', 'any')
  );

-- Index on license_states for the future Talent Pool license-state
-- filter ("show me hygienists licensed in TX"). GIN since it's an array.
create index if not exists candidates_license_states_gin_idx
  on public.candidates using gin (license_states)
  where array_length(license_states, 1) > 0;


-- ═════════════════════════════════════════════════════════════════════════
-- 3. Phase 4.3.e — ce_certificates table
--
-- v1 schema covers the shape of a CE entry:
--   • course_name        text NOT NULL
--   • provider           text — e.g. "AGD PACE", "CE Zoom", "ADA"
--   • hours_credit       numeric(4,1) NOT NULL — supports 0.5-hr increments
--   • category           text — free-text v1 (e.g. "implants", "endo");
--                          a canonical-list v2 ships when state-requirement
--                          tracking lands
--   • completion_date    date NOT NULL
--   • license_type       text — optional pointer to which license type
--                          (DDS/RDH/CDA) this CE counts toward; nullable
--                          so candidates can record CE that's not tied
--                          to one specific license
--   • file_path          text — storage path inside ce_certificates bucket;
--                          nullable so candidates can log CE without
--                          uploading the cert
--   • file_size_bytes    int — captured at upload time for the 10MB
--                          per-file cap (10 * 1024 * 1024 = 10485760)
--
-- App-level rules enforced by server actions, not schema:
--   • 50 CE certificates per candidate cap (count check on insert)
--   • 10MB per file cap (the bucket itself enforces this too)
-- ═════════════════════════════════════════════════════════════════════════

create table public.ce_certificates (
  id                uuid primary key default gen_random_uuid(),
  candidate_id      uuid not null references public.candidates(id) on delete cascade,
  course_name       text not null,
  provider          text,
  hours_credit      numeric(4, 1) not null check (hours_credit > 0 and hours_credit <= 100),
  category          text,
  completion_date   date not null,
  license_type      text,
  file_path         text,
  file_size_bytes   int  check (file_size_bytes is null or (file_size_bytes > 0 and file_size_bytes <= 10485760)),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger ce_certificates_set_updated_at
  before update on public.ce_certificates
  for each row execute function public.set_updated_at();

create index ce_certificates_candidate_idx
  on public.ce_certificates (candidate_id, completion_date desc);

alter table public.ce_certificates enable row level security;

-- Candidate full RW their own CE entries.
create policy "Candidates manage own CE certificates"
  on public.ce_certificates for all
  to authenticated
  using (
    candidate_id in (
      select id from public.candidates where auth_user_id = auth.uid()
    )
  )
  with check (
    candidate_id in (
      select id from public.candidates where auth_user_id = auth.uid()
    )
  );

-- DSO members read CE entries from candidates who have applied to a
-- job at their DSO. Reuses the SECURITY DEFINER helper from
-- 20260506000009 — the helper bypasses RLS internally so no recursion
-- through applications RLS (memory: feedback_storage_policy_implicit_table_rls).
create policy "DSO members read applicant CE certificates"
  on public.ce_certificates for select
  to authenticated
  using (public.dso_can_read_candidate(candidate_id));

grant select, insert, update, delete on public.ce_certificates to authenticated;


-- ═════════════════════════════════════════════════════════════════════════
-- 4. Phase 4.3.e — ce_certificates storage bucket + policies
--
-- Mirrors the resumes-bucket pattern from 20260501000003 step-for-step:
--   • Private bucket (public = false)
--   • 10MB per-file cap enforced by storage layer
--   • PDF + common image MIME types
--   • Candidate uploads to their own auth.uid()-named folder
--   • Candidate full RW + DSO read-after-application
--
-- The DSO read policy uses the same EXISTS pattern as resumes (joins to
-- candidates → applications → jobs → dso). It does NOT need the SECURITY
-- DEFINER wrapper because:
--   • storage.objects RLS doesn't have a recursive policy through these
--     tables (no policy on jobs queries storage.objects)
--   • candidates RLS is now scope-aware via dso_can_read_candidate, so
--     the inner candidates JOIN here is itself RLS-checked safely.
-- The pattern matches what's already shipping for resumes; if either
-- ever grows recursion, both fixes apply together.
-- ═════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ce_certificates',
  'ce_certificates',
  false,
  10485760, -- 10 MB
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Drop any pre-existing storage policies so this migration is rerunnable.
drop policy if exists "CE certs: candidate upload own folder" on storage.objects;
drop policy if exists "CE certs: candidate read own folder"   on storage.objects;
drop policy if exists "CE certs: candidate update own folder" on storage.objects;
drop policy if exists "CE certs: candidate delete own folder" on storage.objects;
drop policy if exists "CE certs: DSO read application certs"  on storage.objects;

-- Candidate: upload to their own folder (auth.uid()-prefixed path).
create policy "CE certs: candidate upload own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'ce_certificates'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Candidate: read their own folder.
create policy "CE certs: candidate read own folder"
  on storage.objects for select
  using (
    bucket_id = 'ce_certificates'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Candidate: replace files in their own folder.
create policy "CE certs: candidate update own folder"
  on storage.objects for update
  using (
    bucket_id = 'ce_certificates'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Candidate: delete files in their own folder.
create policy "CE certs: candidate delete own folder"
  on storage.objects for delete
  using (
    bucket_id = 'ce_certificates'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- DSO: read CE certs from candidates who applied to a job in their DSO.
-- Mirrors the resumes "DSO read application resumes" policy.
create policy "CE certs: DSO read application certs"
  on storage.objects for select
  using (
    bucket_id = 'ce_certificates'
    and exists (
      select 1
        from public.candidates c
        join public.applications a on a.candidate_id = c.id
        join public.jobs j on j.id = a.job_id
       where c.auth_user_id::text = (storage.foldername(storage.objects.name))[1]
         and j.dso_id = public.current_dso_id()
    )
  );

commit;

-- ─────────────────────────────────────────────────────────────────────
-- End of Phase 4.3 completions migration. Apply via Supabase SQL Editor —
-- single transaction, no enum split.
--
-- After applying, hand-patch src/types/database.types.ts to add:
--   • pending_email_changes Row/Insert/Update/Relationships
--   • ce_certificates       Row/Insert/Update/Relationships
--   • candidates Row.license_states          string[]
--   • candidates Row.dso_size_preference     string | null
-- ─────────────────────────────────────────────────────────────────────
