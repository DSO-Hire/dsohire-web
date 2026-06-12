"use server";

/**
 * Candidate-side ⌘K universal search — Lane 7 (Career HQ, Model 06).
 * Sibling of lib/employer/search-action.ts, same shape so both feed
 * the shared palette (components/shared/command-palette.tsx).
 *
 * Searches across:
 *   - Open jobs (title) — public postings, DSO names ALWAYS masked
 *     through getDisplayedDsoNamesBatch (never raw dsos.name).
 *   - The candidate's own applications (job title) — RLS-scoped.
 *   - Static action shortcuts (browse jobs, assessment, résumé…).
 *
 * Server-side so RLS naturally scopes the applications results. Same
 * ILIKE substring matching as the employer side.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDisplayedDsoNamesBatch } from "@/lib/dso/affiliation-display";

export interface CandidateSearchResult {
  group: "jobs" | "applications" | "actions";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

const STATIC_ACTIONS: CandidateSearchResult[] = [
  {
    group: "actions",
    id: "action-browse-jobs",
    title: "Browse jobs",
    subtitle: "Open roles at dental groups",
    href: "/candidate/jobs",
  },
  {
    group: "actions",
    id: "action-applications",
    title: "My applications",
    subtitle: "Every application, every stage",
    href: "/candidate/applications",
  },
  {
    group: "actions",
    id: "action-inbox",
    title: "Inbox",
    subtitle: "Messages from hiring teams",
    href: "/candidate/inbox",
  },
  {
    group: "actions",
    id: "action-assessment",
    title: "PracticeFit assessment",
    subtitle: "~5 minutes — sharpens every match",
    href: "/candidate/assessment",
  },
  {
    group: "actions",
    id: "action-dsofit-assessment",
    title: "DSOFit assessment",
    subtitle: "~5 minutes — for corporate roles",
    href: "/candidate/dsofit-assessment",
  },
  {
    group: "actions",
    id: "action-resume",
    title: "Résumé builder",
    subtitle: "Six ATS-safe templates, free",
    href: "/candidate/resume",
  },
  {
    group: "actions",
    id: "action-profile",
    title: "Edit profile",
    subtitle: "Work history, license, skills, photo",
    href: "/candidate/profile",
  },
  {
    group: "actions",
    id: "action-privacy",
    title: "Privacy & visibility",
    subtitle: "Anonymous mode + matching settings",
    href: "/candidate/settings/privacy",
  },
  {
    group: "actions",
    id: "action-help",
    title: "Help & Support",
    subtitle: "FAQ + email support",
    href: "/candidate/help",
  },
];

export async function candidateSearch(
  query: string
): Promise<{ ok: boolean; results: CandidateSearchResult[]; error?: string }> {
  const trimmed = query.trim();
  if (!trimmed) return { ok: true, results: [] };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, results: [], error: "Sign in required." };

  const { data: candidateRow } = await supabase
    .from("candidates")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidateRow) {
    return { ok: false, results: [], error: "No candidate profile." };
  }
  const candidateId = candidateRow.id as string;

  const pattern = `%${trimmed}%`;
  const lowered = trimmed.toLowerCase();

  // Open jobs (public read) + the candidate's own applications, in
  // parallel. Applications match on job title via a second shallow
  // jobs lookup (no embed-filter subtleties — same two-step pattern as
  // the candidate dashboard).
  const [jobsRes, appsRes] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, employment_type")
      .eq("status", "active")
      .is("deleted_at", null)
      .ilike("title", pattern)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(8),
    supabase
      .from("applications")
      .select("id, job_id, created_at")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const out: CandidateSearchResult[] = [];

  // ── Jobs — DSO names masked through the batch helper (anonymity). ──
  const jobRows = (jobsRes.data ?? []) as Array<{
    id: string;
    title: string;
    employment_type: string | null;
  }>;
  if (jobRows.length > 0) {
    const displayed = await getDisplayedDsoNamesBatch({
      jobIds: jobRows.map((j) => j.id),
      viewer: { role: "public" },
    });
    for (const j of jobRows) {
      out.push({
        group: "jobs",
        id: `job-${j.id}`,
        title: j.title,
        subtitle: displayed.get(j.id)?.name ?? undefined,
        href: `/jobs/${j.id}`,
      });
    }
  }

  // ── Own applications — resolve titles, filter in JS. ──
  const appRows = (appsRes.data ?? []) as Array<{
    id: string;
    job_id: string;
    created_at: string;
  }>;
  if (appRows.length > 0) {
    const { data: appJobs } = await supabase
      .from("jobs")
      .select("id, title")
      .in(
        "id",
        Array.from(new Set(appRows.map((a) => a.job_id)))
      );
    const titleByJobId = new Map(
      ((appJobs ?? []) as Array<{ id: string; title: string }>).map((j) => [
        j.id,
        j.title,
      ])
    );
    let rendered = 0;
    for (const a of appRows) {
      const title = titleByJobId.get(a.job_id);
      if (!title || !title.toLowerCase().includes(lowered)) continue;
      out.push({
        group: "applications",
        id: `app-${a.id}`,
        title,
        subtitle: `Applied ${new Date(a.created_at).toLocaleDateString(
          "en-US",
          { month: "short", day: "numeric" }
        )}`,
        href: `/candidate/applications/${a.id}`,
      });
      if (++rendered >= 8) break;
    }
  }

  // ── Static actions — substring match on title/subtitle. ──
  for (const action of STATIC_ACTIONS) {
    const haystack = `${action.title} ${action.subtitle ?? ""}`.toLowerCase();
    if (haystack.includes(lowered)) out.push(action);
  }

  return { ok: true, results: out };
}
