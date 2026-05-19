-- ============================================================
-- /companies demo seed — 4 polished fake DSOs for prospect demos.
-- ============================================================
-- Goals:
--   • Show the new card branding (logo fallback, banner, brand color
--     accent, role-mix chips, multi-state badge, hover-reveal recent
--     roles) populated with realistic-feeling data
--   • Exercise the new Featured spotlight slot (Bridgeway is featured)
--   • Cover diverse brand-color palette + multi-state coverage
--
-- Naming follows memory: no real DSOs (no Heartland/Aspen/Pacific),
-- canonical fake "Lakeshore Dental Group" used. Other names are
-- evocative-but-clearly-not-real.
--
-- Idempotent via ON CONFLICT (slug) DO NOTHING — re-running this
-- migration is safe but won't update existing rows. To refresh seed
-- data, manually delete by slug first.
-- ============================================================

-- ─── 1. DSOs ──────────────────────────────────────────────
insert into public.dsos (
  name, slug, description, brand_color, banner_url,
  headquarters_city, headquarters_state, practice_count,
  status, verified_at, featured_until
) values
  (
    'Lakeshore Dental Group',
    'lakeshore-dental-group',
    'Established mid-market DSO focused on family dentistry across the Sun Belt. We operate 28 practices with a back-office stack that handles credentialing, payroll, and insurance verification — so clinicians focus on patients, not paperwork.',
    '#1F3A5F',
    'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=1200&h=300&fit=crop&q=80',
    'Austin', 'TX', 28,
    'active', now(), null
  ),
  (
    'Riverstone Dental Partners',
    'riverstone-dental-partners',
    'Patient-first DSO building the largest network of independent-feeling practices across Florida and the Southeast. Each location keeps its name, its team, and its community ties — Riverstone handles the centralized support.',
    '#1A6F73',
    null,
    'Tampa', 'FL', 22,
    'active', now(), null
  ),
  (
    'Summit Dental Group',
    'summit-dental-group',
    'Mountain West DSO emphasizing operator-owner clinical autonomy and shared back-office strength. Active across CO, UT, WY, and ID with a focus on rural and underserved communities.',
    '#2D5A3D',
    null,
    'Denver', 'CO', 15,
    'active', now(), null
  ),
  (
    'Bridgeway Dental Operations',
    'bridgeway-dental-operations',
    'Carolinas + Southeast DSO with an investor-backed growth plan, in-house specialist network, and a modern central-office stack covering billing, HR, marketing, and IT. Currently the fastest-growing dental group in the Southeast region.',
    '#B85C38',
    'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=1200&h=300&fit=crop&q=80',
    'Charlotte', 'NC', 35,
    'active', now(), now() + interval '60 days'
  )
on conflict (slug) do nothing;

-- ─── 2. Locations ────────────────────────────────────────
insert into public.dso_locations (
  dso_id, name, city, state, latitude, longitude
)
select d.id, loc.name, loc.city, loc.state, loc.lat, loc.lng
from public.dsos d
join (values
  -- Lakeshore — TX, CO, AZ, NM
  ('lakeshore-dental-group', 'Lakeshore Dental — Austin', 'Austin', 'TX', 30.2672, -97.7431),
  ('lakeshore-dental-group', 'Lakeshore Dental — Dallas', 'Dallas', 'TX', 32.7767, -96.7970),
  ('lakeshore-dental-group', 'Lakeshore Dental — Houston', 'Houston', 'TX', 29.7604, -95.3698),
  ('lakeshore-dental-group', 'Lakeshore Dental — Denver', 'Denver', 'CO', 39.7392, -104.9903),
  ('lakeshore-dental-group', 'Lakeshore Dental — Phoenix', 'Phoenix', 'AZ', 33.4484, -112.0740),
  ('lakeshore-dental-group', 'Lakeshore Dental — Albuquerque', 'Albuquerque', 'NM', 35.0844, -106.6504),
  -- Riverstone — FL, GA, AL
  ('riverstone-dental-partners', 'Riverstone — Tampa', 'Tampa', 'FL', 27.9506, -82.4572),
  ('riverstone-dental-partners', 'Riverstone — Orlando', 'Orlando', 'FL', 28.5383, -81.3792),
  ('riverstone-dental-partners', 'Riverstone — Miami', 'Miami', 'FL', 25.7617, -80.1918),
  ('riverstone-dental-partners', 'Riverstone — Atlanta', 'Atlanta', 'GA', 33.7490, -84.3880),
  ('riverstone-dental-partners', 'Riverstone — Birmingham', 'Birmingham', 'AL', 33.5186, -86.8104),
  -- Summit — CO, UT, WY, ID
  ('summit-dental-group', 'Summit — Denver', 'Denver', 'CO', 39.7392, -104.9903),
  ('summit-dental-group', 'Summit — Salt Lake City', 'Salt Lake City', 'UT', 40.7608, -111.8910),
  ('summit-dental-group', 'Summit — Cheyenne', 'Cheyenne', 'WY', 41.1400, -104.8202),
  ('summit-dental-group', 'Summit — Boise', 'Boise', 'ID', 43.6150, -116.2023),
  -- Bridgeway — NC, SC, VA, GA, TN
  ('bridgeway-dental-operations', 'Bridgeway — Charlotte', 'Charlotte', 'NC', 35.2271, -80.8431),
  ('bridgeway-dental-operations', 'Bridgeway — Raleigh', 'Raleigh', 'NC', 35.7796, -78.6382),
  ('bridgeway-dental-operations', 'Bridgeway — Charleston', 'Charleston', 'SC', 32.7765, -79.9311),
  ('bridgeway-dental-operations', 'Bridgeway — Richmond', 'Richmond', 'VA', 37.5407, -77.4360),
  ('bridgeway-dental-operations', 'Bridgeway — Atlanta', 'Atlanta', 'GA', 33.7490, -84.3880),
  ('bridgeway-dental-operations', 'Bridgeway — Nashville', 'Nashville', 'TN', 36.1627, -86.7816)
) as loc(slug, name, city, state, lat, lng) on d.slug = loc.slug;

