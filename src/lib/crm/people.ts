/**
 * /crm/people roster (2026-10-28): everyone who has raised a hand on
 * dsohire.com, one row per person. Sources, all read with the service role
 * behind the CRM gate (superadmin + aal2), same firewall as /admin/accounts:
 *
 *   auth users            sign-up date, last sign-in
 *   candidates            name, title, state (EEO never selected)
 *   dso_users + dsos      employer seats and their group
 *   marketing_leads       kind = 'job_alert' (the empty-board "tell me when
 *                         roles open" list, no account needed)
 *   candidate_saved_searches  saved-search alerts from signed-in candidates
 *
 * Rows merge by lowercased email, so a candidate who also joined the guest
 * alert list shows once with an alerts badge. Excluded: platform admins,
 * soft-deleted candidates, demo seed rows (seed_batch / dsos.is_demo), and
 * leads marked spam.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { listAllAuthUsers } from "@/lib/admin/accounts";

export type PersonKind = "candidate" | "employer" | "no_profile" | "alert_only";

export interface PersonAlert {
  label: string;
  active: boolean;
  createdAt: string;
}

export interface PersonRow {
  key: string;
  kind: PersonKind;
  name: string | null;
  email: string;
  /** Candidate title + state, employer group + role, or "Guest". */
  detail: string;
  createdAt: string;
  lastSignInAt: string | null;
  alerts: PersonAlert[];
  /** CRM account for an employer whose DSO is linked to one. */
  crmAccountId: string | null;
  isGuest: boolean;
}

type Rec = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function relOne(v: unknown): Rec | null {
  if (Array.isArray(v)) return (v[0] as Rec | undefined) ?? null;
  return (v as Rec | null) ?? null;
}

/** "/jobs?surface=corporate&role=hygienist" -> "Corporate roles · hygienist". */
export function alertLabelFromPath(path: string | null): string {
  if (!path) return "All roles";
  const q = path.includes("?") ? new URLSearchParams(path.slice(path.indexOf("?") + 1)) : null;
  if (!q) return "All roles";
  const parts: string[] = [];
  const surface = q.get("surface");
  if (surface === "corporate") parts.push("Corporate roles");
  else if (surface) parts.push(`${surface[0].toUpperCase()}${surface.slice(1)} roles`);
  for (const k of ["role", "q", "state", "city", "location"]) {
    const v = q.get(k);
    if (v) parts.push(v.replace(/[+_-]/g, " "));
  }
  return parts.length ? parts.join(" · ") : "All roles";
}

const FREQ: Record<string, string> = { instant: "instant", daily: "daily", weekly: "weekly", off: "paused" };

