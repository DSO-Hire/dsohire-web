/**
 * /o/[token] — public candidate-side offer Accept / Decline route
 * (Track E completion).
 *
 * Mirrors /r/[token] (the reference form): NO auth, service-role
 * lookup, brand-styled focused single-task surface. The token IS the
 * authorization — possession of it = right to record exactly one
 * terminal response.
 *
 * Three render branches:
 *   1. No response yet → render the form (full offer + Accept / Decline
 *      buttons). Accepts ?choice=accept|decline from the email's
 *      quick-reply links and pre-selects that mode.
 *   2. Already responded → render the "thanks, on file" view with the
 *      timestamp of their first response.
 *   3. Token unknown → notFound() (Next renders /404).
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getDisplayedDsoName } from "@/lib/dso/affiliation-display";
import { looksLikeOfferToken } from "@/lib/offers/tokens";
import { OfferResponseForm } from "./response-form";

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ choice?: string }>;
}

export const metadata: Metadata = {
  title: "Your offer · DSO Hire",
  robots: { index: false, follow: false },
};

export default async function PublicOfferResponsePage({
  params,
  searchParams,
}: PageProps) {
  const { token } = await params;
  const { choice } = await searchParams;

  if (!looksLikeOfferToken(token)) {
    notFound();
  }

  const admin = createSupabaseServiceRoleClient();
  // Resolve the offer-send row by token. Like the actions file, we
  // hop applications → jobs in separate queries rather than via a
  // deeply-embedded relation select — the Supabase TS types can't
  // resolve the nesting cleanly and degrade to GenericStringError.
  const { data: sendRow, error } = await admin
    .from("application_offer_sends")
    .select("id, application_id, subject, body_html, sent_at")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    console.warn("[offer-public] page lookup failed", error);
    notFound();
  }
  if (!sendRow) {
    notFound();
  }

  const offerSendId = sendRow.id as string;
  const subject = (sendRow.subject as string | null) ?? null;
  const bodyHtml = (sendRow.body_html as string | null) ?? "";
  const sentAt = (sendRow.sent_at as string | null) ?? null;
  const applicationId = sendRow.application_id as string;

  const { data: appRow } = await admin
    .from("applications")
    .select("id, candidate_id, job_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!appRow) notFound();

  const candidateId = (appRow.candidate_id as string | null) ?? null;
  const jobId = (appRow.job_id as string | null) ?? null;
  if (!jobId) notFound();

  const { data: jobRow } = await admin
    .from("jobs")
    .select("id, title, dso_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!jobRow) notFound();
  const jobTitle = (jobRow.title as string | null) ?? "the role";

  // Candidate name (greeting).
  let candidateName: string | null = null;
  if (candidateId) {
    const { data: cand } = await admin
      .from("candidates")
      .select("full_name")
      .eq("id", candidateId)
      .maybeSingle();
    candidateName =
      ((cand as Record<string, unknown> | null)?.full_name as
        | string
        | null
        | undefined) ?? null;
  }

  // DSO display name (affiliation-aware — practice name, not corporate
  // parent). Mirrors the offer email + the /r/[token] reference page.
  let dsoName = "the hiring team";
  if (jobId && applicationId) {
    try {
      const displayed = await getDisplayedDsoName({
        jobId,
        viewer: { role: "candidate", applicationId },
      });
      if (displayed.name) dsoName = displayed.name;
    } catch {
      // Fall back to the default copy. Worst case the candidate sees
      // "the hiring team" instead of "Lakeshore Dental Group".
    }
  }

  // Has the candidate already responded? If so, render the read-only
  // "already responded" branch instead of the live form.
  const { data: existing } = await admin
    .from("application_offer_responses")
    .select("response, responded_at, reason, signed_name")
    .eq("offer_send_id", offerSendId)
    .maybeSingle();

  const existingResponse = existing
    ? {
        response: (existing as Record<string, unknown>).response as string,
        respondedAt: (existing as Record<string, unknown>)
          .responded_at as string,
        reason:
          ((existing as Record<string, unknown>).reason as string | null) ??
          null,
        signedName:
          ((existing as Record<string, unknown>).signed_name as
            | string
            | null) ?? null,
      }
    : null;

  // Pre-selection from the email's quick-reply links. Sanitize to
  // the two acceptable values; anything else falls through to the
  // neutral "review and respond" state.
  const initialChoice: "accept" | "decline" | null =
    choice === "accept"
      ? "accept"
      : choice === "decline"
        ? "decline"
        : null;

  return (
    <main className="min-h-screen bg-ivory py-12 px-4 sm:px-6">
      <div className="mx-auto max-w-[680px]">
        <PublicHeader />
        <div className="bg-card border border-ivory-deep shadow-sm p-6 sm:p-10">
          {existingResponse ? (
            <AlreadyRespondedView
              candidateName={candidateName}
              dsoName={dsoName}
              jobTitle={jobTitle}
              response={existingResponse.response}
              respondedAt={existingResponse.respondedAt}
            />
          ) : (
            <OfferResponseForm
              token={token}
              candidateName={candidateName}
              dsoName={dsoName}
              jobTitle={jobTitle}
              subject={subject}
              sentAt={sentAt}
              bodyHtml={bodyHtml}
              initialChoice={initialChoice}
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
        Your offer
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
        {" — the job board for dental support organizations."}
      </p>
      <p className="mt-1">
        Questions? Email{" "}
        <a
          href="mailto:info@dsohire.com"
          className="underline hover:text-ink"
        >
          info@dsohire.com
        </a>
      </p>
    </footer>
  );
}

function AlreadyRespondedView({
  candidateName,
  dsoName,
  jobTitle,
  response,
  respondedAt,
}: {
  candidateName: string | null;
  dsoName: string;
  jobTitle: string;
  response: string;
  respondedAt: string;
}) {
  const firstName = candidateName?.split(" ")[0] ?? "there";
  const when = respondedAt
    ? new Date(respondedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  const headline =
    response === "accepted"
      ? "Thanks — your acceptance is on file."
      : "Thanks — your response is on file.";
  const body =
    response === "accepted"
      ? `${dsoName} has your acceptance of the ${jobTitle} offer and will be in touch with next steps.`
      : `${dsoName} has your decision on the ${jobTitle} offer. You can close this window.`;
  return (
    <div className="text-center py-6">
      <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-3">
        Already responded
      </div>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.8px] text-ink mb-3">
        {firstName === "there" ? headline : `${headline.replace("Thanks", `Thanks, ${firstName}`)}`}
      </h1>
      <p className="text-[14px] text-slate-body leading-relaxed max-w-[520px] mx-auto">
        {body}
        {when && (
          <>
            {" "}Recorded on{" "}
            <strong className="text-ink">{when}</strong>.
          </>
        )}
      </p>
    </div>
  );
}
