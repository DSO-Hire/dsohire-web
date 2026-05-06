-- ─────────────────────────────────────────────────────────────────────────
-- 20260506000001_phase_4_1_foundation.sql
--
-- Phase 4.1 of the Parity Sprint (LOCKED 2026-05-06).
-- Canonical scope: Competitive Research/Parity_Sprint_Scope_2026-05-06.md
--
-- This migration delivers the foundation primitives that every downstream
-- surface in the sprint depends on:
--
--   1. Notification orchestration (4.1.b) — preferences + dispatch log +
--      templates registry. New dispatchNotification() server action will
--      consume these.
--
--   2. Candidate structured profile tables (lays the schema 4.1.c writes
--      into and 4.2 builds on top of):
--        - candidate_work_history
--        - candidate_education
--        - candidate_licenses
--        - candidate_certifications
--
--   3. Resume parser cache (4.1.c) — adds parsed_resume_json + last_parsed_at
--      to candidates so a parsed resume is reusable across sessions.
--
--   4. AI usage events feature CHECK extended for the three new AI features
--      this sprint adds: resume_parse, profile_headline, profile_summary.
--
--   5. Storage bucket `public-images` for the <ImageUpload> primitive
--      (4.1.a). Used by candidate photos, teammate avatars, DSO logos +
--      banners, and future DSO photos.
--
-- DEFERRED to follow-on migrations (still in §7 of the scope doc):
--   • application_status enum extensions (`withdrawn`, `*_self_reported`,
--     `no_longer_interested`) — Phase 4.4 My Applications migration.
--   • candidate_visibility / notification_channel enums — Phase 4.2 / 4.3.
--   • dso_profiles, audit_events, saved_jobs, saved_searches,
--     application_candidate_notes, application_withdraw_reasons,
--     application_voice_memos, team_member_credentials, ce_events —
--     each lands with the surface that needs it.
--   • candidate-credentials + dso-assets storage buckets — Phase 4.3.e
--     and Phase 4.5.c respectively.
--
-- POSTGRES GOTCHA reminder (lesson learned 2026-05-05): ALTER TYPE
-- ADD VALUE and any code referencing the new value must be in separate
-- transactions. THIS MIGRATION DOES NOT EXTEND ANY ENUMS — every change
-- here is either a new table, a new column, a CHECK-constraint swap, or a
-- storage bucket. Safe to run as a single transaction. Future migrations
-- in this sprint that touch enums will follow the _step1 / _step2 pattern.
--
-- ─────────────────────────────────────────────────────────────────────────

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Notification orchestration (4.1.b)
-- ═════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1a. notification_preferences
--
-- Per-user, per-event-kind, per-channel toggles. The orchestration layer
-- reads this table on every dispatchNotification() call. Sensible defaults
-- live in code, not in the schema — if a row doesn't exist for a given
-- (user_id, event_kind, channel), the dispatcher falls back to the
-- per-event default in src/lib/notifications/defaults.ts.
--
-- event_kind is a free-form text key (e.g., 'application_received',
-- 'comment_mention', 'stage_changed', 'job_alert_match', 'newsletter').
-- We don't tie it to an enum so we can ship new event kinds without a
-- schema migration; the orchestration layer's template registry is the
-- canonical list of valid kinds.
--
-- channel is also free-form for the same reason ('email', 'in_app',
-- 'sms'); enforced at the application layer.
-- ─────────────────────────────────────────────────────────────────────

create table public.notification_preferences (
  user_id     uuid not null references auth.users(id) on delete cascade,
  event_kind  text not null,
  channel     text not null check (channel in ('email', 'in_app', 'sms')),
  enabled     boolean not null default true,
  -- 'instant' | 'daily_digest' | 'weekly_digest' | 'off'
  frequency   text not null default 'instant'
    check (frequency in ('instant', 'daily_digest', 'weekly_digest', 'off')),
  updated_at  timestamptz not null default now(),
  primary key (user_id, event_kind, channel)
);

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;

create policy "Users read their own notification preferences"
  on public.notification_preferences for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users insert their own notification preferences"
  on public.notification_preferences for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users update their own notification preferences"
  on public.notification_preferences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users delete their own notification preferences"
  on public.notification_preferences for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.notification_preferences to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 1b. notification_dispatch_log
