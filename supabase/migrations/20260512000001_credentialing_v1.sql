-- ─────────────────────────────────────────────────────────────────────
-- 20260512000001_credentialing_v1.sql
--
-- Phase 5B — Credentialing v1.
--
-- The candidate_licenses + candidate_certifications tables shipped in
-- Phase 4.1 with a flat `verified boolean` flag and a `file_url text`
-- column that was a placeholder for a deferred storage bucket. Today
-- we promote both surfaces to a real, employer-visible credentialing
-- workflow:
--
--   1. Replace `verified boolean` with `verification_status` text +
--      CHECK constraint over the canonical lifecycle:
--         unverified | pending | verified | expired | revoked
--      Plus `verified_at timestamptz` and `verified_by_user_id uuid`
--      so we can show "Verified by Sara on May 12" on the employer
--      side. The CHECK pattern (not Postgres ENUM) keeps this in one
--      transaction per `feedback_postgres_enum_two_transactions.md`.
--
--   2. Add `document_path text` to both tables. Distinct from the
--      existing `file_url` (which was earmarked for external URLs
--      like a state-board portal). `document_path` is the storage
--      key inside the new `candidate-credentials` bucket. UI prefers
--      `document_path` when present.
--
--   3. Ship the deferred `candidate-credentials` private storage
--      bucket with the standard RLS pattern (candidate RW own folder
--      + DSO read via application linkage). Mirrors the ce_certificates
--      bucket from 20260507000001 step-for-step.
--
-- ─────────────────────────────────────────────────────────────────────
-- DEA registration is intentionally NOT captured (Phase 4.1 R1).
-- That posture stays; this migration does not add DEA columns.
--
-- Malpractice insurance lands as a new value in the canonical
-- CERTIFICATION_KINDS app-level list (src/lib/candidate/canonical-lists.ts)
-- + uses the existing candidate_certifications shape (kind +
-- level + expires_date + document_path). A dedicated insurance
-- table is overkill for v1; revisit if we ever need to track
-- carrier name + policy number + coverage amounts as structured fields.
--
-- ─────────────────────────────────────────────────────────────────────

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. candidate_licenses — promote verified flag + add document_path
-- ═════════════════════════════════════════════════════════════════════════

alter table public.candidate_licenses
  add column if not exists verification_status   text not null default 'unverified',
  add column if not exists verified_at           timestamptz,
  add column if not exists verified_by_user_id   uuid references auth.users(id) on delete set null,
  add column if not exists document_path         text;

-- Backfill: rows that had the old `verified = true` flag carry over.
-- updated_at is the closest signal we have for "when was this marked
-- verified" so we use it as the verified_at backfill.
update public.candidate_licenses
   set verification_status = 'verified',
       verified_at         = coalesce(verified_at, updated_at, now())
 where verified = true
   and verification_status = 'unverified';

-- Drop the now-redundant boolean. No live data downstream depends on it
-- (verification UX was a stub); the new status column is the source of
-- truth from here on.
alter table public.candidate_licenses
  drop column if exists verified;

-- CHECK constraint over the lifecycle (drop-and-add for rerunnability).
alter table public.candidate_licenses
  drop constraint if exists candidate_licenses_verification_status_check;
alter table public.candidate_licenses
  add constraint candidate_licenses_verification_status_check
  check (verification_status in (
    'unverified',
    'pending',
    'verified',
    'expired',
    'revoked'
  ));


-- ═════════════════════════════════════════════════════════════════════════
-- 2. candidate_certifications — same promotion shape
-- ═════════════════════════════════════════════════════════════════════════

alter table public.candidate_certifications
  add column if not exists verification_status   text not null default 'unverified',
  add column if not exists verified_at           timestamptz,
  add column if not exists verified_by_user_id   uuid references auth.users(id) on delete set null,
  add column if not exists document_path         text;

-- Note: candidate_certifications never carried a `verified` boolean
-- in its original Phase 4.1 schema (only candidate_licenses did).
-- No backfill needed here; every existing row stays at the
-- default 'unverified' status.

alter table public.candidate_certifications
  drop constraint if exists candidate_certifications_verification_status_check;
alter table public.candidate_certifications
  add constraint candidate_certifications_verification_status_check
  check (verification_status in (
    'unverified',
    'pending',
    'verified',
    'expired',
    'revoked'
  ));


-- ═════════════════════════════════════════════════════════════════════════
-- 3. candidate-credentials storage bucket + policies
--
-- Mirrors ce_certificates bucket from 20260507000001 step-for-step:
--   • Private (public = false)
--   • 10MB per-file cap (10 * 1024 * 1024 = 10485760)
--   • PDF + common image MIME types
--   • Candidate uploads to their own auth.uid()-prefixed folder
--   • DSO members read via application linkage (joins through
--     candidates → applications → jobs → dso, with public.current_dso_id())
-- ═════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-credentials',
  'candidate-credentials',
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
drop policy if exists "Credentials: candidate upload own folder" on storage.objects;
drop policy if exists "Credentials: candidate read own folder"   on storage.objects;
drop policy if exists "Credentials: candidate update own folder" on storage.objects;
drop policy if exists "Credentials: candidate delete own folder" on storage.objects;
drop policy if exists "Credentials: DSO read application docs"   on storage.objects;

-- Candidate: upload to their own folder (auth.uid()-prefixed path).
create policy "Credentials: candidate upload own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'candidate-credentials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Candidate: read their own folder.
create policy "Credentials: candidate read own folder"
  on storage.objects for select
  using (
    bucket_id = 'candidate-credentials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Candidate: replace files in their own folder.
create policy "Credentials: candidate update own folder"
  on storage.objects for update
  using (
    bucket_id = 'candidate-credentials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Candidate: delete files in their own folder.
create policy "Credentials: candidate delete own folder"
  on storage.objects for delete
  using (
    bucket_id = 'candidate-credentials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- DSO: read credential docs from candidates who applied to a job in their DSO.
-- Mirrors the resumes "DSO read application resumes" policy.
create policy "Credentials: DSO read application docs"
  on storage.objects for select
  using (
    bucket_id = 'candidate-credentials'
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
-- End of credentialing v1 migration. Single transaction; safe to run as
-- a single click in the Supabase SQL Editor.
--
-- Post-apply: hand-patch src/types/database.types.ts:
--   • candidate_licenses Row.verified                drop
--   • candidate_licenses Row.verification_status     string
--   • candidate_licenses Row.verified_at             string | null
--   • candidate_licenses Row.verified_by_user_id     string | null
--   • candidate_licenses Row.document_path           string | null
--   • Same five edits on candidate_certifications Row/Insert/Update
-- ─────────────────────────────────────────────────────────────────────
