-- Demo Mode keystone (spec docs/ClaudeCode_Demo_Mode_Tour_Spec_2026-07-16.md):
-- deny every INSERT/UPDATE/DELETE to a demo-viewer JWT at the database layer.
--
-- The demo viewer is the seeded shared account whose auth app_metadata
-- carries demo_viewer=true (set via the GoTrue admin API by the seed;
-- users cannot self-assign app_metadata). RESTRICTIVE policies AND with
-- the existing permissive ones, so this is a hard ceiling: even if app
-- code or a permissive policy would allow a write, the demo viewer is
-- denied. SELECT is untouched.
--
-- Inert outside the demo project: no prod user carries the mark, so the
-- predicate is simply false for every prod JWT. Service-role and
-- postgres connections bypass RLS as always (seed/reseed unaffected).
--
-- NOTE for future tables: this migration covers tables that exist when
-- it runs. New RLS tables should get the same three policies; the
-- role-sim test enumerates public tables and fails if one is missing.

create or replace function public.is_demo_viewer()
returns boolean
language sql
stable
as $$
  select coalesce(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb
      -> 'app_metadata' ->> 'demo_viewer')::boolean,
    false
  );
$$;

comment on function public.is_demo_viewer() is
  'True when the current JWT belongs to the shared read-only demo viewer (app_metadata.demo_viewer=true). Used by restrictive no-write RLS policies.';

do $$
declare
  t record;
begin
  for t in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity
  loop
    execute format(
      'create policy "demo_viewer_no_insert" on public.%I as restrictive for insert to authenticated with check (not public.is_demo_viewer())',
      t.table_name
    );
    execute format(
      'create policy "demo_viewer_no_update" on public.%I as restrictive for update to authenticated using (not public.is_demo_viewer())',
      t.table_name
    );
    execute format(
      'create policy "demo_viewer_no_delete" on public.%I as restrictive for delete to authenticated using (not public.is_demo_viewer())',
      t.table_name
    );
  end loop;
end $$;

-- Coverage introspection for verify-demo's role-sim: which public RLS
-- tables are missing any of the three restrictive demo policies? New
-- tables added after this migration show up here until they get the
-- policies. Service-role only (not for anon/authenticated callers).
create or replace function public.demo_seed_missing_demo_policies()
returns text[]
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce(array_agg(t.relname order by t.relname), '{}')
  from (
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity
      and (
        select count(distinct p.polname)
        from pg_policy p
        where p.polrelid = c.oid
          and p.polname in (
            'demo_viewer_no_insert',
            'demo_viewer_no_update',
            'demo_viewer_no_delete'
          )
      ) < 3
  ) t;
$$;

revoke execute on function public.demo_seed_missing_demo_policies() from public, anon, authenticated;

-- Storage: block demo-viewer uploads/updates/deletes across all buckets.
create policy "demo_viewer_no_insert" on storage.objects
  as restrictive for insert to authenticated
  with check (not public.is_demo_viewer());
create policy "demo_viewer_no_update" on storage.objects
  as restrictive for update to authenticated
  using (not public.is_demo_viewer());
create policy "demo_viewer_no_delete" on storage.objects
  as restrictive for delete to authenticated
  using (not public.is_demo_viewer());
