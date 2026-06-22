/**
 * "View as candidate" mirror loader (Tranche 1, Phase 4.1, Option B).
 *
 * Re-renders a candidate's own key data for a founder, READ-ONLY, via
 * service-role — a dedicated admin mirror, NOT a session swap and NOT the real
 * candidate pages (those re-resolve the signed-in session under RLS, so a
 * layout override can't show target data). FIREWALL: EEO is never selected;
 * deleted_at filtered (soft-deleted → null → 404). Returns the candidate's own
 * view (a candidate sees their own profile unmasked); no employer-side anonymity
 * masking applies to self-view.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export interface MirrorApplication {
  id: string;
  jobTitle: string;
  dsoName: string;
  appliedAt: string | null;
  status: string;
}

export interface CandidateMirror {
  id: string;
  fullName: string | null;
  headline: string | null;
  currentTitle: string | null;
  location: string | null;
  isSearchable: boolean;
  anonymousMode: boolean;
  applications: MirrorApplication[];
}

// Candidate-facing-ish status from a pipeline stage kind (mirrors the audience
// intent of the candidate dashboards: progress, not internal stage names).
const STAGE_LABEL: Record<string, string> = {
  open: "Submitted",
  screen: "In review",
  interview: "Interviewing",
  offer: "Offer",
  hired: "Hired",
  rejected: "Not selected",
};

export async function getCandidateMirror(
  id: string,
): Promise<CandidateMirror | null> {
  const admin = createSupabaseServiceRoleClient();

  const { data: c, error } = await admin
    .from("candidates")
    .select(
      "id, full_name, headline, current_title, current_location_city, current_location_state, is_searchable, anonymous_mode",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !c) return null;

  // Applications (flat queries; resolve ids then map — no nested embeds).
  const { data: appRows } = await admin
    .from("applications")
    .select("id, job_id, stage_id, created_at, withdrawn_at")
    .eq("candidate_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  const apps = (appRows ?? []) as Array<{
    id: string;
    job_id: string;
    stage_id: string | null;
    created_at: string | null;
    withdrawn_at: string | null;
  }>;

  const jobIds = [...new Set(apps.map((a) => a.job_id).filter(Boolean))];
  const stageIds = [...new Set(apps.map((a) => a.stage_id).filter(Boolean))] as string[];

  const jobMap = new Map<string, { title: string; dso_id: string }>();
  const dsoMap = new Map<string, string>();
  const stageKind = new Map<string, string>();

  if (jobIds.length) {
    const { data: jobs } = await admin
      .from("jobs")
      .select("id, title, dso_id")
      .in("id", jobIds);
    for (const j of (jobs ?? []) as Array<Record<string, unknown>>) {
      jobMap.set(String(j.id), {
        title: String(j.title ?? "(untitled)"),
        dso_id: String(j.dso_id ?? ""),
      });
    }
    const dsoIds = [...new Set([...jobMap.values()].map((j) => j.dso_id).filter(Boolean))];
    if (dsoIds.length) {
      const { data: dsos } = await admin
        .from("dsos")
        .select("id, name")
        .in("id", dsoIds);
      for (const d of (dsos ?? []) as Array<Record<string, unknown>>) {
        dsoMap.set(String(d.id), String(d.name ?? "—"));
      }
    }
  }
  if (stageIds.length) {
    const { data: stages } = await admin
      .from("dso_pipeline_stages")
      .select("id, kind")
      .in("id", stageIds);
    for (const s of (stages ?? []) as Array<Record<string, unknown>>) {
      stageKind.set(String(s.id), String(s.kind ?? ""));
    }
  }

  const applications: MirrorApplication[] = apps.map((a) => {
    const job = a.job_id ? jobMap.get(a.job_id) : undefined;
    const kind = a.stage_id ? stageKind.get(a.stage_id) : undefined;
    return {
      id: a.id,
      jobTitle: job?.title ?? "(untitled)",
      dsoName: job ? dsoMap.get(job.dso_id) ?? "—" : "—",
      appliedAt: a.created_at,
      status: a.withdrawn_at
        ? "Withdrawn"
        : kind
          ? STAGE_LABEL[kind] ?? "Submitted"
          : "Submitted",
    };
  });

  const city = (c.current_location_city as string | null) ?? null;
  const state = (c.current_location_state as string | null) ?? null;

  return {
    id: String(c.id),
    fullName: (c.full_name as string | null) ?? null,
    headline: (c.headline as string | null) ?? null,
    currentTitle: (c.current_title as string | null) ?? null,
    location: city && state ? `${city}, ${state}` : city || state || null,
    isSearchable: Boolean(c.is_searchable),
    anonymousMode: Boolean(c.anonymous_mode),
    applications,
  };
}
