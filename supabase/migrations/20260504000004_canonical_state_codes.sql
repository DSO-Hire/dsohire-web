-- ============================================================
-- Canonical 2-letter uppercase state codes on dso_locations.
-- ============================================================
-- The /jobs filter passes ?state=mo (or whatever the user typed) verbatim into
-- search_jobs_public, where the WHERE clause did `dl.state = state_filter`.
-- Existing rows are mostly canonical "MO"/"KS" but the column was freeform
-- with no constraint, so any future bad input would re-create the same bug.
--
-- This migration:
--   1. Normalizes any 2-letter values to uppercase (handles future stray input)
--   2. Maps full state names to 2-letter codes (defensive)
--   3. Adds a CHECK constraint enforcing ^[A-Z]{2}$
-- ============================================================

-- 1. Normalize already-2-letter values.
update public.dso_locations
set state = upper(trim(state))
where state ~ '^[a-zA-Z]{2}$' and state <> upper(trim(state));

-- 2. Convert full state names to 2-letter codes.
update public.dso_locations
set state = case lower(trim(state))
  when 'alabama' then 'AL'
  when 'alaska' then 'AK'
  when 'arizona' then 'AZ'
  when 'arkansas' then 'AR'
  when 'california' then 'CA'
  when 'colorado' then 'CO'
  when 'connecticut' then 'CT'
  when 'delaware' then 'DE'
  when 'district of columbia' then 'DC'
  when 'florida' then 'FL'
  when 'georgia' then 'GA'
  when 'hawaii' then 'HI'
  when 'idaho' then 'ID'
  when 'illinois' then 'IL'
  when 'indiana' then 'IN'
  when 'iowa' then 'IA'
  when 'kansas' then 'KS'
  when 'kentucky' then 'KY'
  when 'louisiana' then 'LA'
  when 'maine' then 'ME'
  when 'maryland' then 'MD'
  when 'massachusetts' then 'MA'
  when 'michigan' then 'MI'
  when 'minnesota' then 'MN'
  when 'mississippi' then 'MS'
  when 'missouri' then 'MO'
  when 'montana' then 'MT'
  when 'nebraska' then 'NE'
  when 'nevada' then 'NV'
  when 'new hampshire' then 'NH'
  when 'new jersey' then 'NJ'
  when 'new mexico' then 'NM'
  when 'new york' then 'NY'
  when 'north carolina' then 'NC'
  when 'north dakota' then 'ND'
  when 'ohio' then 'OH'
  when 'oklahoma' then 'OK'
  when 'oregon' then 'OR'
  when 'pennsylvania' then 'PA'
  when 'rhode island' then 'RI'
  when 'south carolina' then 'SC'
  when 'south dakota' then 'SD'
  when 'tennessee' then 'TN'
  when 'texas' then 'TX'
  when 'utah' then 'UT'
  when 'vermont' then 'VT'
  when 'virginia' then 'VA'
  when 'washington' then 'WA'
  when 'west virginia' then 'WV'
  when 'wisconsin' then 'WI'
  when 'wyoming' then 'WY'
  else state
end
where state is not null and length(trim(state)) > 2;

-- 3. Add the CHECK constraint (NULL allowed since the column is nullable).
alter table public.dso_locations
  add constraint dso_locations_state_canonical_chk
  check (state is null or state ~ '^[A-Z]{2}$') not valid;

alter table public.dso_locations
  validate constraint dso_locations_state_canonical_chk;

-- ============================================================
-- Make search_jobs_public tolerant of mixed-case state filters.
-- URL params like ?state=mo should still match the canonical "MO".
-- ============================================================

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
  select j.*
  from public.jobs j
  where j.status = 'active'
    and j.deleted_at is null
    and (query_text is null or j.search_vector @@ plainto_tsquery('english'::regconfig, query_text))
    and (employment_filter is null or j.employment_type = employment_filter)
    and (category_filter is null or j.role_category = category_filter)
    and (
      posted_within_days is null
      or j.posted_at >= now() - (posted_within_days || ' days')::interval
    )
    and (
      state_filter is null
      or nullif(trim(state_filter), '') is null
      or exists (
        select 1
        from public.job_locations jl
        join public.dso_locations dl on dl.id = jl.location_id
        where jl.job_id = j.id
          and dl.state = upper(trim(state_filter))
      )
    )
  order by
    case when query_text is null then 0
         else ts_rank_cd(j.search_vector, plainto_tsquery('english'::regconfig, query_text))
    end desc,
    j.posted_at desc nulls last;
end;
$$;
