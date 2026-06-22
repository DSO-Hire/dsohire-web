/**
 * "View as DSO" mirror loader (Tranche 2 — employer side, Option B).
 *
 * Read-only mirror of a DSO's own view via service-role — a dedicated admin
 * page, not a session swap, not the live employer pages (those re-resolve the
 * signed-in session under RLS). FIREWALL: no EEO; deleted_at filtered (→ 404).
 * v1 is aggregate/own-data only (identity, jobs, team) — it does NOT render
 * individual applicant identities, sidestepping anonymity entirely; applicant
 * detail (with masking re-applied) is a follow-on.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export interface MirrorJob {
  id: string;
  title: string;
  status: string;
  applications: number;
  views: number;
}
export interface MirrorTeamMember {
  name: string;
  role: string;
}
export interface DsoMirror {
  id: string;
  name: string;
  status: string | null;
  tier: string | null;
  subscriptionStatus: string | null;
  jobs: MirrorJob[];
  team: MirrorTeamMember[];
}

export async function getDsoMirror(id: string): Promise<DsoMirror | null> {
  const admin = createSupabaseServiceRoleClient();

  const { data: dso, error } = await admin
    .from("dsos")
    .select("id, name, status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !dso) return null;

  const { data: sub } = await admin
    .from("subscriptions")
    .select("tier, status")
    .eq("dso_id", id)
    .maybeSingle();

  const { data: jobRows } = await admin
    .from("jobs")
    .select("id, title, status, applications_count, views")
    .eq("dso_id", id)
    .is("deleted_at", null)
    .order("applications_count", { ascending: false })
    .limit(50);

  const { data: teamRows } = await admin
    .from("dso_users")
    .select("full_name, role")
    .eq("dso_id", id);

  const jobs: MirrorJob[] = (jobRows ?? []).map((j) => ({
    id: String(j.id),
    title: String(j.title ?? "(untitled)"),
    status: String(j.status ?? "—"),
    applications: Number(j.applications_count ?? 0),
    views: Number(j.views ?? 0),
  }));

  const team: MirrorTeamMember[] = (teamRows ?? []).map((t) => ({
    name: String(t.full_name ?? "—"),
    role: String(t.role ?? "—"),
  }));

  return {
    id: String(dso.id),
    name: String(dso.name ?? "(unnamed)"),
    status: (dso.status as string | null) ?? null,
    tier: (sub?.tier as string | null) ?? null,
    subscriptionStatus: (sub?.status as string | null) ?? null,
    jobs,
    team,
  };
}
