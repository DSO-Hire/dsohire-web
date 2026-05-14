-- ═════════════════════════════════════════════════════════════════════════
-- 20260514000002 — Composable compensation model (Ashby-style)
-- ═════════════════════════════════════════════════════════════════════════
--
-- Surfaced during the 5G.d stress test: base-only comp framing undersells
-- variable-comp roles. A VP of Business Development is base + commission +
-- bonus + equity; an associate dentist can be base + production-based
-- variable comp + partnership equity. The existing model captured none of
-- the variable side in a structured, computable way.
--
-- New model = base (the existing compensation_* columns) + three OPTIONAL,
-- independently-toggled components layered on top:
--   • Variable / commission — variable_comp_enabled + _target (numeric,
--     feeds the On-Target Earnings calc) + _structure (free text:
--     "1.5% of closed deal value", "30% of collections above $50K/mo").
--   • Bonus               — bonus_enabled + bonus_target (numeric, feeds
--     OTE); the descriptive bonus_structure column already exists
--     (20260514000001) and is reused as this component's free text.
--   • Equity              — reuses equity_offered (the toggle) + equity_note
--     (20260514000001). Equity is non-cash, so it does NOT feed OTE.
--
-- On-Target Earnings is computed on display (src/lib/comp/ote.ts), not
-- stored — base contribution + variable_comp_target + bonus_target.
--
-- Applies to BOTH the practice/clinical wizard and the corporate wizard —
-- these columns live on jobs and serve both. All nullable / defaulted, so
-- every existing job is unaffected until a recruiter opts a component in.
--
-- All `if not exists` / `drop constraint if exists` so the migration is
-- safely re-runnable.

alter table public.jobs
  add column if not exists variable_comp_enabled   boolean not null default false,
  add column if not exists variable_comp_target    int,
  add column if not exists variable_comp_structure text,
  add column if not exists bonus_enabled           boolean not null default false,
  add column if not exists bonus_target            int;

-- ── Sanity CHECKs — annual-dollar targets can't be negative ─────────────────

alter table public.jobs drop constraint if exists jobs_variable_comp_target_check;
alter table public.jobs add  constraint jobs_variable_comp_target_check
  check (variable_comp_target is null or variable_comp_target >= 0);

alter table public.jobs drop constraint if exists jobs_bonus_target_check;
alter table public.jobs add  constraint jobs_bonus_target_check
  check (bonus_target is null or bonus_target >= 0);

-- ── Column comments ─────────────────────────────────────────────────────────

comment on column public.jobs.variable_comp_enabled is
  'Composable comp (2026-05-14). Variable/commission component toggle.';
comment on column public.jobs.variable_comp_target is
  'Composable comp. Annual $ target for the variable component — feeds the On-Target Earnings calc. Null when not enabled / not specified.';
comment on column public.jobs.variable_comp_structure is
  'Composable comp. Free text describing how variable pay works ("1.5% of closed deal value", "30% of collections above $50K/mo").';
comment on column public.jobs.bonus_enabled is
  'Composable comp. Bonus component toggle. Pairs with bonus_target (numeric, feeds OTE) + bonus_structure (free text, from 20260514000001).';
comment on column public.jobs.bonus_target is
  'Composable comp. Annual $ target for the bonus component — feeds the On-Target Earnings calc. Null when not enabled / not specified.';
