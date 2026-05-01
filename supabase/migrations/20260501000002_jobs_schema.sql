-- ============================================================
-- DSO Hire — Phase 2 Week 3 jobs schema migration
-- ============================================================
-- Adds jobs, job_locations, job_skills + RLS. Q7 — Postgres tsvector
-- + pg_trgm full-text search wired into the jobs table here (where it
-- matters most, per the schema sketch decision).
-- ============================================================

-- Idempotent cleanup
drop table if exists public.job_skills      cascade;
drop table if exists public.job_locations   cascade;
drop table if exists public.jobs            cascade;
drop type  if exists employment_type        cascade;
drop type  if exists role_category          cascade;
drop type  if exists compensation_period    cascade;
drop type  if exists job_status             cascade;

-- ─────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────

create type employment_type as enum (
  'full_time',
  'part_time',
  'contract',
  'prn',
  'locum'
);

create type role_category as enum (
  'dentist',
  'dental_hygienist',
  'dental_assistant',
  'front_office',
  'office_manager',
  'regional_manager',
  'specialist',
  'other'
);

create type compensation_period as enum ('hourly', 'daily', 'annual');

create type job_status as enum (
  'draft',
  'active',
  'paused',
  'expired',
  'filled',
  'archived'
);

-- ─────────────────────────────────────────────────────────────
-- Jobs
-- ─────────────────────────────────────────────────────────────

create table public.jobs (
  id                      uuid primary key default gen_random_uuid(),
  dso_id                  uuid not null references public.dsos(id) on delete cascade,
  title                   text not null,
  slug                    text not null,
  description             text not null default '',
  employment_type         employment_type not null default 'full_time',
  role_category           role_category not null default 'other',
  compensation_min        int,
  compensation_max        int,
  compensation_period     compensation_period,
  compensation_visible    boolean not null default true,
  benefits                text[],
  requirements            text,
  posted_at               timestamptz,
  expires_at              timestamptz,
  status                  job_status not null default 'draft',
  views                   int not null default 0,
  applications_count      int not null default 0,
  created_by              uuid references public.dso_users(id) on delete set null,
  deleted_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (dso_id, slug)
);

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

create index jobs_dso_idx on public.jobs (dso_id);
create index jobs_status_active_idx
  on public.jobs (status, posted_at desc)
  where status = 'active' and deleted_at is null;
create index jobs_role_category_idx on public.jobs (role_category);
create index jobs_employment_type_idx on public.jobs (employment_type);
create index jobs_posted_at_idx on public.jobs (posted_at desc nulls last);

-- ─────────────────────────────────────────────────────────────
-- Q7 — full-text search vector (jobs table is where search matters).
-- Trigger-maintained instead of GENERATED ALWAYS because Postgres rejects
-- setweight(to_tsvector(...)) inside a generated column as not-immutable
-- (even with the regconfig cast, the 'A' weight literal trips the analyzer).
-- The trigger pattern gives us the same indexed column with no immutability
-- check on the expression.
-- ─────────────────────────────────────────────────────────────

alter table public.jobs add column search_vector tsvector;

create or replace function public.update_jobs_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.role_category::text, '')), 'B') ||
    setweight(
      to_tsvector(
        'english',
        coalesce(regexp_replace(new.description, '<[^>]+>', '', 'g'), '')
      ),
      'C'
    );
  return new;
end;
$$;

create trigger jobs_update_search_vector
  before insert or update on public.jobs
  for each row execute function public.update_jobs_search_vector();

create index jobs_search_vector_idx
  on public.jobs using gin (search_vector);
