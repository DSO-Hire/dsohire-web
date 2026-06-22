/**
 * Account 360 loaders (Tranche 1, Phase 3) — operator view of a single entity.
 *
 * Service-role reads, flat queries. FIREWALL: never selects EEO; deleted_at IS
 * NULL filtered (a soft-deleted entity reads as not-found). Aggregate related
 * counts only — no candidate identity is pulled into a DSO/job view beyond what
 * an operator legitimately needs. Each returns null when missing/soft-deleted
 * so the page can notFound().
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export interface DsoAccount {
  id: string;
  name: string;
  slug: string | null;
  status: string | null;
  createdAt: string | null;
  verifiedAt: string | null;
  requireMfa: boolean;
  featuredUntil: string | null;
  subscription: {
    tier: string | null;
    status: string | null;
    currentPeriodEnd: string | null;
  } | null;
  jobsCount: number;
  usersCount: number;
  applicationsCount: number;
  health: string[];
}

export interface CandidateAccount {
  id: string;
  fullName: string | null;
  email: string | null;
  currentTitle: string | null;
  location: string | null;
  isSearchable: boolean;
  anonymousMode: boolean;
  createdAt: string | null;
  applicationsCount: number;
  health: string[];
}

export interface JobAccount {
  id: string;
  title: string | null;
  status: string | null;
  roleCategory: string | null;
  postedAt: string | null;
  views: number;
  applicationsCount: number;
  dsoId: string | null;
  dsoName: string | null;
  health: string[];
}

async function headCount(q: PromiseLike<unknown>): Promise<number> {
  try {
    const { count, error } = (await q) as { count: number | null; error: unknown };
    return error ? 0 : count ?? 0;
  } catch {
    return 0;
  }
}

export async function getDsoAccount(id: string): Promise<DsoAccount | null> {
  const admin = createSupabaseServiceRoleClient();
  const { data: dso, error } = await admin
    .from("dsos")
    .select("id, name, slug, status, created_at, verified_at, require_mfa, featured_until")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !dso) return null;

  const { data: sub } = await admin
    .from("subscriptions")
    .select("tier, status, current_period_end")
    .eq("dso_id", id)
    .maybeSingle();

  const [jobsCount, usersCount] = await Promise.all([
    headCount(
      admin
        .from("jobs")
        .select("*", { count: "exact", head: true })
        .eq("dso_id", id)
        .is("deleted_at", null),
    ),
    headCount(
      admin
        .from("dso_users")
        .select("*", { count: "exact", head: true })
        .eq("dso_id", id),
    ),
  ]);

  // Applications across the DSO's jobs — sum the denormalized job counter.
  let applicationsCount = 0;
  try {
    const { data: jobRows } = await admin
      .from("jobs")
      .select("applications_count")
      .eq("dso_id", id)
      .is("deleted_at", null);
    for (const j of (jobRows ?? []) as Array<{ applications_count: number | null }>) {
      applicationsCount += Number(j.applications_count ?? 0);
    }
  } catch {
    /* leave 0 */
  }

  const subStatus = (sub?.status as string | null) ?? null;
  const health: string[] = [];
  if (subStatus === "past_due" || subStatus === "incomplete") {
    health.push("Billing needs attention");
  }
  if (!sub) health.push("No subscription");
  if (!dso.require_mfa) health.push("MFA not required");
  if (dso.status === "suspended") health.push("Suspended");

  return {
    id: String(dso.id),
    name: String(dso.name ?? "(unnamed)"),
    slug: (dso.slug as string | null) ?? null,
    status: (dso.status as string | null) ?? null,
    createdAt: (dso.created_at as string | null) ?? null,
    verifiedAt: (dso.verified_at as string | null) ?? null,
    requireMfa: Boolean(dso.require_mfa),
    featuredUntil: (dso.featured_until as string | null) ?? null,
    subscription: sub
      ? {
          tier: (sub.tier as string | null) ?? null,
          status: subStatus,
          currentPeriodEnd: (sub.current_period_end as string | null) ?? null,
        }
      : null,
    jobsCount,
    usersCount,
    applicationsCount,
    health,
  };
}

export async function getCandidateAccount(
  id: string,
): Promise<CandidateAccount | null> {
  const admin = createSupabaseServiceRoleClient();
  const { data: c, error } = await admin
    .from("candidates")
    .select(
      "id, full_name, email, current_title, current_location_city, current_location_state, is_searchable, anonymous_mode, created_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !c) return null;

  const applicationsCount = await headCount(
    admin
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("candidate_id", id),
  );

  const city = (c.current_location_city as string | null) ?? null;
  const state = (c.current_location_state as string | null) ?? null;
  const location = city && state ? `${city}, ${state}` : city || state || null;

  const health: string[] = [];
  if (!c.is_searchable) health.push("Not searchable");
  if (c.anonymous_mode) health.push("Anonymous mode on");

  return {
    id: String(c.id),
    fullName: (c.full_name as string | null) ?? null,
    email: (c.email as string | null) ?? null,
    currentTitle: (c.current_title as string | null) ?? null,
    location,
    isSearchable: Boolean(c.is_searchable),
    anonymousMode: Boolean(c.anonymous_mode),
    createdAt: (c.created_at as string | null) ?? null,
    applicationsCount,
    health,
  };
}

export async function getJobAccount(id: string): Promise<JobAccount | null> {
  const admin = createSupabaseServiceRoleClient();
  const { data: j, error } = await admin
    .from("jobs")
    .select("id, title, status, role_category, dso_id, posted_at, views, applications_count")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !j) return null;

  let dsoName: string | null = null;
  if (j.dso_id) {
    const { data: dso } = await admin
      .from("dsos")
      .select("name")
      .eq("id", j.dso_id)
      .maybeSingle();
    dsoName = (dso?.name as string | null) ?? null;
  }

  const health: string[] = [];
  if (Number(j.applications_count ?? 0) === 0 && j.status === "active") {
    health.push("0 applications");
  }

  return {
    id: String(j.id),
    title: (j.title as string | null) ?? null,
    status: (j.status as string | null) ?? null,
    roleCategory: (j.role_category as string | null) ?? null,
    postedAt: (j.posted_at as string | null) ?? null,
    views: Number(j.views ?? 0),
    applicationsCount: Number(j.applications_count ?? 0),
    dsoId: (j.dso_id as string | null) ?? null,
    dsoName,
    health,
  };
}
