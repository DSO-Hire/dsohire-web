-- ═════════════════════════════════════════════════════════════════════════
-- 20260513000004 — Jobs corporate function
-- ═════════════════════════════════════════════════════════════════════════
--
-- 5G.c — corporate_function on jobs. Only meaningful when scope='corporate';
-- nullable everywhere else. Values map to slugs in
-- src/lib/corporate/functions.ts (12 functions: finance-accounting,
-- marketing, operations, hr-recruiting, it-engineering, legal-compliance,
-- real-estate-facilities, ma-corporate-development, training-development,
-- supply-chain-procurement, clinical-operations, business-development).
--
-- CHECK enforces the closed enum at the DB level. Keep the constraint
-- in sync with the TS module if a function is added or renamed.

alter table public.jobs
  add column if not exists corporate_function text;

alter table public.jobs
  drop constraint if exists jobs_corporate_function_check;

alter table public.jobs
  add constraint jobs_corporate_function_check
  check (
    corporate_function is null
    or corporate_function in (
      'finance-accounting',
      'marketing',
      'operations',
      'hr-recruiting',
      'it-engineering',
      'legal-compliance',
      'real-estate-facilities',
      'ma-corporate-development',
      'training-development',
      'supply-chain-procurement',
      'clinical-operations',
      'business-development'
    )
  );

-- Useful index for the Corporate tab function-filter on /jobs.
create index if not exists idx_jobs_corporate_function
  on public.jobs (corporate_function)
  where corporate_function is not null;

comment on column public.jobs.corporate_function is
  '5G.c (2026-05-13). Slug of a corporate function from src/lib/corporate/functions.ts. Only set when scope=corporate. Drives Corporate tab filtering + landing-page routing.';
