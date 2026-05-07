"use server";

/**
 * Cmd-K universal search (Phase 4.6.e).
 *
 * Searches across:
 *   - Jobs (title, role_category)
 *   - Candidates who've applied to THIS DSO (full_name, email, headline)
 *   - DSO locations (name, city, state)
 *   - Static action shortcuts ("Post a job", "Invite teammate", settings…)
 *
 * Server-side so RLS naturally scopes results to the user's DSO. ILIKE
 * with leading + trailing wildcards covers fuzzy substring matching;
 * heavy NLP is overkill for the size of any single DSO's data.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SearchResult {
  group: "jobs" | "candidates" | "locations" | "actions";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

const STATIC_ACTIONS: SearchResult[] = [
  {
    group: "actions",
    id: "action-post-job",
    title: "Post a job",
    subtitle: "Open the job-posting wizard",
    href: "/employer/jobs/new",
  },
  {
    group: "actions",
    id: "action-invite-teammate",
    title: "Invite teammate",
    subtitle: "Add someone to your DSO",
    href: "/employer/team",
  },
  {
    group: "actions",
    id: "action-public-profile",
    title: "Edit public profile",
    subtitle: "Mission, banner, photos, culture chips",
    href: "/employer/settings/profile",
  },
  {
    group: "actions",
    id: "action-email-templates",
    title: "Email templates",
    subtitle: "Customize candidate-facing emails",
    href: "/employer/settings/templates",
  },
  {
    group: "actions",
    id: "action-notifications",
    title: "Notifications",
    subtitle: "Per-event email + in-app preferences",
    href: "/employer/settings/notifications",
  },
  {
    group: "actions",
    id: "action-2fa",
    title: "Two-factor authentication",
    subtitle: "Set up or manage 2FA",
    href: "/employer/settings/account",
  },
  {
    group: "actions",
    id: "action-billing",
    title: "Billing",
    subtitle: "Subscription + invoices",
    href: "/employer/billing",
  },
  {
    group: "actions",
    id: "action-help",
    title: "Help & Support",
    subtitle: "FAQ + email support",
    href: "/employer/help",
  },
];

export async function employerSearch(
  query: string
): Promise<{ ok: boolean; results: SearchResult[]; error?: string }> {
  const trimmed = query.trim();
  if (!trimmed) return { ok: true, results: [] };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, results: [], error: "Sign in required." };

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return { ok: false, results: [], error: "No DSO membership." };

  const dsoId = dsoUser.dso_id as string;
  const pattern = `%${trimmed}%`;

  // Run all three DB queries in parallel — was the latency culprit when
  // they ran sequentially. The candidates query uses a Supabase inner-join
  // (`applications!inner`) so we don't need a separate round trip to pull
  // candidate_ids first; RLS on `applications` already scopes the join to
  // this DSO's applicants.
  const [jobsRes, candidatesRes, locationsRes] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, role_category, status")
      .eq("dso_id", dsoId)
      .is("deleted_at", null)
      .ilike("title", pattern)
      .limit(8),
    supabase
      .from("candidates")
      .select("id, full_name, headline, email, applications!inner(id)")
      .or(
        `full_name.ilike.${pattern},headline.ilike.${pattern},email.ilike.${pattern}`
      )
      .limit(8),
    supabase
      .from("dso_locations")
      .select("id, name, city, state")
      .eq("dso_id", dsoId)
      .or(`name.ilike.${pattern},city.ilike.${pattern},state.ilike.${pattern}`)
      .limit(8),
  ]);

  const out: SearchResult[] = [];

  for (const j of (jobsRes.data ?? []) as Array<{
    id: string;
    title: string;
    role_category: string;
    status: string;
  }>) {
    out.push({
      group: "jobs",
      id: `job-${j.id}`,
      title: j.title,
      subtitle: `${labelizeRole(j.role_category)} · ${j.status}`,
      href: `/employer/jobs/${j.id}`,
    });
  }

  // Dedupe candidates by id — the inner-join can return duplicates when
  // a candidate has multiple applications.
  const seenCandidates = new Set<string>();
  for (const c of (candidatesRes.data ?? []) as Array<{
    id: string;
    full_name: string | null;
    headline: string | null;
    email: string | null;
  }>) {
    if (seenCandidates.has(c.id)) continue;
    seenCandidates.add(c.id);
    out.push({
      group: "candidates",
      id: `candidate-${c.id}`,
      title: c.full_name ?? c.email ?? "Candidate",
      subtitle: c.headline ?? c.email ?? undefined,
      href: `/employer/applications?q=${encodeURIComponent(
        c.full_name ?? c.email ?? ""
      )}`,
    });
  }

  for (const l of (locationsRes.data ?? []) as Array<{
    id: string;
    name: string;
    city: string | null;
    state: string | null;
  }>) {
    out.push({
      group: "locations",
      id: `location-${l.id}`,
      title: l.name,
      subtitle: [l.city, l.state].filter(Boolean).join(", ") || undefined,
      href: `/employer/locations/${l.id}`,
    });
  }

  // Static action shortcuts (substring match on title + subtitle).
  const lq = trimmed.toLowerCase();
  for (const action of STATIC_ACTIONS) {
    if (
      action.title.toLowerCase().includes(lq) ||
      action.subtitle?.toLowerCase().includes(lq)
    ) {
      out.push(action);
    }
  }

  return { ok: true, results: out };
}

function labelizeRole(role: string): string {
  return role
    .split("_")
    .map((s) => s[0]?.toUpperCase() + s.slice(1))
    .join(" ");
}
