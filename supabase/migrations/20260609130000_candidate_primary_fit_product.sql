-- DSOFit findability (#53): the candidate's chosen fit track, set by the
-- post-signup track chooser. Drives which fit product owns their sidebar and
-- which assessment they're routed to. Nullable until they choose;
-- "practicefit" | "dsofit". Applied to prod via connector 2026-06-09.
alter table public.candidates
  add column if not exists primary_fit_product text;
