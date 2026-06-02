-- N16 nurture v1 — add the email_candidate_nurture action kind so an
-- automation can send a candidate a custom re-engagement message (distinct
-- from email_candidate, which sends the predefined stage template).
alter table public.automation_rule_actions
  drop constraint automation_rule_actions_kind_check;
alter table public.automation_rule_actions
  add constraint automation_rule_actions_kind_check check (action_kind in (
    'email_candidate',
    'email_candidate_nurture',
    'inbox_system_message',
    'notify_teammate',
    'assign',
    'add_tag',
    'move_stage',
    'start_sequence'
  ));