export async function loadPeople(): Promise<PersonRow[]> {
  const admin = createSupabaseServiceRoleClient();

  const [authUsers, cands, dsoUsers, admins, leads, searches, crmAccts] = await Promise.all([
    listAllAuthUsers(admin),
    admin
      .from("candidates")
      .select("id, auth_user_id, full_name, email, current_title, current_location_state, is_guest, created_at")
      .is("deleted_at", null)
      .is("seed_batch", null)
      .limit(5000),
    admin
      .from("dso_users")
      .select("id, auth_user_id, dso_id, first_name, last_name, role, title, created_at, dsos(name, is_demo, seed_batch)")
      .limit(5000),
    admin.from("admin_users").select("auth_user_id"),
    admin
      .from("marketing_leads")
      .select("id, contact, contact_type, name, source_path, status, unsubscribed_at, created_at")
      .eq("kind", "job_alert")
      .neq("status", "spam")
      .limit(5000),
    admin.from("candidate_saved_searches").select("candidate_id, name, frequency, created_at").limit(5000),
    admin.from("crm_accounts").select("id, dso_id").not("dso_id", "is", null).is("archived_at", null).limit(2000),
  ]);

  const authById = new Map(authUsers.map((u) => [u.id, u]));
  const adminIds = new Set(((admins.data ?? []) as Rec[]).map((a) => String(a.auth_user_id)));
  const acctByDso = new Map(((crmAccts.data ?? []) as Rec[]).map((a) => [String(a.dso_id), String(a.id)]));
  const claimed = new Set<string>();
  const byEmail = new Map<string, PersonRow>();
  const rows: PersonRow[] = [];

  const add = (row: PersonRow) => {
    rows.push(row);
    if (row.email) byEmail.set(row.email.toLowerCase(), row);
  };

  const searchesByCand = new Map<string, PersonAlert[]>();
  for (const s of (searches.data ?? []) as Rec[]) {
    const list = searchesByCand.get(String(s.candidate_id)) ?? [];
    const freq = String(s.frequency ?? "instant");
    list.push({
      label: `${str(s.name) ?? "Saved search"} (${FREQ[freq] ?? freq})`,
      active: freq !== "off",
      createdAt: String(s.created_at),
    });
    searchesByCand.set(String(s.candidate_id), list);
  }

  for (const c of (cands.data ?? []) as Rec[]) {
    const authId = String(c.auth_user_id ?? "");
    if (authId) claimed.add(authId);
    if (adminIds.has(authId)) continue;
    const au = authById.get(authId);
    const detail = [str(c.current_title), str(c.current_location_state)].filter(Boolean).join(" · ");
    add({
      key: `c-${String(c.id)}`,
      kind: "candidate",
      name: str(c.full_name),
      email: str(c.email) ?? au?.email ?? "",
      detail: detail || "Candidate",
      createdAt: String(c.created_at),
      lastSignInAt: au?.last_sign_in_at ?? null,
      alerts: searchesByCand.get(String(c.id)) ?? [],
      crmAccountId: null,
      isGuest: c.is_guest === true,
    });
  }

  for (const du of (dsoUsers.data ?? []) as Rec[]) {
    const authId = String(du.auth_user_id ?? "");
    if (authId) claimed.add(authId);
    const dso = relOne(du.dsos);
    if (dso?.is_demo === true || dso?.seed_batch) continue;
    if (adminIds.has(authId)) continue;
    const au = authById.get(authId);
    const name = [str(du.first_name), str(du.last_name)].filter(Boolean).join(" ") || null;
    const role = str(du.title) ?? str(du.role) ?? "member";
    add({
      key: `e-${String(du.id)}`,
      kind: "employer",
      name,
      email: au?.email ?? "",
      detail: `${str(dso?.name) ?? "No group"} · ${role}`,
      createdAt: String(du.created_at),
      lastSignInAt: au?.last_sign_in_at ?? null,
      alerts: [],
      crmAccountId: du.dso_id ? (acctByDso.get(String(du.dso_id)) ?? null) : null,
      isGuest: false,
    });
  }

  for (const au of authUsers) {
    if (claimed.has(au.id) || adminIds.has(au.id)) continue;
    add({
      key: `a-${au.id}`,
      kind: "no_profile",
      name: null,
      email: au.email ?? "",
      detail: "Signed up, no profile yet",
      createdAt: au.created_at,
      lastSignInAt: au.last_sign_in_at,
      alerts: [],
      crmAccountId: null,
      isGuest: false,
    });
  }

  for (const l of (leads.data ?? []) as Rec[]) {
    const contact = String(l.contact ?? "");
    const alert: PersonAlert = {
      label: alertLabelFromPath(str(l.source_path)),
      active: !l.unsubscribed_at,
      createdAt: String(l.created_at),
    };
    const existing = byEmail.get(contact.toLowerCase());
    if (existing) {
      existing.alerts.push(alert);
      continue;
    }
    add({
      key: `l-${String(l.id)}`,
      kind: "alert_only",
      name: str(l.name),
      email: contact,
      detail: l.contact_type === "phone" ? "Job alerts by text" : "Job alerts, no account",
      createdAt: String(l.created_at),
      lastSignInAt: null,
      alerts: [alert],
      crmAccountId: null,
      isGuest: false,
    });
  }

  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return rows;
}
