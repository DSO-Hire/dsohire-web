-- Candidate profile accent color (2026-05-22).
--
-- Lets a candidate personalize the header band on their profile (the green
-- cover the employer + preview views render). Null = the default heritage
-- green. Stored as a validated 6-digit hex; validation is also enforced
-- app-side. Additive + nullable, so existing rows + code are unaffected.
--
-- Applied via the Supabase MCP connector (ledger version 20260522191154);
-- this repo file matches that ledger row 1:1.

alter table public.candidates
  add column profile_accent_color text;

comment on column public.candidates.profile_accent_color is
  'Candidate-chosen 6-digit hex (e.g. #4D7A60) for their profile header band. Null = default heritage green. Added 2026-05-22 (Note: candidate accent color).';

alter table public.candidates
  add constraint candidates_profile_accent_color_hex_chk
  check (
    profile_accent_color is null
    or profile_accent_color ~ '^#[0-9a-fA-F]{6}$'
  );