-- ─── 3. Jobs ─────────────────────────────────────────────
insert into public.jobs (
  dso_id, slug, title, employment_type, role_category, status, posted_at
)
select
  d.id,
  d.slug || '-' || row_number() over (partition by d.slug order by j.posted_days),
  j.title,
  j.emp::public.employment_type,
  j.cat::public.role_category,
  'active'::public.job_status,
  now() - (j.posted_days || ' days')::interval
from public.dsos d
join (values
  -- Lakeshore (8 jobs)
  ('lakeshore-dental-group', 'Associate Dentist', 'full_time', 'dentist', 2),
  ('lakeshore-dental-group', 'Dental Hygienist', 'full_time', 'dental_hygienist', 4),
  ('lakeshore-dental-group', 'Dental Hygienist', 'part_time', 'dental_hygienist', 7),
  ('lakeshore-dental-group', 'Lead Dental Assistant', 'full_time', 'dental_assistant', 9),
  ('lakeshore-dental-group', 'Front Office Coordinator', 'full_time', 'front_office', 11),
  ('lakeshore-dental-group', 'Office Manager', 'full_time', 'office_manager', 14),
  ('lakeshore-dental-group', 'Regional Practice Manager', 'full_time', 'regional_manager', 18),
  ('lakeshore-dental-group', 'Pediatric Specialist', 'full_time', 'specialist', 22),
  -- Riverstone (6 jobs)
  ('riverstone-dental-partners', 'Associate Dentist', 'full_time', 'dentist', 1),
  ('riverstone-dental-partners', 'Dental Hygienist', 'full_time', 'dental_hygienist', 3),
  ('riverstone-dental-partners', 'Treatment Coordinator', 'full_time', 'front_office', 6),
  ('riverstone-dental-partners', 'Dental Assistant (EFDA)', 'full_time', 'dental_assistant', 10),
  ('riverstone-dental-partners', 'Office Manager', 'full_time', 'office_manager', 15),
  ('riverstone-dental-partners', 'Endodontist', 'part_time', 'specialist', 19),
  -- Summit (5 jobs)
  ('summit-dental-group', 'Associate Dentist', 'full_time', 'dentist', 3),
  ('summit-dental-group', 'Dental Hygienist', 'full_time', 'dental_hygienist', 5),
  ('summit-dental-group', 'Front Desk Lead', 'full_time', 'front_office', 8),
  ('summit-dental-group', 'Dental Assistant', 'part_time', 'dental_assistant', 12),
  ('summit-dental-group', 'Multi-Location Office Manager', 'full_time', 'office_manager', 16),
  -- Bridgeway (9 jobs)
  ('bridgeway-dental-operations', 'Associate Dentist', 'full_time', 'dentist', 1),
  ('bridgeway-dental-operations', 'Associate Dentist', 'full_time', 'dentist', 2),
  ('bridgeway-dental-operations', 'Orthodontist', 'full_time', 'specialist', 3),
  ('bridgeway-dental-operations', 'Dental Hygienist', 'full_time', 'dental_hygienist', 4),
  ('bridgeway-dental-operations', 'Dental Hygienist', 'full_time', 'dental_hygienist', 6),
  ('bridgeway-dental-operations', 'Lead Dental Assistant', 'full_time', 'dental_assistant', 8),
  ('bridgeway-dental-operations', 'Treatment Coordinator', 'full_time', 'front_office', 11),
  ('bridgeway-dental-operations', 'Regional Office Manager', 'full_time', 'office_manager', 13),
  ('bridgeway-dental-operations', 'Director of Operations', 'full_time', 'regional_manager', 20)
) as j(slug, title, emp, cat, posted_days) on d.slug = j.slug
on conflict (dso_id, slug) do nothing;
