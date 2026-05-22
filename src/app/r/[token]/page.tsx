/**
 * /r/[token] — public reference-form route (Phase 5A Track D).
 *
 * No auth. Service-role lookup of the reference_requests row by its
 * opaque token. Renders one of:
 *   • The structured 7-field reference form (status = 'pending'|'sent')
 *   • A "thanks, already received" view (status = 'completed')
 *   • A "request withdrawn" view (status = 'declined')
 *
 * Unknown token → notFound() (Next renders the 404 page).
 *
 * Brand: navy headings, ivory background, white card body. No
 * EmployerShell / CandidateShell — this is a focused single-task
 * surface for a non-user.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getDisplayedDsoName } from "@/lib/dso/affiliation-display";
import { ReferenceForm } from "./reference-form";

interface PageProps {
  params: Promise<{ token: string }>;
}

export const metadata: Metadata = {
  title: "Provide a reference · DSO Hire",
  robots: { index: false, follow: false },
};

export default async function PublicReferencePage({ params }: PageProps) {
  const { token } = await params;

  if (!token || token.length > 128) {
    notFound();
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: row, error } = await admin
    .from("reference_requests")
    .select(
      "id, application_id, candidate_id, reference_name, status, response_data, completed_at"
    )
    .eq("token", token)
    .maybeSingle();
  if (error) {
    console.warn("[references-public] page lookup failed", error);
    notFound();
  }
  if (!row) {
    notFound();
  }

  const r = row as Record<string, unknown>;
  const applicationId = r.application_id as string | null;
  const candidateId = r.candidate_id as string | null;
  const referenceName = (r.reference_name as string | null) ?? null;
  const status = (r.status as string) ?? "pending";

  // Pull the candidate + DSO + requesting-user names for the heading
  // copy. Service-role bypasses RLS — the privacy posture here is "the
  // person holding this token already knows who they're vouching for",
  // and the candidate's full name was already in the email subject.
  let candidateName: string | null = null;
  let dsoName: string | null = null;
  let jobTitle: string | null = null;
  let requestingUserName: string | null = null;

  if (candidateId) {
    const { data: candRow } = await admin
      .from("candidates")
      .select("full_name")
      .eq("id", candidateId)
      .maybeSingle();
    candidateName =
      ((candRow as Record<string, unknown> | null)?.full_name as
        | string
        | null
        | undefined) ?? null;
  }

  if (applicationId) {
    // Resolve application → job → dso in separate single-table hops.
    // A deeply-embedded relation select (jobs:jobs(... dsos:dsos(...)))
    // degrades to GenericStringError in the Supabase TS types and
    // breaks the Vercel build — same reason /o/[token] avoids it.
    const { data: appRow } = await admin
      .from("applications")
      .select("id, job_id")
      .eq("id", applicationId)
      .maybeSingle();
    const jobId =
      ((appRow as Record<string, unknown> | null)?.job_id as
        | string
        | null
        | undefined) ?? null;
    if (jobId) {
      const { data: jobRow } = await admin
        .from("jobs")
        .select("id, title, dso_id")
        .eq("id", jobId)
        .maybeSingle();
      if (jobRow) {
        jobTitle = (jobRow.title as string | null) ?? null;
        // Use the affiliation-aware displayed name so the reference
        // sees the practice name (e.g. "Lakeshore Dental Group"), not
        // the corporate parent. The reference has no direct
        // relationship with the DSO — they only know the candidate —
        // and shouldn't learn the corporate parent any more than the
        // candidate themselves would. Same posture as the propose-
        // interview + booking-confirmation emails.
        try {
          const displayed = await getDisplayedDsoName({
            jobId,
            viewer: { role: "candidate", applicationId },
          });
          dsoName = displayed.name ?? null;
        } catch {
          dsoName = null;
        }
        // Fallback to raw corporate name only if the displayed
        // resolver fails entirely. Keeps the prior behavior on
        // exception paths.
        if (!dsoName) {
          const dsoId = (jobRow.dso_id as string | null) ?? null;
          if (dsoId) {
            const { data: dsoRow } = await admin
              .from("dsos")
              .select("id, name")
              .eq("id", dsoId)
              .maybeSingle();
            dsoName =
              ((dsoRow as Record<string, unknown> | null)?.name as
                | string
                | null
                | undefined) ?? null;
          }
        }
      }
    }

    // Look up the requesting user's display name via the dso_users row
    // attached to the reference request's requested_by_user_id. We do
    // this through a second hop because the requesting user is stored
    // as an auth.users id; pair it with the DSO id we just resolved
    // to find their dso_users row.
    const { data: reqRow } = await admin
      .from("reference_requests")
      .select("requested_by_user_id")
      .eq("id", r.id as string)
      .maybeSingle();
    const requesterAuthId =
      ((reqRow as Record<string, unknown> | null)?.requested_by_user_id as
        | string
        | null) ?? null;
    if (requesterAuthId) {
      const { data: requesterDsoUserRow } = await admin
        .from("dso_users")
        .select("full_name")
        .eq("auth_user_id", requesterAuthId)
        .maybeSingle();
      requestingUserName =
        ((requesterDsoUserRow as Record<string, unknown> | null)?.full_name as
          | string
          | null
          | undefined) ?? null;
    }
  }

  return (
    <main className="min-h-screen bg-ivory py-12 px-4 sm:px-6">
      <div className="mx-auto max-w-[640px]">
        <PublicHeader />
        <div className="bg-card border border-[var(--rule)] shadow-sm p-6 sm:p-10">
          {status === "completed" ? (
            <AlreadyCompletedView
              referenceName={referenceName}
              candidateName={candidateName}
              dsoName={dsoName}
              completedAt={(r.completed_at as string | null) ?? null}
            />
          ) : status === "declined" ? (
            <WithdrawnView dsoName={dsoName} />
          ) : (
            <ReferenceForm
              token={token}
              candidateName={candidateName}
              referenceName={referenceName}
              dsoName={dsoName}
              jobTitle={jobTitle}
              requestingUserName={requestingUserName}
            />
          )}
        </div>
        <PublicFooter />
      </div>
    </main>
  );
}

function PublicHeader() {
  return (
    <header className="mb-8 text-center">
      <a
        href="https://dsohire.com"
        className="inline-block text-ink text-lg font-extrabold tracking-[-0.5px]"
      >
        DSO Hire
      </a>
      <div className="mt-3 text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep">
        Reference Request
      </div>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="mt-8 text-center text-[12px] text-slate-meta leading-relaxed">
      <p>
        Powered by{" "}
        <a
          href="https://dsohire.com"
          className="underline hover:text-ink"
        >
          DSO Hire
        </a>
        {" — the dental hiring platform for dental groups."}
      </p>
      <p className="mt-1">
        Questions? Email{" "}
        <a
          href="mailto:support@dsohire.com"
          className="underline hover:text-ink"
        >
          support@dsohire.com
        </a>
      </p>
    </footer>
  );
}

function AlreadyCompletedView({
  referenceName,
  candidateName,
  dsoName,
  completedAt,
}: {
  referenceName: string | null;
  candidateName: string | null;
  dsoName: string | null;
  completedAt: string | null;
}) {
  const firstName = referenceName?.split(" ")[0] ?? "there";
  const when = completedAt
    ? new Date(completedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  return (
    <div className="text-center py-6">
      <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-3">
        Already received
      </div>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.8px] text-ink mb-3">
        Thanks, {firstName} — we have your response.
      </h1>
      <p className="text-[14px] text-slate-body leading-relaxed max-w-[480px] mx-auto">
        Your reference for{" "}
        <strong className="text-ink">
          {candidateName ?? "the candidate"}
        </strong>{" "}
        was recorded
        {when ? <> on <strong className="text-ink">{when}</strong></> : null}
        {" "}and is in {dsoName ?? "the hiring team"}&apos;s hands. You can close this
        window.
      </p>
    </div>
  );
}

function WithdrawnView({ dsoName }: { dsoName: string | null }) {
  return (
    <div className="text-center py-6">
      <div className="text-[10px] font-bold tracking-[3px] uppercase text-slate-meta mb-3">
        Request withdrawn
      </div>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.8px] text-ink mb-3">
        This reference request was withdrawn.
      </h1>
      <p className="text-[14px] text-slate-body leading-relaxed max-w-[480px] mx-auto">
        {dsoName ?? "The hiring team"} no longer needs a response here. You
        don&apos;t need to do anything. If they still want a reference, expect a
        fresh email from them.
      </p>
    </div>
  );
}
