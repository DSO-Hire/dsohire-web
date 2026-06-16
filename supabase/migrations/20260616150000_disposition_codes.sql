-- #8 — Structured disposition (non-selection) reason codes.
--
-- Adds an internal, compliance-grade categorical code to the point-in-time
-- status event for a close (rejected / withdrawn). This is the EEOC/OFCCP
-- "documented job-related reason for non-selection" surface. The existing
-- `note` column stays the free-text (often candidate-facing) message; this
-- code is the standardized, queryable taxonomy that lives ONLY in the audit
-- trail.
--
-- Validation is intentionally app-side (src/lib/applications/disposition-reasons.ts)
-- — no enum/CHECK so the taxonomy can evolve without a migration. The column
-- is written exclusively by the SECURITY-DEFINER service-role patch path
-- (attachStatusEventNote); RLS on application_status_events already blocks all
-- client INSERT/UPDATE.

alter table public.application_status_events
  add column if not exists disposition_code text;

comment on column public.application_status_events.disposition_code is
  'Internal EEOC/OFCCP disposition reason code for a close (rejected/withdrawn). Taxonomy lives in app code (disposition-reasons.ts). Never shown to candidates.';

-- Reporting/adverse-impact queries scan closed events by code; partial index
-- keeps it cheap and small (only rows that carry a code).
create index if not exists application_status_events_disposition_code_idx
  on public.application_status_events (disposition_code)
  where disposition_code is not null;
