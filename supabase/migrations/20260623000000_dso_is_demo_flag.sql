-- ─────────────────────────────────────────────────────────────────
-- 20260623000000_dso_is_demo_flag.sql  (Job Distribution — Phase 1)
--
-- Launch-safety flag for the new public distribution surfaces (syndication
-- XML feed, public jobs JSON API, embeddable widget + iframe). When a DSO
-- has is_demo = true, NONE of its jobs are ever emitted to those public
-- surfaces — even after the general launch flip — until the flag is cleared
-- post data-scrub.
--
-- We are pre-launch: EVERY DSO that exists right now is seed/test/demo data
-- (the 4 polished demo DSOs, the Bridgeway national heatmap seed, and the
-- founder's own test accounts). So we backfill is_demo = true for ALL
-- existing rows. Real DSOs created after launch default to false and become
-- distributable once distribution goes live. This is the "data-scrub list"
-- as an allowlist gate: nothing distributes until someone affirmatively
-- clears is_demo for a verified-real DSO.
--
-- This is the permanent second layer of defense; the first is the
-- DISTRIBUTION_LIVE / launch env gate in src/lib/launch/gate.ts.
-- ─────────────────────────────────────────────────────────────────

begin;

alter table public.dsos
  add column if not exists is_demo boolean not null default false;

comment on column public.dsos.is_demo is
  'Distribution safety flag. When true, the DSO and its jobs are NEVER emitted to public distribution surfaces (syndication feed, public jobs API, embed widget/iframe), even post-launch, until explicitly cleared after the data scrub. Backfilled true for all DSOs existing at launch-build time (all pre-launch data is seed/test). New DSOs default false. Enforced in public.list_distribution_jobs() and src/lib/distribution/public-jobs.ts.';

-- Belt-and-suspenders: every DSO that exists today is pre-launch seed/test
-- data. Mark them all so none can ever distribute until affirmatively cleared.
update public.dsos set is_demo = true where is_demo = false;

commit;
