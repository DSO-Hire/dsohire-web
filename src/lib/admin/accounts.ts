/**
 * Master account roster for /admin/accounts (operator surface).
 *
 * Every auth account on the platform, newest first, tagged by what it is:
 * candidate, employer (DSO member), admin, or a bare auth account with no
 * profile row yet (abandoned mid-signup — useful signal on launch week).
 *
 * Same firewall as admin search: service-role reads, EEO is never selected,
 * soft-deleted rows excluded. Operator access, not impersonation.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type AccountKind = "candidate" | "employer" | "admin" | "no_profile";

export interface AccountRow {
  kind: AccountKind;
  /** Profile id (candidates.id / dso_users.id) or auth user id for bare accounts. */
  id: string;
  authUserId: string;
  name: string;
  email: string;
  /** Candidate title, DSO name + role, or admin role. */
  detail: string;
  createdAt: string;
  lastSignInAt: string | null;
  /** Account-360 link when one exists. */
  href: string | null;
}

export interface AccountRoster {
  rows: AccountRow[];
  counts: { candidates: number; employers: number; admins: number; noProfile: number };
}

interface AuthUserLite {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

/** Page through GoTrue admin users (plenty for current scale; capped defensively). */
async function listAllAuthUsers(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>
): Promise<AuthUserLite[]> {
  const out: AuthUserLite[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    const users = data?.users ?? [];
    for (const u of users) {
      out.push({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at,
        last_sign_in_at: (u.last_sign_in_at as string | null) ?? null,
      });
    }
    if (users.length < 1000) break;
  }
  return out;
}

export async function loadAccountRoster(): Promise<AccountRoster> {
  const admin = createSupabaseServiceRoleClient();

  const [authUsers, cands, dsoUsers, admins] = await Promise.all([
    listAllAuthUsers(admin),
    admin
      .from("candidates")
      .select("id, auth_user_id, full_name, email, current_title, created_at")
      .is("deleted_at", null),
    admin
      .from("dso_users")
      .select("id, auth_user_id, first_name, last_name, role, created_at, dsos(name)"),
    admin.from("admin_users").select("auth_user_id, role, full_name"),
  ]);

  const authById = new Map(authUsers.map((u) => [u.id, u]));
  const claimed = new Set<string>();
  const rows: AccountRow[] = [];

  const adminByAuthId = new Map(
    ((admins.data ?? []) as Array<Record<string, unknown>>).map((a) => [
      String(a.auth_user_id),
      a,
    ])
  );

  for (const c of (cands.data ?? []) as Array<Record<string, unknown>>) {
    const authId = String(c.auth_user_id ?? "");
    const au = authById.get(authId);
    claimed.add(authId);
    rows.push({
      kind: "candidate",
      id: String(c.id),
      authUserId: authId,
      name: String(c.full_name ?? "(no name)"),
      email: String(c.email ?? au?.email ?? ""),
      detail: String(c.current_title ?? "Candidate"),
      createdAt: String(c.created_at),
      lastSignInAt: au?.last_sign_in_at ?? null,
      href: `/admin/candidate/${String(c.id)}`,
    });
  }

  for (const du of (dsoUsers.data ?? []) as Array<Record<string, unknown>>) {
    const authId = String(du.auth_user_id ?? "");
    const au = authById.get(authId);
    claimed.add(authId);
    // PostgREST returns the relation as an object (many-to-one) but can hand
    // back an array depending on FK inference — accept both.
    const dsoRel = Array.isArray(du.dsos) ? du.dsos[0] : du.dsos;
    const dsoName = String(
      (dsoRel as Record<string, unknown> | null)?.name ?? "(no DSO)"
    );
    const name =
      [du.first_name, du.last_name].filter(Boolean).join(" ") ||
      au?.email ||
      "(no name)";
    rows.push({
      kind: "employer",
      id: String(du.id),
      authUserId: authId,
      name: String(name),
      email: String(au?.email ?? ""),
      detail: `${dsoName} · ${String(du.role ?? "member")}`,
      createdAt: String(du.created_at),
      lastSignInAt: au?.last_sign_in_at ?? null,
      href: null,
    });
  }

  // Remaining auth users: admins, or bare accounts that never finished a profile.
  for (const au of authUsers) {
    if (claimed.has(au.id)) continue;
    const adminRow = adminByAuthId.get(au.id);
    if (adminRow) {
      rows.push({
        kind: "admin",
        id: au.id,
        authUserId: au.id,
        name: String(adminRow.full_name ?? au.email ?? "(admin)"),
        email: au.email ?? "",
        detail: `Platform admin · ${String(adminRow.role ?? "admin")}`,
        createdAt: au.created_at,
        lastSignInAt: au.last_sign_in_at,
        href: null,
      });
    } else {
      rows.push({
        kind: "no_profile",
        id: au.id,
        authUserId: au.id,
        name: au.email ?? "(no email)",
        email: au.email ?? "",
        detail: "Signed up, no profile yet",
        createdAt: au.created_at,
        lastSignInAt: au.last_sign_in_at,
        href: null,
      });
    }
  }

  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return {
    rows,
    counts: {
      candidates: rows.filter((r) => r.kind === "candidate").length,
      employers: rows.filter((r) => r.kind === "employer").length,
      admins: rows.filter((r) => r.kind === "admin").length,
      noProfile: rows.filter((r) => r.kind === "no_profile").length,
    },
  };
}