--
-- Append-only audit + replay log. Every dispatchNotification() call
-- writes one row whether the send succeeded, failed, or was suppressed
-- by user prefs / frequency caps. status enum: 'sent' | 'failed' |
-- 'suppressed_by_pref' | 'suppressed_by_cap' | 'suppressed_by_template'.
--
-- The user can SELECT their own log rows for transparency ("show me my
-- notification history" surface in candidate Settings → Data & Account).
-- INSERT happens via service-role only (no public policy).
-- ─────────────────────────────────────────────────────────────────────

create table public.notification_dispatch_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  event_kind    text not null,
  channel       text not null,
  status        text not null
    check (status in ('sent', 'failed', 'suppressed_by_pref',
                      'suppressed_by_cap', 'suppressed_by_template')),
  template_key  text,             -- which template was rendered (if any)
  resend_id     text,             -- Resend's message id when channel=email and status=sent
  payload       jsonb not null default '{}'::jsonb,
  error_message text,
  dispatched_at timestamptz not null default now()
);

create index notification_dispatch_log_user_idx
  on public.notification_dispatch_log (user_id, dispatched_at desc);

create index notification_dispatch_log_event_idx
  on public.notification_dispatch_log (event_kind, dispatched_at desc);

alter table public.notification_dispatch_log enable row level security;

create policy "Users read their own notification dispatch log"
  on public.notification_dispatch_log for select
  to authenticated
  using (user_id = auth.uid());

-- No public INSERT/UPDATE/DELETE — service role only.

grant select on public.notification_dispatch_log to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 1c. notification_templates
--
-- Registry of email + in-app templates keyed by event_kind + channel +
-- version. The dispatcher picks the active version (highest version
-- where active=true). Body is a Handlebars-style template string with
-- {{candidate.first_name}}, {{job.title}}, etc. — same mergefield syntax
-- the email-template editor (4.5.f) will produce later in the sprint.
--
-- Read by all authenticated users (DSO admins need to preview templates
-- in the editor; candidates may eventually see what their notifications
-- look like before opt-in). Writes via service role only.
-- ─────────────────────────────────────────────────────────────────────

