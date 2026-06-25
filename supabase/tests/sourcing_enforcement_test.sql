-- ───────────────────────────────────────────────────────────────────
-- supabase/tests/sourcing_enforcement_test.sql
--
-- Integration test for the Sourcing CRM enforcement invariants that the
-- pure-logic unit net (src/lib/sourcing/*.test.ts) cannot cover, because they
-- live in the database rather than in TypeScript:
--
--   (A) prospect_threads candidate-side COLUMN LOCK
--       (migration 20260625165452_prospect_thread_candidate_column_lock.sql):
--       a candidate may mute / block / reveal their OWN thread, but may NOT
--       change identifying/relational columns (dso_id, candidate_id,
--       application_id, created_by, created_at, id) or force status='converted'.
--       DSO members (their own thread) and service-role/system writers
--       (auth.uid() IS NULL) are NOT constrained.
--
--   (B) candidate_blocked_employers — the Phase-0 block-list relation that every
--       discovery + outbound surface filters through via
--       src/lib/sourcing/blocklist.ts — is present and queryable for a
--       (candidate, dso) pair. (The pure fail-safe guards of that helper are
--       unit-tested in src/lib/sourcing/blocklist.test.ts; this asserts the
--       DB-level relation those callers depend on.)
--
-- SAFE TO RUN ANYTIME. It inserts only synthetic rows tied to a real existing
-- candidate+DSO pair, asserts, then DELETES them — nothing survives the run. It
-- raises (fails loudly / non-zero) if any assertion fails, so it is CI-usable.
--
--   Run:  psql "$DATABASE_URL" -f supabase/tests/sourcing_enforcement_test.sql
--   (or paste into the Supabase SQL editor / run via the MCP connector)
-- ───────────────────────────────────────────────────────────────────

do $$
declare
  v_cand_id   uuid;
  v_cand_auth uuid;
  v_dso_id    uuid;
  v_dso_auth  uuid;
  v_thread    uuid;
  v_fail      int;
  r           record;
begin
  -- Real identities to drive the RLS/trigger contexts (auth.uid() ← jwt claims).
  select c.id, c.auth_user_id into v_cand_id, v_cand_auth
    from public.candidates c
    where c.auth_user_id is not null
    order by c.created_at limit 1;
  select du.dso_id, du.auth_user_id into v_dso_id, v_dso_auth
    from public.dso_users du
    where du.auth_user_id is not null and du.role in ('owner','admin','recruiter')
    limit 1;
  if v_cand_id is null or v_dso_id is null then
    raise notice 'SKIP: need at least one candidate (with auth) and one owner/admin/recruiter dso_user';
    return;
  end if;
  -- Avoid colliding with a real thread for this exact pair (unique dso+candidate).
  if exists (select 1 from public.prospect_threads where dso_id=v_dso_id and candidate_id=v_cand_id) then
    raise notice 'SKIP: the chosen candidate+DSO already have a real prospect thread';
    return;
  end if;

  create temp table _t(name text, passed boolean, detail text) on commit drop;
  insert into public.prospect_threads(dso_id, candidate_id, status)
    values (v_dso_id, v_cand_id, 'active') returning id into v_thread;

  -- ── CANDIDATE context (auth.uid() = the thread's candidate) ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_cand_auth)::text, true);

  begin update public.prospect_threads set status='muted', updated_at=now() where id=v_thread;
    insert into _t values('candidate_mute_allowed', true, null);
  exception when others then insert into _t values('candidate_mute_allowed', false, sqlerrm); end;

  begin update public.prospect_threads set candidate_revealed=true, last_message_at=now() where id=v_thread;
    insert into _t values('candidate_reveal_allowed', true, null);
  exception when others then insert into _t values('candidate_reveal_allowed', false, sqlerrm); end;

  begin update public.prospect_threads set application_id=gen_random_uuid() where id=v_thread;
    insert into _t values('candidate_application_id_blocked', false, 'UPDATE UNEXPECTEDLY SUCCEEDED');
  exception when others then insert into _t values('candidate_application_id_blocked', true, null); end;

  begin update public.prospect_threads set status='converted' where id=v_thread;
    insert into _t values('candidate_converted_blocked', false, 'UPDATE UNEXPECTEDLY SUCCEEDED');
  exception when others then insert into _t values('candidate_converted_blocked', true, null); end;

  begin update public.prospect_threads set dso_id=gen_random_uuid() where id=v_thread;
    insert into _t values('candidate_dso_id_blocked', false, 'UPDATE UNEXPECTEDLY SUCCEEDED');
  exception when others then insert into _t values('candidate_dso_id_blocked', true, null); end;

  -- ── DSO context (own thread → must NOT be constrained by the candidate lock) ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_dso_auth)::text, true);
  begin update public.prospect_threads set status='converted' where id=v_thread;
    insert into _t values('dso_convert_allowed', true, null);
  exception when others then insert into _t values('dso_convert_allowed', false, sqlerrm); end;

  -- ── SYSTEM / service-role context (auth.uid() null → must NOT be constrained) ──
  perform set_config('request.jwt.claims', '', true);
  begin update public.prospect_threads set status='muted' where id=v_thread;
    insert into _t values('system_update_allowed', true, null);
  exception when others then insert into _t values('system_update_allowed', false, sqlerrm); end;

  -- ── BLOCK-LIST relation present & queryable ──
  insert into public.candidate_blocked_employers(candidate_id, dso_id, reason_optional)
    values (v_cand_id, v_dso_id, 'integration_test') on conflict (candidate_id, dso_id) do nothing;
  if exists (select 1 from public.candidate_blocked_employers where dso_id=v_dso_id and candidate_id=v_cand_id)
    then insert into _t values('blocklist_relation_present', true, null);
    else insert into _t values('blocklist_relation_present', false, 'block row not found'); end if;

  -- ── report ──
  for r in select * from _t order by name loop
    raise notice '% %', (case when r.passed then 'PASS' else 'FAIL' end), r.name || coalesce(' — '||r.detail, '');
  end loop;

  -- ── cleanup synthetic rows (on failure the RAISE below rolls all of this back too) ──
  delete from public.candidate_blocked_employers
    where dso_id=v_dso_id and candidate_id=v_cand_id and reason_optional='integration_test';
  delete from public.prospect_threads where id=v_thread;

  select count(*) into v_fail from _t where not passed;
  if v_fail > 0 then
    raise exception 'sourcing_enforcement_test: % assertion(s) FAILED', v_fail;
  end if;
  raise notice 'sourcing_enforcement_test: ALL % assertions passed', (select count(*) from _t);
end $$;
