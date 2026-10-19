-- Warm intro ask for a connector inside the target group (2026-10-19):
-- someone who knows Cam but does not own hiring (e.g. BD at Lumio).
-- Compose picks it automatically when the recipient's role is connector.
insert into public.crm_email_templates (key, name, channel, subject, body, next_step_days, next_step, sort) values
('warm_inside_connector', 'Warm: intro to their recruiting lead', 'email', 'quick favor on the {group} side',
E'Hi {first_name},\n\nHope things are good. You may remember I''ve been building DSO Hire, a hiring platform just for dental groups. It''s live now: one flat monthly fee covers every location, with no per-listing or placement fees.\n\nI''d love to get it in front of whoever owns recruiting at {group}. Who''s the right person? A name is plenty, and if you''re comfortable making a quick intro, even better. I''ll keep it short and mention you pointed me their way.\n\nHere''s a live demo set up for {group} if you want to see what I''d show them, nothing to sign up for: {demo_link}\n\nThanks either way,',
 4, 'Nudge for the intro if no reply', 45)
on conflict (key) do nothing;
