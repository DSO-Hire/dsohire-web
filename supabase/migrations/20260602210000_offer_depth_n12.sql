-- N12 offer depth schema. Phase 1 uses base_amount/base_period (structured
-- comp → guardrails + offer analytics). The rest is added now (forward-
-- compatible) for Phase 2 approval chains + Phase 3 version diff.
alter table public.application_offer_sends
  add column if not exists base_amount numeric,
  add column if not exists base_period text,
  add column if not exists revised_from_offer_send_id uuid
    references public.application_offer_sends(id) on delete set null,
  add column if not exists approval_status text not null default 'not_required',
  add column if not exists approved_by_user_id uuid
    references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz;

alter table public.application_offer_sends
  drop constraint if exists application_offer_sends_base_period_check;
alter table public.application_offer_sends
  add constraint application_offer_sends_base_period_check
  check (base_period is null or base_period in ('hourly', 'annual'));

alter table public.application_offer_sends
  drop constraint if exists application_offer_sends_approval_status_check;
alter table public.application_offer_sends
  add constraint application_offer_sends_approval_status_check
  check (approval_status in ('not_required', 'pending', 'approved', 'rejected'));

-- Per-DSO offer policy knobs (Phase 2): { require_when_out_of_range: bool,
-- require_above_amount: number|null }.
alter table public.dsos
  add column if not exists offer_approval_policy jsonb not null default '{}'::jsonb;

-- Per-teammate grant: an admin can let a specific recruiter/HM send offers
-- without approval. Owner/admin are implicitly allowed regardless.
alter table public.dso_users
  add column if not exists can_send_offers_directly boolean not null default false;
