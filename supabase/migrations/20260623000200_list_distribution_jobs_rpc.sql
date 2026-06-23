-- ─────────────────────────────────────────────────────────────────
-- 20260623000200_list_distribution_jobs_rpc.sql  (Job Distribution — Phase 1)
--
-- THE single SQL source of truth for what jobs may leave the platform via
-- public distribution surfaces (syndication feed, public jobs JSON API,
-- embeddable widget + iframe, distribution sitemap entries). Every public
-- distribution surface reads through this function so the safety rules
-- cannot drift between them.
--
-- Hard filters enforced here (all must pass):
--   • job:  status='active', deleted_at is null, confidential=false,
--           visibility='public', distribution_enabled=true
--   • dso:  status='active', deleted_at is null, is_demo=false
--
-- It returns the raw fields plus per-job location array and the
-- is_public_affiliated verdict (public.job_is_publicly_dso_affiliated) so the
-- TS layer can apply the SAME displayed-name masking + comp-visibility rules
-- used on /jobs/[id]. Enum columns are cast to text so callers stay decoupled
-- from the enum types.
--
-- NOTE: the env launch gate (DISTRIBUTION_LIVE / pre-launch) is enforced in
-- TS BEFORE this function is ever called — see src/lib/distribution/
-- public-jobs.ts. SQL cannot read process env, so the TS layer short-circuits
-- to an empty result pre-launch; this function is the second gate.
-- ─────────────────────────────────────────────────────────────────

begin;

create or replace function public.list_distribution_jobs(p_dso_slug text default null)
returns table (
  job_id                uuid,
  title                 text,
  slug                  text,
  description           text,
  employment_type       text,
  role_category         text,
  scope                 text,
  posted_at             timestamptz,
  expires_at            timestamptz,
  compensation_min      integer,
  compensation_max      integer,
  compensation_period   text,
  compensation_visible  boolean,
  dso_id                uuid,
  dso_name              text,
  dso_slug              text,
  is_public_affiliated  boolean,
  locations             jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    j.id                                              as job_id,
    j.title,
    j.slug,
    j.description,
    j.employment_type::text                           as employment_type,
    j.role_category::text                             as role_category,
    j.scope::text                                     as scope,
    j.posted_at,
    j.expires_at,
    j.compensation_min,
    j.compensation_max,
    j.compensation_period::text                       as compensation_period,
    j.compensation_visible,
    d.id                                              as dso_id,
    d.name                                            as dso_name,
    d.slug                                            as dso_slug,
    public.job_is_publicly_dso_affiliated(j.id)       as is_public_affiliated,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'name',                   dl.name,
            'city',                   dl.city,
            'state',                  dl.state,
            'address_line1',          dl.address_line1,
            'postal_code',            dl.postal_code,
            'public_dso_affiliation', dl.public_dso_affiliation,
            'anonymize_name',         dl.anonymize_name
          )
          order by dl.created_at
        )
        from public.job_locations jl
        join public.dso_locations dl on dl.id = jl.location_id
        where jl.job_id = j.id
      ),
      '[]'::jsonb
    )                                                 as locations
  from public.jobs j
  join public.dsos d on d.id = j.dso_id
  where j.status = 'active'
    and j.deleted_at is null
    and j.confidential = false
    and j.visibility = 'public'
    and j.distribution_enabled = true
    and d.status = 'active'
    and d.deleted_at is null
    and d.is_demo = false
    and (p_dso_slug is null or d.slug = p_dso_slug)
  order by j.posted_at desc nulls last;
$$;

grant execute on function public.list_distribution_jobs(text)
  to anon, authenticated, service_role;

commit;
