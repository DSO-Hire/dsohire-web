-- Admin cockpit — platform-wide expiring-credential escalation count (Tranche 2).
--
-- Counts candidate licenses + certifications that are expired or within the
-- imminent window (caller passes EXPIRY_IMMINENT_DAYS from the shared engine so
-- the threshold stays single-sourced in TS). Joined to non-deleted candidates.
-- Aggregate count only — no names/credential details. SECURITY DEFINER,
-- service_role-only.

create or replace function public.admin_expiring_credentials_count(p_within_days int)
returns bigint
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select
    (select count(*)
       from candidate_licenses l
       join candidates c on c.id = l.candidate_id
      where c.deleted_at is null
        and l.expires_date is not null
        and l.expires_date < (now() + make_interval(days => greatest(p_within_days, 0))))
  + (select count(*)
       from candidate_certifications ce
       join candidates c on c.id = ce.candidate_id
      where c.deleted_at is null
        and ce.expires_date is not null
        and ce.expires_date < (now() + make_interval(days => greatest(p_within_days, 0))));
$$;

revoke all on function public.admin_expiring_credentials_count(int) from public, anon, authenticated;
grant execute on function public.admin_expiring_credentials_count(int) to service_role;
