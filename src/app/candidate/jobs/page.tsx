/**
 * /candidate/jobs — PracticeFit-ranked, in-shell jobs browser (rework 2026-06-04).
 *
 * Replaces the old "20 most-recent + eject to the public board" teaser. We pull
 * a broad pool of open roles, score each against the candidate's PracticeFit
 * (cached), and hand serializable rows to <JobsBrowser>, which ranks + filters
 * them entirely client-side — so the candidate never leaves their authed shell
 * to "see the full board." (The kick-out Cam flagged.)
 *
 * Privacy: DSO names are masked through getDisplayedDsoNamesBatch (viewer
 * "public") — never the raw corporate name.
 *
 * Scale note: we score up to POOL_CAP jobs per load (cached read-through, so
 * repeat visits are cheap). A batched candidate-loaded-once scorer is the next
 * optimization when the open-role count grows past this.
 */

import type { Metadata } from "next";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPracticeFit } from "@/lib/practice-fit/get-or-compute";
import { getDisplayedDsoNamesBatch } from "@/lib/dso/affiliation-display";
import { JobsBrowser, type BrowseJob } from "./jobs-browser";

export const metadata: Metadata = { title: "Jobs · DSO Hire" };
export const dynamic = "force-dynamic";

const POOL_CAP = 60;

const ROLE_LABELS: Record<string, string> = {
  dentist: "Dentist",
  dental_hygienist: "Hygienist",
  dental_assistant: "Dental Assistant",
  front_office: "Front Office",
  office_manager: "Office Manager",
  regional_manager: "Regional Manager",
  specialist: "Specialist",
  other: "Other",
};

const EMP_LABELS: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  contract: "Contract",
  prn: "PRN",
  locum: "Locum",
};

interface RawJob {
  id: string;
  title: string;
  role_category: string;
  employment_type: string;
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_period: string | null;
  compensation_visible: boolean;
  posted_at: string | null;
  dso_id: string;
}

export default async function CandidateJobsPage() {
  const supabase = await createSupabaseServerClient();

  const { data: rawJobs } = await supabase
    .from("jobs")
    .select(
      "id, title, role_category, employment_type, compensation_min, compensation_max, compensation_period, compensation_visible, posted_at, dso_id"
    )
    .eq("status", "active")
    .is("deleted_at", null)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(POOL_CAP);

  const jobs = (rawJobs ?? []) as RawJob[];
  const jobIds = jobs.map((j) => j.id);

  // Locations per job (for the location label + state filter).
  const locationsByJob = new Map<
    string,
    Array<{ city: string | null; state: string | null }>
  >();
  if (jobIds.length > 0) {
    const { data: jobLocs } = await supabase
      .from("job_locations")
      .select("job_id, location:dso_locations(city, state)")
      .in("job_id", jobIds);
    for (const row of (jobLocs ?? []) as unknown as Array<{
      job_id: string;
      location: { city: string | null; state: string | null } | null;
    }>) {
      if (!row.location) continue;
      const list = locationsByJob.get(row.job_id) ?? [];
      list.push(row.location);
      locationsByJob.set(row.job_id, list);
    }
  }

  // Masked DSO display names (public viewer — anonymity guarantee).
  const displayedNameByJob =
    jobIds.length > 0
      ? await getDisplayedDsoNamesBatch({ jobIds, viewer: { role: "public" } })
      : new Map();

  // Candidate context: consent, applied set, per-job fit.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let consentOn = false;
  const appliedJobIds = new Set<string>();
  const fitByJobId = new Map<string, { score: number; bucket: BrowseJob["fitBucket"] }>();

  if (user && jobs.length > 0) {
    const { data: candidate } = await supabase
      .from("candidates")
      .select("id, practice_fit_consent")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (candidate) {
      const candidateId = (candidate as Record<string, unknown>).id as string;
      consentOn =
        (((candidate as Record<string, unknown>).practice_fit_consent as
          | string
          | null) ?? "off") !== "off";

      const { data: appliedRows } = await supabase
        .from("applications")
        .select("job_id")
        .eq("candidate_id", candidateId)
        .in("job_id", jobIds);
      for (const r of (appliedRows ?? []) as Array<{ job_id: string }>) {
        appliedJobIds.add(r.job_id);
      }

      if (consentOn) {
        const fits = await Promise.all(
          jobs.map((j) => getPracticeFit(candidateId, j.id))
        );
        jobs.forEach((j, i) => {
          const f = fits[i];
          if (f) fitByJobId.set(j.id, { score: f.score, bucket: f.bucket });
        });
      }
    }
  }

  const browseJobs: BrowseJob[] = jobs.map((j) => {
    const locs = locationsByJob.get(j.id) ?? [];
    const states = Array.from(
      new Set(locs.map((l) => l.state).filter((s): s is string => Boolean(s)))
    );
    const fit = fitByJobId.get(j.id) ?? null;
    return {
      id: j.id,
      title: j.title,
      roleCategory: j.role_category,
      roleLabel: ROLE_LABELS[j.role_category] ?? j.role_category,
      employmentLabel: EMP_LABELS[j.employment_type] ?? j.employment_type,
      dsoName: displayedNameByJob.get(j.id)?.name ?? null,
      locationLabel: formatLocations(locs),
      states,
      compLabel:
        j.compensation_visible && j.compensation_min !== null
          ? formatCompensation(j)
          : null,
      compPeriodLabel: j.compensation_period
        ? compensationPeriodLabel(j.compensation_period)
        : null,
      fitScore: fit?.score ?? null,
      fitBucket: fit?.bucket ?? null,
      applied: appliedJobIds.has(j.id),
    };
  });

  return (
    <CandidateShell active="jobs">
      <div className="max-w-[920px]">
        <JobsBrowser jobs={browseJobs} consentOn={consentOn} />
      </div>
    </CandidateShell>
  );
}

function formatLocations(
  locs: Array<{ city: string | null; state: string | null }>
): string | null {
  if (locs.length === 0) return null;
  if (locs.length === 1) {
    return [locs[0].city, locs[0].state].filter(Boolean).join(", ") || null;
  }
  const states = Array.from(new Set(locs.map((l) => l.state).filter(Boolean)));
  if (states.length === 1) return `${locs.length} locations · ${states[0]}`;
  return `${locs.length} locations`;
}

function formatCompensation(job: RawJob): string {
  if (job.compensation_min === null) return "";
  const fmt = new Intl.NumberFormat("en-US");
  if (job.compensation_max === null) return `$${fmt.format(job.compensation_min)}`;
  if (job.compensation_period === "annual") {
    const minK = Math.round(job.compensation_min / 1000);
    const maxK = Math.round(job.compensation_max / 1000);
    return `$${minK}K–$${maxK}K`;
  }
  return `$${fmt.format(job.compensation_min)}–$${fmt.format(job.compensation_max)}`;
}

function compensationPeriodLabel(p: string): string {
  return { hourly: "Per hour", daily: "Per day", annual: "Annual" }[p] ?? p;
}
