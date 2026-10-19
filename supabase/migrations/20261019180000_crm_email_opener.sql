-- Per-account email subject + opening (2026-10-19). The first-touch
-- template's opening must be email copy, not the research notes (which
-- read like "STRONG. 2026-10-19: ..."). Seeded for batch 1 from
-- docs/sales/first-touch-batch1.md. Archway is left out on purpose: it is
-- a warm intro through a connector, not a cold email.
alter table public.crm_accounts
  add column email_subject text check (email_subject is null or char_length(email_subject) <= 200),
  add column email_opener text check (email_opener is null or char_length(email_opener) <= 2000);

update public.crm_email_templates
set subject = '{subject}',
    body = E'Hi {first_name},\n\n{opener}\n\nI set up a live demo for {group}. It''s the real product with sample data, nothing to sign up for: {demo_link}\n\nWorth 15 minutes to see whether it fits how you hire?',
    updated_at = now()
where key = 'cold_first';
update public.crm_email_templates set subject = 'Re: {subject}', updated_at = now() where key in ('cold_follow_1','cold_follow_2');

update public.crm_accounts a set email_subject = v.subj, email_opener = v.body
from (values
 ('Shared Practices Group', 'staffing new offices at Shared Practices',
  E'With a de novo model, every new office starts with an empty schedule to fill. When I looked this week you had about 41 open roles, including surgical assistants and implant dentists.\n\nDSO Hire is built for exactly that: one flat monthly fee covers every location, roles post to all of them at once, and there are no per-listing or placement fees, including on the dentist seats agencies charge the most for.'),
 ('Lumio Dental', 'Lumio''s dentist openings',
  E'When I looked this week, Lumio had about 83 open roles, roughly half of them dentist positions, many in states that look new for you.\n\nDentist seats in new markets are where agency fees get expensive. DSO Hire is one flat monthly fee across every office, no placement fees, and every applicant gets a fit score against how each practice actually runs, which helps when you''re hiring somewhere you don''t know the local market yet.'),
 ('Mosaic Dental Collective', '53 open roles at Mosaic',
  E'When I looked this week, Mosaic had about 53 open roles across California, Washington and Idaho, spanning associates, specialists, hygienists and front office.\n\nThat''s a lot of hiring to run across one team. DSO Hire is one flat monthly fee for every location: post once to all of them, one pipeline your regional leads can share, and no per-listing or placement fees.'),
 ('Rodeo Dental & Orthodontics', 'hiring across two systems at Rodeo',
  E'When I looked this week, Rodeo had about 64 staff openings on one hiring system and another 14 doctor openings on a second, across Texas, Colorado and Arizona.\n\nSplitting hiring across tools usually means splitting the picture of who''s in the pipeline. DSO Hire puts every role, staff and doctors, at every location in one pipeline for one flat monthly fee, with no placement fees on the doctor seats.'),
 ('Bright Direction Dental', '35 openings across Bright Direction',
  E'When I looked this week, Bright Direction had about 35 open roles across the Midwest: assistants, hygienists, dentists and front desk.\n\nFor a group supporting 40-plus practices without a big corporate recruiting team behind it, DSO Hire is one flat monthly fee for every location: post once to all of them, one shared pipeline, no per-listing or placement fees.'),
 ('Chord Specialty Dental Partners', 'welcoming Prairie Kids and Clover Kids',
  E'Congrats on bringing Prairie Kids Dental and Clover Kids Dental into the network in September. When I looked this week, Chord had about 91 openings network-wide.\n\nSpecialty groups hire for roles general boards don''t understand well. DSO Hire is dental-only, one flat monthly fee across every location, no placement fees, with fit scoring that weighs specialty experience.'),
 ('Wave Dental Professionals', 'Wave''s new Tennessee offices',
  E'It looks like Wave is building out in Tennessee and just opened in Buckhead. When I looked this week you had about 20 open roles, most posted in the last two months.\n\nOpening new markets means hiring before you have a local bench. DSO Hire is one flat monthly fee covering every office: post once to all of them, one pipeline, and no placement fees when you fill the dentist and specialist seats.'),
 ('Seva Dental Team', 'Seva''s Ohio growth',
  E'Congrats on the run of Ohio additions this year. When I looked this week, Seva had 11 open roles, seven of them hygienists.\n\nHygienists are the hardest seat in dentistry right now. DSO Hire is dental-only: one flat monthly fee for every office, no placement fees, and candidates scored on fit with each practice so the good ones don''t wait.'),
 ('Tend', '24 open roles across Tend''s studios',
  E'When I looked this week, Tend had about 24 open roles across its studios, including 11 dentist positions.\n\nDSO Hire is one flat monthly fee across every location, no per-listing or placement fees, and every applicant gets a fit score against how each studio actually runs. Worth a look given how many dentist seats you''re filling.')
) as v(name, subj, body)
where a.name = v.name;
