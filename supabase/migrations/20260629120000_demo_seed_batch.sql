-- Demo seed batch marker.
--
-- The current Supabase project (dsohire-prod / viapivvlhjqvjhoflxmp) is being
-- turned into the gated DEMO environment (a fresh, clean project becomes prod
-- later). The demo seed (scripts/seed-demo.ts + the founder-gated /admin
-- "Reset demo data" button) must be able to wipe-and-reseed ONLY the rows it
-- owns — never anything else.
--
-- `dsos.is_demo` cannot serve that purpose here: every existing row is already
-- is_demo=true, so it does not distinguish the curated seed from prior junk.
-- This column is the stable, scoped marker instead. Every row the seed inserts
-- is stamped seed_batch='demo_v1'; wipe/reset delete strictly WHERE
-- seed_batch='demo_v1' (children resolved from these marked parents).
--
-- Inert in the future clean prod project: the column exists but no row ever
-- sets it there, so prod is never required to know about the demo seed.
alter table public.dsos
  add column if not exists seed_batch text;

alter table public.candidates
  add column if not exists seed_batch text;

comment on column public.dsos.seed_batch is
  'Demo-seed batch marker (e.g. ''demo_v1''). NULL for all real/prod rows. Scopes the idempotent demo reseed + the founder-gated /admin reset so they can only touch demo-owned rows.';
comment on column public.candidates.seed_batch is
  'Demo-seed batch marker (e.g. ''demo_v1''). NULL for all real/prod rows. Scopes the idempotent demo reseed + the founder-gated /admin reset so they can only touch demo-owned rows.';

create index if not exists dsos_seed_batch_idx on public.dsos (seed_batch) where seed_batch is not null;
create index if not exists candidates_seed_batch_idx on public.candidates (seed_batch) where seed_batch is not null;