create index jobs_title_trgm_idx
  on public.jobs using gin (title gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────
-- Job ↔ Location join (many-to-many — a regional role can span practices)
-- ─────────────────────────────────────────────────────────────

create table public.job_locations (
  job_id      uuid not null references public.jobs(id) on delete cascade,
  location_id uuid not null references public.dso_locations(id) on delete cascade,
  primary key (job_id, location_id)
);

create index job_locations_location_idx on public.job_locations (location_id);

-- ─────────────────────────────────────────────────────────────
-- Job skills (text[] would also work; broken out for filtering perf)
-- ─────────────────────────────────────────────────────────────

create table public.job_skills (
  job_id  uuid not null references public.jobs(id) on delete cascade,
  skill   text not null,
  primary key (job_id, skill)
);

create index job_skills_skill_idx on public.job_skills (skill);

-- ─────────────────────────────────────────────────────────────
-- Public search function (security definer — bypasses RLS for the
-- public job index. RLS still applies on /employer/jobs reads.)
-- ─────────────────────────────────────────────────────────────

create or replace function public.search_jobs_public(
  query_text          text default null,
  state_filter        text default null,
  employment_filter   employment_type default null,
  category_filter     role_category default null,
  posted_within_days  int default null
)
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select distinct j.*
  from public.jobs j
  left join public.job_locations jl on jl.job_id = j.id
  left join public.dso_locations dl on dl.id = jl.location_id
  where j.status = 'active'
    and j.deleted_at is null
    and (query_text is null or j.search_vector @@ plainto_tsquery('english'::regconfig, query_text))
    and (state_filter is null or dl.state = state_filter)
    and (employment_filter is null or j.employment_type = employment_filter)
    and (category_filter is null or j.role_category = category_filter)
    and (
      posted_within_days is null
      or j.posted_at >= now() - (posted_within_days || ' days')::interval
    )
  order by
    case when query_text is null then 0
         else ts_rank_cd(j.search_vector, plainto_tsquery('english'::regconfig, query_text))
    end desc,
    j.posted_at desc nulls last;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────

alter table public.jobs           enable row level security;
alter table public.job_locations  enable row level security;
alter table public.job_skills     enable row level security;

-- Public read of active, non-deleted jobs (powers /jobs and /jobs/[id]).
create policy "Jobs: public read active"
  on public.jobs for select
  using (status = 'active' and deleted_at is null);

-- DSO members see all of their own DSO's jobs (any status).
create policy "Jobs: members read own DSO"
  on public.jobs for select
  using (dso_id = public.current_dso_id());

-- DSO admins create/edit/delete jobs.
create policy "Jobs: admin write"
  on public.jobs for all
  using (public.is_dso_admin(dso_id))
  with check (public.is_dso_admin(dso_id));

-- Recruiters can also create + update jobs (per Q1 — recruiter role
-- includes job authoring; only billing/team are owner/admin-only).
create policy "Jobs: recruiter author"
  on public.jobs for insert
  with check (
    dso_id = public.current_dso_id()
    and public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
  );

create policy "Jobs: recruiter update"
  on public.jobs for update
  using (
    dso_id = public.current_dso_id()
    and public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
  )
  with check (
    dso_id = public.current_dso_id()
    and public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
  );

-- Job locations: same access pattern as parent job.
create policy "Job locations: public read"
  on public.job_locations for select
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.status = 'active'
        and j.deleted_at is null
    )
  );

create policy "Job locations: members read own"
  on public.job_locations for select
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id and j.dso_id = public.current_dso_id()
    )
  );

create policy "Job locations: members write"
  on public.job_locations for all
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.dso_id = public.current_dso_id()
        and public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
    )
  )
  with check (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.dso_id = public.current_dso_id()
        and public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
    )
  );

-- Job skills: same.
create policy "Job skills: public read"
  on public.job_skills for select
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.status = 'active'
        and j.deleted_at is null
    )
  );

create policy "Job skills: members read own"
  on public.job_skills for select
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id and j.dso_id = public.current_dso_id()
    )
  );

create policy "Job skills: members write"
  on public.job_skills for all
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.dso_id = public.current_dso_id()
        and public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
    )
  )
  with check (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.dso_id = public.current_dso_id()
        and public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
    )
  );

-- ============================================================
-- End of jobs migration. Apply via Supabase SQL Editor.
-- ============================================================
