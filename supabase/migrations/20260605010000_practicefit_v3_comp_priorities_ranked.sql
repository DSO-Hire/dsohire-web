-- PracticeFit v3 — ranked "what matters most." The single comp_priority gains a
-- ranked sibling: candidates pick their top 3 priorities in order. The scoring
-- engine (B.2) reads comp_priorities first, applying a heavier weight tilt to
-- rank 1 than rank 2/3, and falls back to the single comp_priority when the
-- ranked list is empty (back-compat). Ordered array; index 0 = their #1.
alter table public.candidates
  add column if not exists comp_priorities text[] not null default '{}'::text[];
