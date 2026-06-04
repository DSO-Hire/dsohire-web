-- practice_fit_digest_sends — dedup + cadence log for the weekly PracticeFit
-- drip (Phase B.2). One row per email actually sent to a candidate, recording
-- which jobs went out and whether it was a 'new'-matches send or a monthly
-- 'fallback' (broader matches when nothing new qualified).
--
-- The cron (/api/cron/practice-fit-digest) reads the latest row per candidate
-- to (a) dedup jobs already emailed and (b) enforce "never go silent > ~30 days."
--
-- RLS: service-role only. The cron reads + writes with the service-role client;
-- candidates never need to read their own send log. Enabling RLS with NO
-- policies locks the table to anon/authenticated (service-role bypasses RLS) --
-- same posture as email_log.

create table if not exists public.practice_fit_digest_sends (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  kind text not null check (kind in ('new','fallback')),
  job_ids uuid[] not null default '{}'::uuid[],
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_pf_digest_sends_candidate_sent
  on public.practice_fit_digest_sends (candidate_id, sent_at desc);

alter table public.practice_fit_digest_sends enable row level security;
