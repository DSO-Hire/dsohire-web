-- E1.18 Schedule publish + auto-expire (parity cluster, 2026-05-29).
--
-- jobs.expires_at already existed but was a dormant column -- nothing
-- wrote it, nothing enforced it. This adds the missing half (a future
-- publish timestamp) and the indexes the lifecycle cron needs.
--
-- Lifecycle (driven by /api/cron/job-lifecycle, hourly):
--   * scheduled publish: a draft job with scheduled_publish_at <= now()
--     is flipped to 'active' and stamped posted_at = now(). It stays a
--     private draft (invisible to the public job search, which filters
--     status='active') until the cron promotes it.
--   * auto-expire: an active job with expires_at <= now() is flipped to
--     'expired', which removes it from the public job search.
--
-- Both are also enforced opportunistically in the app where a job is
-- read, but the cron is the authority so a job doesn't linger live just
-- because nobody loaded it.

alter table public.jobs
  add column if not exists scheduled_publish_at timestamptz;

comment on column public.jobs.scheduled_publish_at is
  'E1.18: when set and in the future, the job is held as a draft until the job-lifecycle cron promotes it to active at this time. Null = publish immediately on activate.';

-- Partial indexes keep the hourly cron scans cheap as the jobs table grows.
create index if not exists jobs_pending_scheduled_publish_idx
  on public.jobs (scheduled_publish_at)
  where status = 'draft' and scheduled_publish_at is not null;

create index if not exists jobs_pending_expiry_idx
  on public.jobs (expires_at)
  where status = 'active' and expires_at is not null;
