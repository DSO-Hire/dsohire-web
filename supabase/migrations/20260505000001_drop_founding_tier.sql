-- ─────────────────────────────────────────────────────────────────────────
-- 20260505000001_drop_founding_tier.sql
--
-- Founding tier retired from public pricing 2026-05-05. Replacement is the
-- Charter Customer Program — a non-advertised, coupon-based sales tool
-- applied on top of a Starter or Growth purchase. Decision logged in
-- `Business Plan & Strategy/Pricing_Repositioning_Memo.md` and locked in
-- memory `project_pricing_repositioned_2026_05_05.md`.
--
-- Safe to run because:
--   1. There are zero rows in `public.subscriptions` with `tier = 'founding'`
--      (tier was launched but never sold). A guard at the top of this
--      migration enforces that — if any rows exist, the migration aborts
--      so the operator can investigate before destructive changes run.
--   2. No RLS policies branch on `tier = 'founding'` specifically.
--   3. `founding_locked_until` is a free column on `public.subscriptions` —
--      no foreign keys, no triggers, no indexes reference it.
--
-- Rollback strategy: re-run the original `20260501000000_initial_schema.sql`
-- enum + column definitions, or restore from a snapshot taken pre-migration.
-- Don't roll this back unless we genuinely revert the strategic decision.
-- ─────────────────────────────────────────────────────────────────────────

begin;

-- ── Guard: abort if any subscription is at the founding tier ─────────────
do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from public.subscriptions
    where tier = 'founding';
  if v_count > 0 then
    raise exception
      'Refusing to drop founding tier — % subscription(s) still at tier=founding. Migrate them to starter/growth first.',
      v_count;
  end if;
end$$;

-- ── 1. Drop the founding-locked-until column ─────────────────────────────
alter table public.subscriptions
  drop column if exists founding_locked_until;

-- ── 2. Recreate the subscription_tier enum without 'founding' ────────────
-- Postgres doesn't support dropping a value from an enum directly, so we
-- rename → recreate → cast → drop. Standard pattern.

alter type public.subscription_tier rename to subscription_tier_old;

create type public.subscription_tier as enum (
  'starter',
  'growth',
  'enterprise'
);

alter table public.subscriptions
  alter column tier type public.subscription_tier
  using tier::text::public.subscription_tier;

drop type public.subscription_tier_old;

-- ── 3. Recreate the tier index (was dropped with the column type change) ─
-- The `subscriptions_tier_idx` was created against the old enum type and
-- typically survives the rename-recreate, but recreate explicitly to be safe.
drop index if exists public.subscriptions_tier_idx;
create index subscriptions_tier_idx on public.subscriptions (tier);

commit;

-- ── Manual cleanup steps still required outside this migration ───────────
--   1. Stripe dashboard: archive Product `prod_UQu8absG1IMXnF` and
--      Price `price_1TS2Ig0uFxwSh1Fn1g8PGMGJ` (test mode). Stripe
--      doesn't allow deletion of products/prices with subscription history,
--      but archiving them prevents future use and hides them from the
--      dashboard's default views.
--   2. Run `npm run types` to regenerate `src/lib/supabase/database.types.ts`
--      so the TypeScript types reflect the new enum.