create table public.notification_templates (
  id              uuid primary key default gen_random_uuid(),
  event_kind      text not null,
  channel         text not null check (channel in ('email', 'in_app', 'sms')),
  version         int not null default 1,
  active          boolean not null default true,
  subject_template text,           -- nullable for in_app / sms
  body_template   text not null,
  -- DSO-scoped overrides (4.5.f). NULL = global default.
  dso_id          uuid references public.dsos(id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (event_kind, channel, version, dso_id)
);

create trigger notification_templates_set_updated_at
  before update on public.notification_templates
  for each row execute function public.set_updated_at();

create index notification_templates_lookup_idx
  on public.notification_templates (event_kind, channel, dso_id, active, version desc);

alter table public.notification_templates enable row level security;

create policy "Authenticated users read active notification templates"
  on public.notification_templates for select
  to authenticated
  using (active = true);

-- No public INSERT/UPDATE/DELETE — service role only at launch. The
-- email-template editor in 4.5.f will add scoped INSERT/UPDATE policies
-- for owner/admin within their own dso_id.

grant select on public.notification_templates to authenticated;


-- ═════════════════════════════════════════════════════════════════════════
-- 2. Candidate structured profile tables
--
-- The resume parser (4.1.c) saves into these tables in one transaction
-- after the candidate confirms the parsed sections. The Phase 4.2
-- profile rebuild renders + edits these tables directly.
-- ═════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 2a. candidate_work_history
--
-- One row per role. is_dso flagged so we can later compute auto-blocklist
-- (R2: ON by default — current employer derived from is_current=true).
-- pms_systems_used is a free text[] for now; the Phase 4.2 UI uses a
-- chip-multiselect against a controlled list, but we accept any text in
-- case the parser surfaces something we don't yet have an enum for.
-- ─────────────────────────────────────────────────────────────────────

create table public.candidate_work_history (
  id                  uuid primary key default gen_random_uuid(),
  candidate_id        uuid not null references public.candidates(id) on delete cascade,
  title               text not null,
  company_name        text not null,
  is_dso              boolean,                -- nullable: parser uncertain
  start_date          date,
  end_date            date,                   -- null when is_current = true
  is_current          boolean not null default false,
  description         text,
  pms_systems_used    text[] not null default '{}'::text[],
  procedures_performed text[] not null default '{}'::text[],
  -- Set when the candidate has chosen to auto-blocklist this employer
  -- via the privacy toggle. Derived in app code on save; persisted here
  -- so the kanban-side filter can read it without recomputing.
  auto_blocklisted    boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger candidate_work_history_set_updated_at
  before update on public.candidate_work_history
  for each row execute function public.set_updated_at();

create index candidate_work_history_candidate_idx
  on public.candidate_work_history (candidate_id, start_date desc nulls last);

-- ─────────────────────────────────────────────────────────────────────
-- 2b. candidate_education
-- ─────────────────────────────────────────────────────────────────────

create table public.candidate_education (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references public.candidates(id) on delete cascade,
  school_name   text not null,
  degree        text,
  field_of_study text,
  start_year    int,
  end_year      int,
  description   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger candidate_education_set_updated_at
  before update on public.candidate_education
  for each row execute function public.set_updated_at();

create index candidate_education_candidate_idx
  on public.candidate_education (candidate_id, end_year desc nulls last);

-- ─────────────────────────────────────────────────────────────────────
-- 2c. candidate_licenses
--
-- license_type stays free-text at the schema level (with an app-level
-- combobox of 'DDS', 'DMD', 'RDH', 'CDA', 'EFDA', etc.). license_number
-- is captured but display_number defaults FALSE per locked rule R3 —
-- candidates must opt in to display the number publicly. file_url is
-- nullable; populated when 4.3.e ships the candidate-credentials bucket.
-- DEA registration is NEVER captured (R1).
-- ─────────────────────────────────────────────────────────────────────

create table public.candidate_licenses (
  id              uuid primary key default gen_random_uuid(),
  candidate_id    uuid not null references public.candidates(id) on delete cascade,
  license_type    text not null,
  license_number  text,
  state           text,
  issued_date     date,
  expires_date    date,
  -- Verified via state-board lookup (Phase 5D verified-license badge).
  -- Always FALSE at launch; flipped by future verification job.
  verified        boolean not null default false,
  -- File asset reference (nullable until candidate-credentials bucket lands).
  file_url        text,
  -- R3 locked: hidden by default, candidate opt-in to display.
  display_number  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger candidate_licenses_set_updated_at
  before update on public.candidate_licenses
  for each row execute function public.set_updated_at();

create index candidate_licenses_candidate_idx
  on public.candidate_licenses (candidate_id, expires_date asc nulls last);

-- ─────────────────────────────────────────────────────────────────────
-- 2d. candidate_certifications
--
-- CPR/BLS, anesthesia, nitrous, sedation flags + expiry. kind is free
-- text against an app-level enum so parser can surface unknowns.
-- ─────────────────────────────────────────────────────────────────────

create table public.candidate_certifications (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references public.candidates(id) on delete cascade,
  -- 'cpr_bls', 'anesthesia_local', 'anesthesia_general', 'nitrous',
  -- 'sedation_oral', 'sedation_iv', 'radiology', 'osha', etc.
  kind          text not null,
  level         text,                  -- e.g. "Provider", "Instructor"
  issued_date   date,
  expires_date  date,
  file_url      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger candidate_certifications_set_updated_at
  before update on public.candidate_certifications
  for each row execute function public.set_updated_at();

create index candidate_certifications_candidate_idx
  on public.candidate_certifications (candidate_id, expires_date asc nulls last);

-- ─────────────────────────────────────────────────────────────────────
-- 2e. RLS on all four candidate-structured tables
--
-- Pattern (mirrors candidates / resumes bucket policies in 20260501000003):
--   • Candidate (auth.uid() = candidates.auth_user_id) full RW on their own rows.
--   • DSO members read rows when an application from the candidate to a
--     job in their DSO exists (link via application).
--   • License rows: extra restriction — license_number is NOT exposed
--     when display_number=false UNLESS the reading user is the candidate
--     themselves. Enforced at the application layer (server-side select
--     projection); the row itself stays accessible so verification jobs
--     work, but the API surface omits the number.
-- ─────────────────────────────────────────────────────────────────────

alter table public.candidate_work_history    enable row level security;
alter table public.candidate_education       enable row level security;
alter table public.candidate_licenses        enable row level security;
alter table public.candidate_certifications  enable row level security;

-- ── Candidate RW their own rows (work history) ───────────────────────
create policy "Candidates manage their own work history"
  on public.candidate_work_history for all
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

-- ── DSO read via application linkage (work history) ──────────────────
create policy "DSO members read work history of candidates who applied"
  on public.candidate_work_history for select
  to authenticated
  using (
    exists (
      select 1
        from public.applications a
        join public.jobs j on j.id = a.job_id
       where a.candidate_id = candidate_work_history.candidate_id
         and j.dso_id = public.current_dso_id()
    )
  );

-- ── Same pair on candidate_education ─────────────────────────────────
create policy "Candidates manage their own education"
  on public.candidate_education for all
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

create policy "DSO members read education of candidates who applied"
  on public.candidate_education for select
  to authenticated
  using (
    exists (
      select 1
        from public.applications a
        join public.jobs j on j.id = a.job_id
       where a.candidate_id = candidate_education.candidate_id
         and j.dso_id = public.current_dso_id()
    )
  );

-- ── Same pair on candidate_licenses ──────────────────────────────────
create policy "Candidates manage their own licenses"
  on public.candidate_licenses for all
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

create policy "DSO members read licenses of candidates who applied"
  on public.candidate_licenses for select
  to authenticated
  using (
    exists (
      select 1
        from public.applications a
        join public.jobs j on j.id = a.job_id
       where a.candidate_id = candidate_licenses.candidate_id
         and j.dso_id = public.current_dso_id()
    )
  );

-- ── Same pair on candidate_certifications ────────────────────────────
create policy "Candidates manage their own certifications"
  on public.candidate_certifications for all
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

create policy "DSO members read certifications of candidates who applied"
  on public.candidate_certifications for select
  to authenticated
  using (
    exists (
      select 1
        from public.applications a
        join public.jobs j on j.id = a.job_id
       where a.candidate_id = candidate_certifications.candidate_id
         and j.dso_id = public.current_dso_id()
    )
  );

grant select, insert, update, delete on public.candidate_work_history    to authenticated;
grant select, insert, update, delete on public.candidate_education       to authenticated;
grant select, insert, update, delete on public.candidate_licenses        to authenticated;
grant select, insert, update, delete on public.candidate_certifications  to authenticated;


-- ═════════════════════════════════════════════════════════════════════════
-- 3. Resume parser cache (4.1.c)
-- ═════════════════════════════════════════════════════════════════════════

-- parsed_resume_json holds the raw structured-output payload from the
-- LLM parse. Stored so subsequent edits to the profile don't need to
-- re-parse, and so we can replay or re-classify if the parsing prompt
-- ever changes. last_parsed_at gates the per-24h free parse cap.

alter table public.candidates
  add column if not exists parsed_resume_json jsonb,
  add column if not exists last_parsed_at     timestamptz;


-- ═════════════════════════════════════════════════════════════════════════
-- 4. Extend ai_usage_events.feature for the three new AI features
-- ═════════════════════════════════════════════════════════════════════════

alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_feature_check;

alter table public.ai_usage_events
  add constraint ai_usage_events_feature_check
  check (feature in (
    'jd_generator',
    'rejection_reason',
    'resume_parse',       -- 4.1.c
    'profile_headline',   -- 4.2.d
    'profile_summary'     -- 4.2.d
  ));

-- ai_usage_events.dso_id is NOT NULL today (employer-side feature).
-- Resume parser + profile_* are candidate-side and have no DSO context
-- at parse time. Two options: (a) relax NOT NULL on dso_id, (b) carve
-- out a sentinel "candidate-side AI" DSO row and route those events
-- through it. (a) is cleaner — candidate-side AI is meaningfully
-- different from employer-side AI and the per-DSO usage roll-up should
-- exclude these events anyway.
alter table public.ai_usage_events
  alter column dso_id drop not null;

-- Update the existing per-DSO read policy to exclude null-dso rows from
-- DSO-member reads, and add a candidate-self read policy for the new
-- candidate-side AI events.
drop policy if exists "DSO members read their DSO's AI usage" on public.ai_usage_events;

create policy "DSO members read their DSO's AI usage"
  on public.ai_usage_events for select
  to authenticated
  using (
    dso_id is not null
    and exists (
      select 1 from public.dso_users du
      where du.dso_id = ai_usage_events.dso_id
        and du.auth_user_id = auth.uid()
    )
  );

create policy "Candidates read their own candidate-side AI usage"
  on public.ai_usage_events for select
  to authenticated
  using (
    dso_id is null
    and user_id = auth.uid()
  );


-- ═════════════════════════════════════════════════════════════════════════
-- 5. Storage bucket: public-images (4.1.a)
--
-- Public read (so we can serve avatars + logos directly from a CDN URL
-- without signed-url roundtrips). Per-user write scoping enforced by
-- folder convention: ${auth.uid()}/${path}.
-- 5MB file size limit. PNG / JPG / WebP only.
-- ═════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'public-images',
  'public-images',
  true,
  5242880, -- 5 MB
  array[
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public images: anyone read"             on storage.objects;
drop policy if exists "Public images: owner upload own folder" on storage.objects;
drop policy if exists "Public images: owner update own folder" on storage.objects;
drop policy if exists "Public images: owner delete own folder" on storage.objects;

-- Anyone (including unauthenticated visitors viewing /companies/[slug])
-- can read. The bucket is public; this policy makes the intent explicit.
create policy "Public images: anyone read"
  on storage.objects for select
  using (bucket_id = 'public-images');

-- Authenticated users can upload to their own folder only.
create policy "Public images: owner upload own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'public-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Same for update.
create policy "Public images: owner update own folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'public-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Same for delete.
create policy "Public images: owner delete own folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'public-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;

-- ─────────────────────────────────────────────────────────────────────
-- End of Phase 4.1 foundation migration. Apply via Supabase SQL Editor
-- or `supabase db push`. After applying, run `npm run types` to
-- regenerate src/types/database.types.ts.
-- ─────────────────────────────────────────────────────────────────────
