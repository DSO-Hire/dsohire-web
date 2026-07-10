-- Parse-on-apply (2026-07-10, Cam's call: "worth the API cost").
--
-- Until now the resume parser only ran when a CANDIDATE chose to run it
-- (profile import / apply autofill), so employers got structured data
-- only for candidates who'd been through an extraction flow — and never
-- for guests. These columns hold a per-application extraction snapshot,
-- written fire-and-forget AFTER the apply response is sent (next/server
-- after()); a parse failure never blocks or delays an application.
--
-- R8 (no-silent-fill) is preserved: this snapshot is employer-facing
-- context on the APPLICATION row. It is never written back to the
-- candidate's profile — that still requires the candidate's confirm flow.
--
--   resume_parse         jsonb  — on ok: the ParsedResume payload (per-field
--                                 confidence tiers included); on failure:
--                                 { error_kind, message } for the panel's
--                                 honest "couldn't read this file" state.
--   resume_parse_status  text   — ok | failed | skipped (skipped = no
--                                 resume file on the application).
--   resume_parsed_at     timestamptz
--
-- Visibility: applications RLS already scopes rows to the owning DSO's
-- team + the candidate themselves. A candidate seeing the extraction of
-- their own resume is fine by design.

alter table public.applications
  add column if not exists resume_parse jsonb,
  add column if not exists resume_parse_status text
    check (resume_parse_status in ('ok', 'failed', 'skipped')),
  add column if not exists resume_parsed_at timestamptz;

comment on column public.applications.resume_parse is
  'AI-extracted resume snapshot for this application (employer-facing context; never written to the candidate profile). On failure: {error_kind, message}.';
