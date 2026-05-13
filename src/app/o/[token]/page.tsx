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
  const { data: sendRow, error } = await admin
    .from("application_offer_sends")
    .select(
      "id, application_id, subject, body_html, sent_at, " +
        "applications:applications(id, candidate_id, job_id, " +
        "jobs:jobs(id, title, dso_id))"
    )
    .eq("token", token)
    .maybeSingle();
  if (error) {
    console.warn("[offer-public] page lookup failed", error);
    notFound();
  }
  if (!sendRow) {
    notFound();
  }

  const s = sendRow as Record<string, unknown>;
  const offerSendId = s.id as string;
  const subject = (s.subject as string | null) ?? null;
  const bodyHtml = (s.body_html as string | null) ?? "";
  const sentAt = (s.sent_at as string | null) ?? null;
  const appRel = s.applications as
    | Record<string, unknown>
    | Array<Record<string, unknown>>
    | null;
  const appRow = Array.isArray(appRel) ? appRel[0] ?? null : appRel;
  if (!appRow) notFound();

  const applicationId = (appRow.id as string | null) ?? null;
  const candidateId = (appRow.candidate_id as string | null) ?? null;
  const jobRel = appRow.jobs as
    | Record<string, unknown>
    | Array<Record<string, unknown>>
    | null;
  const jobRow = Array.isArray(jobRel) ? jobRel[0] ?? null : jobRel;
  if (!jobRow) notFound();
  const jobId = (jobRow.id as string | null) ?? null;
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
      // "the hiring team" instead of "67 Dental".
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
    <main className="min-h-screen bg-[#F7F4ED] py-12 px-4 sm:px-6">
      <div className="mx-auto max-w-[680px]">
        <PublicHeader />
        <div className="bg-white border border-[#ECE7DB] shadow-sm p-6 sm:p-10">
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
        className="inline-block text-[#14233F] text-lg font-extrabold tracking-[-0.5px]"
      >
        DSO Hire
      </a>
      <div className="mt-3 text-[10px] font-bold tracking-[3px] uppercase text-[#2F5D4F]">
        Your offer
      </div>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="mt-8 text-center text-[12px] text-[#6E8395] leading-relaxed">
      <p>
        Powered by{" "}
        <a
          href="https://dsohire.com"
          className="underline hover:text-[#14233F]"
        >
          DSO Hire
        </a>
        {" — the job board for dental support organizations."}
      </p>
      <p className="mt-1">
        Questions? Email{" "}
        <a
          href="mailto:info@dsohire.com"
          className="underline hover:text-[#14233F]"
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
      <div className="text-[10px] font-bold tracking-[3px] uppercase text-[#2F5D4F] mb-3">
        Already responded
      </div>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.8px] text-[#14233F] mb-3">
        {firstName === "there" ? headline : `${headline.replace("Thanks", `Thanks, ${firstName}`)}`}
      </h1>
      <p className="text-[14px] text-[#4A6278] leading-relaxed max-w-[520px] mx-auto">
        {body}
        {when && (
          <>
            {" "}Recorded on{" "}
            <strong className="text-[#14233F]">{when}</strong>.
          </>
        )}
      </p>
    </div>
  );
}
