-- Do not contact (2026-10-19). CAN-SPAM: an opt-out must be honored within
-- 10 business days and permanently. Flag at the account level (stop all
-- outreach to the group) or the contact level (stop one person). The
-- timestamp is the compliance record; clearing it is logged on the timeline.
alter table public.crm_accounts
  add column do_not_contact_at timestamptz,
  add column do_not_contact_reason text check (do_not_contact_reason is null or do_not_contact_reason in ('replied_no','unsubscribe_request','bounced','asked_elsewhere','other')),
  add column do_not_contact_note text check (do_not_contact_note is null or char_length(do_not_contact_note) <= 500);
alter table public.crm_contacts
  add column do_not_contact_at timestamptz,
  add column do_not_contact_reason text check (do_not_contact_reason is null or do_not_contact_reason in ('replied_no','unsubscribe_request','bounced','asked_elsewhere','other')),
  add column do_not_contact_note text check (do_not_contact_note is null or char_length(do_not_contact_note) <= 500);
create index crm_accounts_dnc_idx on public.crm_accounts (do_not_contact_at) where do_not_contact_at is not null;
