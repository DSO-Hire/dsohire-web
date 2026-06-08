-- #91 (Day 28, 2026-06-08) — Performance pass, part 1: index every unindexed
-- foreign key flagged by the Supabase performance advisor (49 of them).
--
-- An unindexed FK forces a sequential scan whenever you filter/join on that
-- column or when Postgres validates a cascade — exactly the access patterns
-- these tables hit on dashboards, application detail, messaging, automations,
-- and offers. All statements are additive + idempotent (create index if not
-- exists); zero behavior change, safe to apply ahead of the code push.
--
-- Already applied to prod via the Supabase connector on 2026-06-08; this file
-- keeps repo↔prod in sync. Re-run the performance advisor after deploy to
-- confirm the unindexed_foreign_keys count drops from 49 → 0.

create index if not exists idx_ai_usage_events_user_id on public.ai_usage_events (user_id);
create index if not exists idx_application_comments_author_dso_user_id on public.application_comments (author_dso_user_id);
create index if not exists idx_application_comments_author_user_id on public.application_comments (author_user_id);
create index if not exists idx_appmsg_attach_uploaded_by_user_id on public.application_message_attachments (uploaded_by_user_id);
create index if not exists idx_application_messages_sender_dso_user_id on public.application_messages (sender_dso_user_id);
create index if not exists idx_appoffer_approved_by_user_id on public.application_offer_sends (approved_by_user_id);
create index if not exists idx_appoffer_revised_from_offer_send_id on public.application_offer_sends (revised_from_offer_send_id);
create index if not exists idx_appoffer_sent_by_user_id on public.application_offer_sends (sent_by_user_id);
create index if not exists idx_appoffer_template_id on public.application_offer_sends (template_id);
create index if not exists idx_appqa_question_id on public.application_question_answers (question_id);
create index if not exists idx_appscore_reviewer_dso_user_id on public.application_scorecards (reviewer_dso_user_id);
create index if not exists idx_appscore_reviewer_user_id on public.application_scorecards (reviewer_user_id);
create index if not exists idx_appstatus_actor_id on public.application_status_events (actor_id);
create index if not exists idx_application_tags_created_by on public.application_tags (created_by);
create index if not exists idx_applications_affil_revealed_by on public.applications (affiliation_revealed_by_dso_user_id);
create index if not exists idx_audit_events_actor_dso_user_id on public.audit_events (actor_dso_user_id);
create index if not exists idx_audit_events_actor_user_id on public.audit_events (actor_user_id);
create index if not exists idx_autoruns_application_id on public.automation_rule_runs (application_id);
create index if not exists idx_automation_rules_created_by on public.automation_rules (created_by);
create index if not exists idx_autoenroll_dso_id on public.automation_sequence_enrollments (dso_id);
create index if not exists idx_autoenroll_enrolled_by on public.automation_sequence_enrollments (enrolled_by_dso_user_id);
create index if not exists idx_autoenroll_sequence_id on public.automation_sequence_enrollments (sequence_id);
create index if not exists idx_autosends_step_id on public.automation_sequence_sends (step_id);
create index if not exists idx_autoseq_created_by on public.automation_sequences (created_by_dso_user_id);
create index if not exists idx_candcert_verified_by on public.candidate_certifications (verified_by_user_id);
create index if not exists idx_candlic_verified_by on public.candidate_licenses (verified_by_user_id);
create index if not exists idx_claude_usage_request_id on public.claude_usage_log (request_id);
create index if not exists idx_dm_conversations_created_by on public.dm_conversations (created_by);
create index if not exists idx_dm_messages_sender_dso_user_id on public.dm_messages (sender_dso_user_id);
create index if not exists idx_dso_invitations_invited_by on public.dso_invitations (invited_by);
create index if not exists idx_offerletter_created_by on public.dso_offer_letter_templates (created_by_user_id);
create index if not exists idx_outreach_msg_sent_by on public.dso_outreach_messages (sent_by);
create index if not exists idx_outreach_tmpl_created_by on public.dso_outreach_templates (created_by);
create index if not exists idx_talentpool_added_by on public.dso_talent_pool_entries (added_by);
create index if not exists idx_email_log_related_candidate_id on public.email_log (related_candidate_id);
create index if not exists idx_email_log_related_dso_id on public.email_log (related_dso_id);
create index if not exists idx_email_templates_updated_by on public.email_templates (updated_by);
create index if not exists idx_interview_proposals_proposed_by on public.interview_proposals (proposed_by);
create index if not exists idx_job_attachments_created_by on public.job_attachments (created_by);
create index if not exists idx_jobs_created_by on public.jobs (created_by);
create index if not exists idx_notification_templates_dso_id on public.notification_templates (dso_id);
create index if not exists idx_refreq_requested_by on public.reference_requests (requested_by_user_id);
create index if not exists idx_referrals_application_id on public.referrals (application_id);
create index if not exists idx_referrals_referred_by on public.referrals (referred_by_dso_user_id);
create index if not exists idx_supportfb_auth_user_id on public.support_chat_feedback (auth_user_id);
create index if not exists idx_supportfb_message_id on public.support_chat_feedback (message_id);
create index if not exists idx_support_requests_dso_user_id on public.support_requests (dso_user_id);
create index if not exists idx_support_requests_resolved_by on public.support_requests (resolved_by);
create index if not exists idx_support_requests_reviewed_by on public.support_requests (reviewed_by);
