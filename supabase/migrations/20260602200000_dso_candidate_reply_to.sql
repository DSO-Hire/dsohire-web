-- Reply-to fix (B): per-DSO "candidate reply-to" email. When set, candidate
-- emails (application received, stage change, nurture) reply to THIS address
-- (e.g. careers@theirpractice.com) instead of falling back. Null → fall back
-- to the DSO owner's email at send time. Stops candidate replies routing to
-- the platform founder (was hardcoded cam@dsohire.com).
alter table public.dsos
  add column if not exists candidate_reply_to_email text;
