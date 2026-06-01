-- Close the self-update privilege gap (2026-06-01).
--
-- The "DSO users: update self" RLS policy is column-agnostic: its WITH
-- CHECK only sees the NEW row, so it can't stop a teammate from PATCHing
-- their OWN role to 'owner' or moving themselves to another dso_id via the
-- raw REST API. RLS can't express "role must equal the prior role" (no OLD
-- access), and a column-level GRANT would also block the legitimate
-- admin role-change flow (same `authenticated` role). A BEFORE UPDATE
-- trigger is the right tool — it sees OLD vs NEW and the acting user.
--
-- Rule: a logged-in user editing THEIR OWN row may not (a) move to another
-- DSO, or (b) raise their own permission level. Demotion stays allowed so
-- an admin can step down. Admins editing OTHER teammates (auth.uid() <>
-- the row's auth_user_id) and service-role writes (auth.uid() IS NULL —
-- invites, webhooks) are unaffected.
--
-- Verified 2026-06-01: simulating a logged-in admin, self admin->owner is
-- blocked, self admin->recruiter (demotion) is allowed, and a title-only
-- self edit is allowed.

create or replace function public.prevent_dso_user_self_privilege_change()
returns trigger
language plpgsql
as $$
declare
  uid uuid := auth.uid();
  old_rank int;
  new_rank int;
begin
  -- Only constrain a logged-in user editing their own row.
  if uid is null or old.auth_user_id is distinct from uid then
    return new;
  end if;

  if new.dso_id is distinct from old.dso_id then
    raise exception 'You cannot change your own DSO membership.'
      using errcode = '42501';
  end if;

  old_rank := case old.role
    when 'owner' then 3 when 'admin' then 2 else 1 end;
  new_rank := case new.role
    when 'owner' then 3 when 'admin' then 2 else 1 end;

  if new_rank > old_rank then
    raise exception 'You cannot raise your own role. Ask an owner or admin.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_dso_user_self_privilege_change on public.dso_users;
create trigger trg_prevent_dso_user_self_privilege_change
  before update on public.dso_users
  for each row
  execute function public.prevent_dso_user_self_privilege_change();
