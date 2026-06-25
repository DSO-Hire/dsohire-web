-- ─────────────────────────────────────────────────────────────────
-- 20260625165452_prospect_thread_candidate_column_lock.sql
--   Sourcing CRM follow-up — candidate-side column restriction on the
--   prospect_threads UPDATE path.
--
-- The Phase-2 "candidate update" RLS policy (20260623000400) lets a candidate
-- UPDATE their own thread row, but its WITH CHECK only re-verifies row ownership
-- — it does NOT restrict WHICH columns change. A crafted PATCH from the
-- candidate client could therefore tamper with relational / identifying columns
-- (application_id, dso_id, candidate_id, created_by, created_at) or force
-- status = 'converted' (a DSO/system-only transition).
--
-- Postgres RLS is row-level, not column-level, and a column GRANT can't tell the
-- candidate apart from the DSO (both authenticate as the `authenticated` role).
-- So we lock columns with a BEFORE UPDATE trigger that fires ONLY when the actor
-- is the candidate participant. DSO members (governed by the existing DSO update
-- policy, old.dso_id = current_dso_id()) and service-role / system writes
-- (auth.uid() IS NULL) pass through untouched.
--
-- Candidate-allowed mutations — matches src/app/candidate/(app)/prospects/actions.ts:
--   status -> active | muted | blocked,  candidate_revealed,  last_message_at,
--   updated_at.  Every other column is frozen from the candidate side.
--
-- Additive + defensive: no existing policy is altered (avoids the prior 42P17
-- policy-cycle class), and the trigger only ever RESTRICTS the candidate path —
-- it can never widen access. Verified by supabase/tests/sourcing_enforcement_test.sql.
-- ─────────────────────────────────────────────────────────────────

begin;

create or replace function public.enforce_prospect_thread_candidate_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Only constrain updates performed BY the candidate participant. DSO members
  -- updating their own thread (old.dso_id = current_dso_id()) and service-role /
  -- system writes (auth.uid() is null) are NOT constrained here.
  if exists (
       select 1 from public.candidates c
       where c.id = old.candidate_id
         and c.auth_user_id = auth.uid()
     )
     and old.dso_id is distinct from public.current_dso_id()
  then
    -- Identifying / relational columns are immutable from the candidate side.
    if  new.id            is distinct from old.id
     or new.dso_id        is distinct from old.dso_id
     or new.candidate_id  is distinct from old.candidate_id
     or new.created_by    is distinct from old.created_by
     or new.application_id is distinct from old.application_id
     or new.created_at    is distinct from old.created_at
    then
      raise exception
        'prospect_threads: a candidate may not change identifying or relational columns'
        using errcode = '42501';
    end if;

    -- Status, if changed, is limited to the candidate-controllable set
    -- (never 'converted', which is a DSO/system transition).
    if new.status is distinct from old.status
       and new.status not in ('active','muted','blocked')
    then
      raise exception
        'prospect_threads: a candidate may only set status to active, muted, or blocked'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prospect_threads_candidate_columns on public.prospect_threads;
create trigger trg_prospect_threads_candidate_columns
  before update on public.prospect_threads
  for each row
  execute function public.enforce_prospect_thread_candidate_columns();

commit;
