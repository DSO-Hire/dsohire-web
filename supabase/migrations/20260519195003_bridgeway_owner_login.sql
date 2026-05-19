-- ============================================================
-- Bridgeway Dental Operations owner login — Cam's side-test account.
-- ============================================================
-- Creates an auth.users row + dso_users mapping so Cam can sign in
-- as the Bridgeway owner to demo employer-side workflows (post a
-- job, edit profile, manage applications, etc.).
--
-- Email: cam+bridgeway@dsohire.com (plus-addressing routes to
--        cam@dsohire.com per memory — works for receiving the OTP
--        sign-in code).
-- Password: 'password' (test-only; this is a DEMO account, NOT a
--          real user — fine to use a weak password here).
--
-- The other demo DSOs (Lakeshore, Riverstone, Summit) intentionally
-- left as vanity records — Cam only needs one functional account to
-- demo against.
-- ============================================================

do $$
declare
  v_dso_id uuid;
  v_user_id uuid := gen_random_uuid();
begin
  -- Resolve Bridgeway's DSO id (defensive — fail fast if seed missing).
  select id into v_dso_id
  from public.dsos
  where slug = 'bridgeway-dental-operations';

  if v_dso_id is null then
    raise exception 'bridgeway-dental-operations DSO not found — run companies_demo_seed first';
  end if;

  -- Idempotency: skip if account already exists.
  if exists (
    select 1 from auth.users where email = 'cam+bridgeway@dsohire.com'
  ) then
    raise notice 'cam+bridgeway@dsohire.com already exists — skipping';
    return;
  end if;

  -- Insert into auth.users. We bypass the normal signup flow because
  -- this is a server-side seed; email_confirmed_at is set immediately
  -- so the account is sign-in-ready without an OTP confirmation.
  -- Password is bcrypt-hashed via crypt(); Supabase Auth uses bcrypt
  -- for password verification, so this hash format is compatible.
  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    'cam+bridgeway@dsohire.com',
    crypt('password', gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', 'Cam (Bridgeway Demo)'),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  -- Map to Bridgeway as the owner.
  insert into public.dso_users (
    auth_user_id,
    dso_id,
    role,
    full_name
  ) values (
    v_user_id,
    v_dso_id,
    'owner'::public.dso_user_role,
    'Cam (Bridgeway Demo)'
  );

  raise notice 'Created Bridgeway owner login for cam+bridgeway@dsohire.com (user_id %)', v_user_id;
end;
$$;
