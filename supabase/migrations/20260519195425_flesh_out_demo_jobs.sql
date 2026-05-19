-- ============================================================
-- Flesh out the 28 demo jobs with realistic content for prospect demos.
-- ============================================================
-- Cam 2026-05-19: blank descriptions + missing comp made the demo jobs
-- look unfinished. Populating each role-category with role-appropriate
-- content makes the platform look professional in screen-shares and
-- on-call demos.
--
-- Content keyed by role_category — every Hygienist on every demo DSO
-- gets the same template (with {{dso_name}} interpolated). Real DSOs
-- write their own JDs via the wizard; this is purely seed polish.
--
-- Three updates:
--   1. UPDATE jobs SET description, compensation, requirements, bonus
--   2. UPDATE benefits arrays (separate because PG arrays are awkward
--      in CASE statements — one UPDATE per role family)
--   3. INSERT INTO job_locations linking each demo job to one of its
--      DSO's locations (round-robin via hashtext-mod-count)
-- ============================================================

-- ── 1. Description + compensation per role_category ────────
with role_templates as (
  select * from (values
    (
      'dentist',
      E'Join {{dso_name}}''s growing clinical team as an Associate Dentist. We''re actively hiring across multiple locations and looking for a dentist who values clinical autonomy, modern equipment, and a back-office team that lets you focus on patient care — not paperwork.\n\nWhat you''ll do:\n• Deliver high-quality general dentistry — exams, restorations, crowns, extractions, root canals, prosthodontics\n• Build long-term patient relationships across a steady recall base\n• Collaborate with the hygiene team and dental assistants on treatment planning\n• Maintain detailed clinical documentation in our practice management system\n\nWhat we''re looking for:\n• DDS or DMD from an accredited dental school\n• Active state license (or eligible to obtain)\n• 1+ years of clinical experience preferred — new grads with strong references and mentorship hunger welcome\n• Comfort with digital radiography, intraoral scanners, and CAD/CAM workflows\n• Patient-first communication style and strong case-presentation skills\n\nWhy {{dso_name}}:\n• Established multi-location group with strong central support (HR, billing, IT, marketing all handled)\n• Competitive base salary + monthly production bonus\n• Full benefits including malpractice, CE allowance, and 401(k) match\n• Clear path to partnership / equity for high-performing associates',
      145000, 220000, 'annual'::public.compensation_period,
      E'DDS or DMD from accredited dental school; active state license (or license-eligible); strong clinical fundamentals; comfortable with digital workflows.',
      true, 30000
    ),
    (
      'specialist',
      E'{{dso_name}} is expanding our specialty network and looking for a Specialist (Pediatric, Endodontics, Orthodontics, or Oral Surgery — role-dependent) to join our growing clinical team. You''ll operate with full clinical autonomy backed by a sophisticated central-support infrastructure.\n\nWhat you''ll do:\n• Deliver specialty care across multiple {{dso_name}} locations on a rotation that fits your schedule\n• Build referral relationships with our general dentists and external referring offices\n• Mentor clinical assistants on specialty-specific protocols\n• Contribute to internal CE programming and clinical standards\n\nWhat we''re looking for:\n• Completed specialty residency from a CODA-accredited program\n• Board-eligible or board-certified\n• Active state license + DEA registration\n• 2+ years post-residency clinical experience\n• Excellent communication with patients, parents, and referring providers\n\nWhy {{dso_name}}:\n• Specialty-friendly environment with modern operatories purpose-built for your workflow\n• Production-based compensation with the upside specialists deserve\n• Full malpractice coverage including tail coverage on departure\n• Equity / partnership conversations open to top performers',
      220000, 360000, 'annual'::public.compensation_period,
      E'Specialty residency from CODA-accredited program; board-eligible or board-certified; active state license + DEA; 2+ years post-residency.',
      true, 60000
    ),
    (
      'dental_hygienist',
      E'{{dso_name}} is hiring Dental Hygienists across our network of multi-location practices. We''re building a hygiene team that''s respected, supported, and paid for the clinical professionals they are.\n\nWhat you''ll do:\n• Deliver thorough prophy and periodontal care across a recall schedule designed for quality, not quantity\n• Perform comprehensive periodontal assessments and partner with dentists on treatment planning\n• Educate patients on oral health, home care, and recommended treatment\n• Maintain meticulous clinical documentation and digital imaging\n\nWhat we''re looking for:\n• Associate''s or Bachelor''s in Dental Hygiene from an accredited program\n• Active state RDH license; local anesthesia certification where applicable\n• Current CPR certification\n• 1+ years clinical experience preferred; new grads encouraged to apply\n• Patient-centered communication and detail-oriented documentation habits\n\nWhy {{dso_name}}:\n• Competitive hourly rate or salary path — your choice based on schedule\n• Full benefits at 30+ hours/week including health, dental, vision, PTO, 401(k) match\n• Paid CE allowance and conference stipend\n• Predictable schedule with backup coverage across sister practices when you take time off',
      40, 55, 'hourly'::public.compensation_period,
      E'Associate''s or Bachelor''s in Dental Hygiene; active state RDH license; current CPR; local anesthesia cert preferred; 1+ year clinical experience.',
      false, null
    ),
    (
      'dental_assistant',
      E'{{dso_name}} is hiring Dental Assistants (EFDA where applicable) across our practice locations. If you''re looking for a real career path in dentistry — not just a stepping-stone job — this is the place.\n\nWhat you''ll do:\n• Provide chairside assistance for restorative, surgical, and hygiene procedures\n• Perform expanded functions in states that allow it (coronal polishing, sealants, etc.)\n• Manage instrument sterilization and treatment-room turnover\n• Take and process digital X-rays per protocol\n• Educate patients on post-op care and home maintenance\n\nWhat we''re looking for:\n• DA or EFDA certification (state-dependent)\n• Active state radiology certification\n• 1+ year of chairside experience preferred; we will train motivated entry-level candidates\n• Comfort with digital imaging and electronic health records\n• Strong patient communication skills\n\nWhy {{dso_name}}:\n• EFDA training and certification reimbursement for non-EFDA hires\n• Clear career ladder: DA → Lead DA → Office Manager track\n• Full benefits at 30+ hours including health insurance and 401(k) match\n• Sister-practice coverage so time-off requests don''t get denied for staffing reasons',
      22, 32, 'hourly'::public.compensation_period,
      E'DA or EFDA certification (state-dependent); active state radiology cert; 1+ year chairside experience preferred; willingness to train.',
      false, null
    ),
    (
      'front_office',
      E'{{dso_name}} is hiring Front Office team members across our locations. This is a real career, not a stop-gap — our front desk is where exceptional patient experiences start, and we invest in the people who deliver them.\n\nWhat you''ll do:\n• Greet patients and manage check-in / check-out across a busy schedule\n• Verify insurance benefits and present treatment estimates with confidence\n• Schedule recall and treatment appointments using our practice management system\n• Collect copays and balances with empathy and clarity\n• Coordinate with clinical team on patient flow and treatment plan acceptance\n\nWhat we''re looking for:\n• 1+ year dental or medical front-office experience preferred (we will train candidates with strong service backgrounds)\n• Familiarity with Dentrix, Eaglesoft, Open Dental, or comparable PMS\n• Insurance verification experience a strong plus\n• Polished communication style — verbal, written, and on the phone\n• Detail orientation and the patience to handle complex schedules\n\nWhy {{dso_name}}:\n• Defined growth path: Front Desk → Senior Coordinator → Treatment Coordinator → Office Manager\n• Performance bonuses tied to treatment plan acceptance and collections\n• Predictable practice hours (no evening or weekend rotations at most locations)\n• Centralized insurance verification team handles the back-and-forth so you can focus on patients',
      19, 28, 'hourly'::public.compensation_period,
      E'1+ year dental/medical front-office experience preferred; PMS familiarity (Dentrix, Eaglesoft, Open Dental); polished patient-facing communication.',
      true, 6000
    ),
    (
      'office_manager',
      E'{{dso_name}} is hiring an Office Manager to lead one of our practice locations. You''ll own the day-to-day operations, team leadership, and patient experience while {{dso_name}}''s central office handles billing, HR, and IT — so you can focus on what makes a practice great.\n\nWhat you''ll do:\n• Lead a team of 6-15 (depending on practice size) including front desk, dental assistants, and hygienists\n• Own practice P&L: production, collections, treatment plan acceptance, payroll variance\n• Partner with the lead dentist on clinical strategy and patient mix\n• Drive new-patient acquisition through local marketing and referral programs\n• Recruit, onboard, and develop team members in coordination with central HR\n\nWhat we''re looking for:\n• 3+ years dental office management experience (or equivalent multi-unit retail/healthcare ops)\n• Strong P&L literacy — comfortable reading practice financials and acting on them\n• Proven team-leadership track record\n• Familiarity with dental PMS systems and insurance billing workflows\n• Bias toward action and the operating discipline to maintain it\n\nWhy {{dso_name}}:\n• Real autonomy paired with sophisticated central support\n• Performance-based bonus structure tied to practice KPIs\n• Path to Regional Manager / Director of Operations for top performers\n• Full benefits including health, dental, vision, 401(k) match, and CE allowance',
      58000, 85000, 'annual'::public.compensation_period,
      E'3+ years dental office management or equivalent multi-unit healthcare/retail ops; P&L literacy; team-leadership experience; PMS proficiency.',
      true, 12000
    ),
    (
      'regional_manager',
      E'{{dso_name}} is hiring a Regional Practice Manager / Director of Operations to lead a portfolio of locations through our next phase of growth. This is a strategic role with real P&L ownership, executive-team visibility, and a clear path to corporate leadership.\n\nWhat you''ll do:\n• Own the operating performance of 5-12 practice locations in your region\n• Coach Office Managers on KPIs: production, collections, treatment acceptance, schedule density\n• Lead new-location integration when acquisitions close\n• Partner with central marketing, HR, and finance on regional strategy\n• Build the next bench of OMs through internal promotion and external recruiting\n\nWhat we''re looking for:\n• 5+ years multi-unit operations leadership in dental, medical, or service-based retail\n• Proven ability to turn around underperforming locations\n• Strong financial acumen and operating-rhythm discipline\n• Excellent written and verbal communication — you''ll work across clinicians, ops, and executive\n• Willingness to travel 30-50% within region\n\nWhy {{dso_name}}:\n• Direct exposure to the executive team and DSO-wide strategy\n• Compensation package designed to attract operators who could lead a single-DSO\n• Equity participation for senior operators\n• A platform that''s growing fast enough to keep stretch challenges on your desk every quarter',
      95000, 160000, 'annual'::public.compensation_period,
      E'5+ years multi-unit ops leadership (dental, medical, or service retail); strong financial acumen; willingness to travel 30-50%; demonstrated team-building track record.',
      true, 35000
    )
  ) as t(role, desc_tmpl, cmin, cmax, period, reqs, bon, btarget)
)
update public.jobs j
set
  description = replace(rt.desc_tmpl, '{{dso_name}}', d.name),
  compensation_min = rt.cmin,
  compensation_max = rt.cmax,
  compensation_period = rt.period,
  requirements = rt.reqs,
  bonus_enabled = rt.bon,
  bonus_target = rt.btarget
