-- CRM access model (2026-10-19). Run against a database with the
-- 20261019120000_crm_core migration applied. Rolls itself back: the final
-- RAISE aborts the transaction and its message carries the results.
-- Expected: aal2_admin_rw=true aal1_sees=0 aal1_insert=denied
--           outsider_sees=0 outsider_insert=denied anon_read=denied
do $$
declare
  admin_id uuid := (select auth_user_id from public.admin_users where role = 'superadmin' limit 1);
  outsider uuid := (select id from auth.users where id not in (select auth_user_id from public.admin_users) limit 1);
  acct uuid; n int; r text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub',admin_id,'role','authenticated','aal','aal2')::text, true);
  set local role authenticated;
  insert into public.crm_accounts(name) values ('RoleSim Test Group') returning id into acct;
  select count(*) into n from public.crm_accounts where id = acct;
  r := r || 'aal2_admin_rw=' || (n = 1);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',admin_id,'role','authenticated','aal','aal1')::text, true);
  set local role authenticated;
  select count(*) into n from public.crm_accounts; r := r || ' aal1_sees=' || n;
  begin insert into public.crm_accounts(name) values ('x'); r := r || ' aal1_insert=ALLOWED';
  exception when insufficient_privilege then r := r || ' aal1_insert=denied'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',outsider,'role','authenticated','aal','aal2')::text, true);
  set local role authenticated;
  select count(*) into n from public.crm_accounts; r := r || ' outsider_sees=' || n;
  begin insert into public.crm_tasks(title) values ('x'); r := r || ' outsider_insert=ALLOWED';
  exception when insufficient_privilege then r := r || ' outsider_insert=denied'; end;
  reset role;

  set local role anon;
  begin perform 1 from public.crm_accounts; r := r || ' anon_read=ALLOWED';
  exception when insufficient_privilege then r := r || ' anon_read=denied'; end;
  reset role;

  raise exception 'CRM ROLE-SIM %', r;
end $$;
