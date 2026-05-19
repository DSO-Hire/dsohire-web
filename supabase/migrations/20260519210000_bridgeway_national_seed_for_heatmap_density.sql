-- Map Phase D, Day 4 demo data seed (2026-05-19).
--
-- Bridgeway only had 6 SE-corridor locations / 9 jobs. The country-wide
-- heatmap overlay looked 80% empty as a result — only 6-8 hex blobs
-- visible across the entire US. This seed adds 27 new metros across
-- every region (NE, SE, MW, South, Mtn, West) with 1-3 jobs per metro
-- so the heatmap actually shows continental density variation.
--
-- Job count distribution chosen so the heatmap reads heterogeneous:
--   - 3-job metros (NYC, LA, Chicago, Dallas, Houston): hottest spots
--   - 2-job metros: medium density
--   - 1-job metros: cool spots
--
-- All locations are public_dso_affiliation = true so they show up in
-- the heatmap RPC and on /companies. Role mix is intentionally varied
-- (dentist / specialist / hygienist / assistant / office / front)
-- so the dashboard doesn't read as a "single role type" board.

DO $$
DECLARE
  v_dso_id CONSTANT uuid := '806ffa40-9701-4a4a-ae83-3d2bc9c09a33';
  v_loc_id uuid;
  v_job_id uuid;
  v_slug_n int := 10;
  r RECORD;
  job_idx int;
  v_title text;
  v_role role_category;
  v_min int;
  v_max int;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('Boston',       'MA', 42.3601::numeric,  -71.0589::numeric, 2),
      ('New York',     'NY', 40.7128::numeric,  -74.0060::numeric, 3),
      ('Philadelphia', 'PA', 39.9526::numeric,  -75.1652::numeric, 2),
      ('Pittsburgh',   'PA', 40.4406::numeric,  -79.9959::numeric, 1),
      ('Washington',   'DC', 38.9072::numeric,  -77.0369::numeric, 2),
      ('Tampa',        'FL', 27.9506::numeric,  -82.4572::numeric, 1),
      ('Orlando',      'FL', 28.5383::numeric,  -81.3792::numeric, 1),
      ('Miami',        'FL', 25.7617::numeric,  -80.1918::numeric, 2),
      ('Jacksonville', 'FL', 30.3322::numeric,  -81.6557::numeric, 1),
      ('Chicago',      'IL', 41.8781::numeric,  -87.6298::numeric, 3),
      ('Indianapolis', 'IN', 39.7684::numeric,  -86.1581::numeric, 1),
      ('Columbus',     'OH', 39.9612::numeric,  -82.9988::numeric, 1),
      ('Cleveland',    'OH', 41.4993::numeric,  -81.6944::numeric, 1),
      ('Detroit',      'MI', 42.3314::numeric,  -83.0458::numeric, 2),
      ('Minneapolis',  'MN', 44.9778::numeric,  -93.2650::numeric, 2),
      ('Milwaukee',    'WI', 43.0389::numeric,  -87.9065::numeric, 1),
      ('St. Louis',    'MO', 38.6270::numeric,  -90.1994::numeric, 1),
      ('Dallas',       'TX', 32.7767::numeric,  -96.7970::numeric, 3),
      ('Austin',       'TX', 30.2672::numeric,  -97.7431::numeric, 2),
      ('San Antonio',  'TX', 29.4241::numeric,  -98.4936::numeric, 2),
      ('Houston',      'TX', 29.7604::numeric,  -95.3698::numeric, 3),
      ('Denver',       'CO', 39.7392::numeric, -104.9903::numeric, 2),
      ('Las Vegas',    'NV', 36.1699::numeric, -115.1398::numeric, 1),
      ('Los Angeles',  'CA', 34.0522::numeric, -118.2437::numeric, 3),
      ('San Diego',    'CA', 32.7157::numeric, -117.1611::numeric, 2),
      ('Portland',     'OR', 45.5152::numeric, -122.6784::numeric, 1),
      ('Seattle',      'WA', 47.6062::numeric, -122.3321::numeric, 2)
    ) AS t(city, state, lat, lng, job_count)
  LOOP
    v_loc_id := gen_random_uuid();
    INSERT INTO dso_locations
      (id, dso_id, name, city, state, latitude, longitude,
       public_dso_affiliation, geocoded_at, created_at, updated_at)
    VALUES
      (v_loc_id, v_dso_id, 'Bridgeway ' || r.city, r.city, r.state, r.lat, r.lng,
       true, NOW(), NOW(), NOW());

    FOR job_idx IN 1..r.job_count LOOP
      IF r.job_count = 3 THEN
        CASE job_idx
          WHEN 1 THEN
            v_title := 'General Dentist';
            v_role := 'dentist'::role_category;
            v_min := 165000; v_max := 235000;
          WHEN 2 THEN
            v_title := 'Pediatric Dentist';
            v_role := 'specialist'::role_category;
            v_min := 220000; v_max := 340000;
          ELSE
            v_title := 'Lead Dental Hygienist';
            v_role := 'dental_hygienist'::role_category;
            v_min := 78000; v_max := 108000;
        END CASE;
      ELSIF r.job_count = 2 THEN
        IF job_idx = 1 THEN
          v_title := 'General Dentist';
          v_role := 'dentist'::role_category;
          v_min := 155000; v_max := 225000;
        ELSE
          v_title := 'Dental Hygienist';
          v_role := 'dental_hygienist'::role_category;
          v_min := 72000; v_max := 98000;
        END IF;
      ELSE
        IF MOD(LENGTH(r.city), 3) = 0 THEN
          v_title := 'Dental Assistant';
          v_role := 'dental_assistant'::role_category;
          v_min := 43000; v_max := 58000;
        ELSIF MOD(LENGTH(r.city), 3) = 1 THEN
          v_title := 'Office Manager';
          v_role := 'office_manager'::role_category;
          v_min := 58000; v_max := 85000;
        ELSE
          v_title := 'Treatment Coordinator';
          v_role := 'front_office'::role_category;
          v_min := 48000; v_max := 62000;
        END IF;
      END IF;

      v_job_id := gen_random_uuid();
      INSERT INTO jobs (
        id, dso_id, title, slug, description,
        employment_type, role_category,
        compensation_min, compensation_max, compensation_period,
        compensation_visible, compensation_type,
        status, scope, specialty, schedule_days, schedule_evenings, schedule_weekends,
        external_links, remote_state_restrictions,
        hide_stages_from_candidate, equity_offered, variable_comp_enabled, bonus_enabled,
        posted_at, created_at, updated_at
      ) VALUES (
        v_job_id, v_dso_id, v_title,
        'bridgeway-dental-operations-' || v_slug_n::text,
        v_title || ' opening at our ' || r.city || ', ' || r.state ||
          ' practice. Full benefits, supportive team environment, ' ||
          'clinical autonomy with operational backing.',
        'full_time'::employment_type, v_role,
        v_min, v_max, 'annual'::compensation_period,
        true, 'range',
        'active'::job_status, 'location'::job_scope, '{}', '{}', false, false,
        '[]'::jsonb, '{}',
        false, false, false, false,
        NOW(), NOW(), NOW()
      );

      INSERT INTO job_locations (job_id, location_id) VALUES (v_job_id, v_loc_id);

      v_slug_n := v_slug_n + 1;
    END LOOP;
  END LOOP;
END $$;