from role_templates rt, public.dsos d
where j.role_category::text = rt.role
  and j.dso_id = d.id
  and d.slug in (
    'lakeshore-dental-group',
    'riverstone-dental-partners',
    'summit-dental-group',
    'bridgeway-dental-operations'
  );

-- ── 2. Benefits array — applied separately per role family ─

update public.jobs j
set benefits = array[
  'Health insurance', 'Dental coverage', 'Vision coverage',
  '401(k) with employer match', 'Malpractice insurance',
  'Paid time off', 'CE allowance ($2,500/yr)',
  'Sign-on bonus available', 'Mentorship program',
  'Path to partnership / equity'
]
from public.dsos d
where j.dso_id = d.id
  and d.slug in ('lakeshore-dental-group','riverstone-dental-partners','summit-dental-group','bridgeway-dental-operations')
  and j.role_category::text in ('dentist','specialist');

update public.jobs j
set benefits = array[
  'Health insurance', 'Dental coverage', 'Vision coverage',
  '401(k) with employer match', 'Paid time off',
  'CE allowance', 'License renewal reimbursement',
  'Uniform allowance', 'Sister-practice coverage for time-off'
]
from public.dsos d
where j.dso_id = d.id
  and d.slug in ('lakeshore-dental-group','riverstone-dental-partners','summit-dental-group','bridgeway-dental-operations')
  and j.role_category::text in ('dental_hygienist','dental_assistant');

