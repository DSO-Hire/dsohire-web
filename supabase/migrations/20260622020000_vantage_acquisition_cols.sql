-- Vantage Phase 2 — closed-loop acquisition columns (build spec §4.6).
--
-- Stamp the last-touch acquisition channel + source on the conversion records
-- at sign-up. The founder dashboard joins these AGGREGATES against the funnel
-- ("Channel X → N signups → N paying → $Y MRR") — it never links an
-- individual's anonymous browsing to their account.
--
-- Only dsos + candidates get columns. Paying/MRR is read from `subscriptions`
-- joined by dso_id, and the Stripe webhook (where subscriptions are written) is
-- a server-to-server call with no user request context — so it can't derive an
-- acquisition channel anyway. Attribution belongs at sign-up, where the user's
-- request exists.
--
-- All nullable; nothing is backfilled (pre-Vantage rows stay null = "unknown").

alter table public.dsos       add column if not exists acquisition_channel text;
alter table public.dsos       add column if not exists acquisition_source  text;
alter table public.candidates add column if not exists acquisition_channel text;
alter table public.candidates add column if not exists acquisition_source  text;

comment on column public.dsos.acquisition_channel is
  'Vantage: last-touch acquisition channel (GA4 grouping) at employer sign-up. Aggregate-only attribution; never links to anonymous pageviews.';
comment on column public.candidates.acquisition_channel is
  'Vantage: last-touch acquisition channel (GA4 grouping) at candidate sign-up. Aggregate-only attribution; never links to anonymous pageviews.';
