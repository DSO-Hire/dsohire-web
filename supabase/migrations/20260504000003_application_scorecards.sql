-- ============================================================
-- DSO Hire — Phase 5A application scorecards (multi-reviewer)
-- ============================================================
-- One scorecard per (application, reviewer) pair. DSO members can read
-- every scorecard on applications they have access to so the detail page
-- can roll up an aggregate across reviewers; only the reviewer can write
-- their own row, and once submitted the score data is locked by trigger.
--
-- Conventions:
--   - rubric_id is a static slug from src/lib/scorecards/rubric-library.ts;
--     the DB doesn't validate against the library so the library can evolve
--     without a migration. Old scorecards continue to render against the
--     rubric version they were authored against (caller falls back gracefully
--     if a slug is removed).
--   - attribute_scores is a jsonb map: { [attributeSlug]: { score, note } }.
--     Validation happens on the application server (rubric-aware) and lightly
--     in the trigger via type assertion (jsonb shape only).
--   - Realtime: dedicated channel scoped to application_id, mirrors comments.
--   - submitted scorecards are immutable (trigger no-ops score columns).
-- ============================================================

create table public.application_scorecards (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  reviewer_dso_user_id uuid not null references public.dso_users(id) on delete restrict,
  rubric_id text not null,
  attribute_scores jsonb not null default '{}'::jsonb,
  overall_recommendation text check (overall_recommendation in (
    'strong_yes', 'yes', 'maybe', 'no', 'strong_no'
  )),
  overall_note text check (char_length(coalesce(overall_note, '')) <= 4000),
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz
);

create unique index application_scorecards_app_reviewer_idx
  on public.application_scorecards (application_id, reviewer_user_id);

create index application_scorecards_application_idx
  on public.application_scorecards (application_id, submitted_at desc nulls last);

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────

alter table public.application_scorecards enable row level security;

-- Read: all DSO members on the job's DSO can read all scorecards. The UI
-- additionally filters out other reviewers' DRAFT rows so only submitted
-- scorecards are shared cross-reviewer (Greenhouse / Ashby pattern).
create policy "DSO members read scorecards on their applications"
  on public.application_scorecards for select
  using (
    exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      join public.dso_users du on du.dso_id = j.dso_id
      where a.id = application_scorecards.application_id
        and du.auth_user_id = auth.uid()
    )
  );

-- Insert: reviewer must be the auth user, must be a member of the job's DSO,
-- and the dso_users row must belong to that user.
create policy "DSO members insert their own scorecards"
  on public.application_scorecards for insert
  with check (
    reviewer_user_id = auth.uid()
    and exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      join public.dso_users du on du.dso_id = j.dso_id
      where a.id = application_scorecards.application_id
        and du.auth_user_id = auth.uid()
        and du.id = application_scorecards.reviewer_dso_user_id
    )
  );

-- Update: only the reviewer, only if the row is theirs. Submitted-row
-- locking happens in the trigger below (UPDATEs on submitted rows are
-- no-ops for score columns).
create policy "Reviewers update their own scorecards"
  on public.application_scorecards for update
  using (reviewer_user_id = auth.uid())
  with check (reviewer_user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- Realtime publication membership (idempotent)
-- ─────────────────────────────────────────────────────────────

do $$
begin
  alter publication supabase_realtime add table public.application_scorecards;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;

-- ─────────────────────────────────────────────────────────────
-- Trigger: bump updated_at, set submitted_at on draft→submitted transition,
-- and lock score columns once submitted.
-- ─────────────────────────────────────────────────────────────

create or replace function public.bump_application_scorecards_timestamps()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();

  if old.status = 'draft' and new.status = 'submitted' then
    new.submitted_at := now();
  end if;

  -- Once submitted, the row's score data is immutable: any UPDATE pinning
  -- score columns is silently rolled back to the prior value. Status stays
  -- 'submitted', submitted_at preserved.
  if old.status = 'submitted' then
    new.attribute_scores := old.attribute_scores;
    new.overall_recommendation := old.overall_recommendation;
    new.overall_note := old.overall_note;
    new.rubric_id := old.rubric_id;
    new.status := 'submitted';
    new.submitted_at := old.submitted_at;
  end if;

  return new;
end;
$$;

drop trigger if exists application_scorecards_timestamps_trg on public.application_scorecards;

create trigger application_scorecards_timestamps_trg
  before update on public.application_scorecards
  for each row execute function public.bump_application_scorecards_timestamps();

-- ─────────────────────────────────────────────────────────────
-- View: aggregate roll-up per application (drives kanban-card badge).
-- ─────────────────────────────────────────────────────────────
-- Inherits RLS via security_invoker. Mirrors the application_comment_counts
-- pattern: only submitted scorecards are counted; drafts stay private to the
-- reviewer until submission. Scores are averaged across attributes per
-- scorecard (in the app layer the per-attribute aggregate is recomputed
-- client-side from raw attribute_scores; here we only need a single number
-- + reviewer count for the kanban indicator).

create or replace view public.application_scorecard_summaries
with (security_invoker = true)
as
  with per_card as (
    select
      sc.application_id,
      sc.reviewer_user_id,
      (
        select avg((value->>'score')::numeric)
          from jsonb_each(sc.attribute_scores) as t(key, value)
         where (value->>'score') ~ '^[0-9]+(\.[0-9]+)?$'
      ) as card_avg
    from public.application_scorecards sc
    where sc.status = 'submitted'
  )
  select
    application_id,
    count(*)::int as reviewer_count,
    round(avg(card_avg)::numeric, 2) as avg_score
  from per_card
  where card_avg is not null
  group by application_id;