update public.jobs j
set benefits = array[
  'Health insurance', 'Dental coverage', 'Vision coverage',
  '401(k) with employer match', 'Paid time off',
  'Performance bonus eligibility', 'Defined growth path',
  'Predictable practice hours', 'Internal mobility across locations'
]
from public.dsos d
where j.dso_id = d.id
  and d.slug in ('lakeshore-dental-group','riverstone-dental-partners','summit-dental-group','bridgeway-dental-operations')
  and j.role_category::text in ('front_office','office_manager');

update public.jobs j
set benefits = array[
  'Health insurance', 'Dental coverage', 'Vision coverage',
  '401(k) with employer match', 'Unlimited PTO',
  'Performance bonus + equity participation',
  'Executive-team visibility', 'Travel + expense reimbursement',
  'Path to corporate leadership'
]
from public.dsos d
where j.dso_id = d.id
  and d.slug in ('lakeshore-dental-group','riverstone-dental-partners','summit-dental-group','bridgeway-dental-operations')
  and j.role_category::text = 'regional_manager';

-- ── 3. Link each demo job to one of its DSO's locations ────
-- Round-robin via hashtext+mod for spread. abs() guards against
-- negative hash values producing a negative OFFSET. greatest(...,1)
-- protects against division-by-zero if a DSO had no locations
-- (shouldn't happen post-seed but defensive).
insert into public.job_locations (job_id, location_id)
select
  j.id,
  (
    select loc.id
    from public.dso_locations loc
    where loc.dso_id = j.dso_id
    order by loc.name
    limit 1
    offset abs(hashtext(j.slug)) % greatest(
      (select count(*) from public.dso_locations where dso_id = j.dso_id),
      1
    )
  )
from public.jobs j
join public.dsos d on d.id = j.dso_id
where d.slug in (
  'lakeshore-dental-group',
  'riverstone-dental-partners',
  'summit-dental-group',
  'bridgeway-dental-operations'
)
and not exists (
  select 1 from public.job_locations jl where jl.job_id = j.id
);
