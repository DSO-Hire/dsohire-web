-- E7.7 Boolean candidate search (Phase 5D parity cluster, 2026-05-29).
--
-- The talent-pool Discover keyword box previously did a 3-column ILIKE OR
-- (full_name / headline / current_title). That can't express the boolean
-- queries recruiters expect from every competing ATS: AND, OR, NOT, and
-- quoted phrases.
--
-- This adds a stored, generated tsvector ("search_doc") spanning the
-- candidate's free-text + the recruiter-relevant array fields (skills,
-- specialties, PMS systems), plus a GIN index. The app then queries it
-- with Postgres full-text search:
--   * single bare token   -> to_tsquery prefix match (`token:*`) so typing
--                            "hygien" still surfaces "hygienist"
--   * anything else        -> websearch_to_tsquery, which natively parses
--                            `dentist invisalign` (AND), `dentist OR rdh`,
--                            `hygienist -pediatric` (NOT), `"oral surgery"`.
--
-- Two immutability constraints shaped this:
--   1. full_name is itself a GENERATED column (name-split) and cannot be
--      referenced by another generated column -> use first_name/last_name.
--   2. array_to_string(anyarray,text) is only STABLE (conservative for the
--      polymorphic signature), so it is rejected in a generated-column
--      expression. For text[] joined by a constant space the output is in
--      fact deterministic (no GUC/locale dependency), so we wrap it in a
--      thin IMMUTABLE SQL function and use that. This keeps proper
--      stemming + multi-word tokenisation (vs array_to_tsvector, which
--      would store each element as one un-stemmed lexeme).

create or replace function public.immutable_text_array_join(arr text[])
returns text
language sql
immutable
parallel safe
as $$ select coalesce(array_to_string(arr, ' '), '') $$;

comment on function public.immutable_text_array_join(text[]) is
  'IMMUTABLE wrapper over array_to_string(text[], '' '') for use in the candidates.search_doc generated column. Safe because text[] join by a constant delimiter has no GUC/locale dependency.';

alter table public.candidates
  add column if not exists search_doc tsvector
  generated always as (
    to_tsvector(
      'english',
      coalesce(first_name, '') || ' ' ||
      coalesce(last_name, '') || ' ' ||
      coalesce(headline, '') || ' ' ||
      coalesce(current_title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(current_location_city, '') || ' ' ||
      public.immutable_text_array_join(skills) || ' ' ||
      public.immutable_text_array_join(desired_specialty) || ' ' ||
      public.immutable_text_array_join(pms_systems)
    )
  ) stored;

create index if not exists candidates_search_doc_gin
  on public.candidates using gin (search_doc);

comment on column public.candidates.search_doc is
  'E7.7: generated FTS vector over name/headline/title/summary/city + skills/specialty/PMS arrays. Queried via websearch_to_tsquery (boolean) and to_tsquery prefix from talent-pool Discover.';
