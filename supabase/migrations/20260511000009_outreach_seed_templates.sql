-- ─────────────────────────────────────────────────────────────
-- Outreach templates — seed starters per DSO (Phase 5D Day 2)
-- ─────────────────────────────────────────────────────────────
--
-- Three starter templates land in every DSO's library so the modal's
-- picker isn't empty on day one. Each template uses the merge-field
-- tokens resolved server-side in the send path
-- (src/lib/outreach/merge-fields.ts).
--
-- Behavior:
--   - On DSO creation, a trigger fires the seed function.
--   - Existing DSOs with zero templates get backfilled at the end of
--     this migration.
--   - DSOs with at least one template are left alone — we never
--     overwrite or duplicate.
--   - Recruiters can edit or delete the seeded rows freely; they're
--     not protected.

create or replace function public.seed_outreach_templates_for_dso(p_dso_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- Idempotency guard: only seed when the DSO has no templates yet.
  if exists (
    select 1 from public.dso_outreach_templates where dso_id = p_dso_id limit 1
  ) then
    return;
  end if;

  insert into public.dso_outreach_templates (dso_id, name, subject, body)
  values
    (
      p_dso_id,
      'Associate Dentist — comp-first',
      '{{candidate.first_name}}, an Associate Dentist opportunity at {{dso.name}}',
      'Hi {{candidate.first_name}},

I''m {{sender.first_name}}, hiring for an Associate Dentist role at {{dso.name}}. Your background looked like a strong match, especially the years of clinical experience and your stated location preferences.

A few quick details about the role:
- Competitive base + production bonus structure
- Modern, fully digital practice with experienced support staff
- Mentorship from senior dentists on day one
- Real partnership track for the right person

Would you be open to a 15-minute call this week to talk through the opportunity? I can also send over the formal comp model and benefits doc if that''s easier.

Best,
{{sender.name}}'
    ),
    (
      p_dso_id,
      'Dental Hygienist — friendly intro',
      'A hygienist role at {{dso.name}} you''d be perfect for',
      'Hi {{candidate.first_name}},

I came across your profile on DSO Hire and wanted to reach out about an opening at {{dso.name}}. You''re exactly the kind of hygienist we love working with — strong clinical experience, great patient skills, and licensed in our state.

We''re hiring for a hygienist on our team. Highlights:
- 4-day work week available
- $5K signing bonus + relocation help if needed
- Top-of-market hourly + production incentives
- Tenured front office and dental assistants

If any of that catches your interest, hit reply and let''s find time to talk. No pressure either way — happy to answer questions even if it''s not the right fit right now.

Thanks,
{{sender.name}}
{{dso.name}}'
    ),
    (
      p_dso_id,
      'Front Office / Office Manager — quick reach-out',
      '{{candidate.first_name}}, a front office opportunity at {{dso.name}}',
      'Hi {{candidate.first_name}},

{{sender.first_name}} from {{dso.name}}. We''re building out the front office team and your background — especially the practice management experience — looked like a really strong fit for what we''re hiring for.

Quick on what we offer:
- Full benefits + 401(k) match
- Paid CE + training budget
- Clear path to office manager for the right person
- Great team culture (we mean it — happy to share references from current staff)

Open to a quick conversation? Even a 10-minute call would let me share more about the role.

Best,
{{sender.name}}'
    );
end;
$$;

-- Trigger: seed on DSO insert.
create or replace function public.seed_outreach_templates_on_dso_insert()
returns trigger
language plpgsql
security definer
as $$
begin
  perform public.seed_outreach_templates_for_dso(NEW.id);
  return NEW;
end;
$$;

drop trigger if exists dso_outreach_templates_seed_on_insert on public.dsos;
create trigger dso_outreach_templates_seed_on_insert
  after insert on public.dsos
  for each row execute function public.seed_outreach_templates_on_dso_insert();

-- One-time backfill for existing DSOs with zero templates.
do $$
declare
  d record;
begin
  for d in
    select id from public.dsos
    where deleted_at is null
  loop
    perform public.seed_outreach_templates_for_dso(d.id);
  end loop;
end $$;