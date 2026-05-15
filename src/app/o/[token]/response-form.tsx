"use client";

/**
 * <OfferResponseForm> — candidate-facing Accept / Decline UI.
 *
 * Flow:
 *   • Renders the full offer letter body (sandboxed iframe, same
 *     pattern as the employer-side LatestSendCard) above the response
 *     panel.
 *   • Two primary buttons: Accept (opens a confirmation card asking
 *     the candidate to type their full legal name as soft-sig) and
 *     Decline (opens a confirmation card with optional reason field).
 *   • Submit posts to recordAcceptance / recordDecline. On success we
 *     swap to an in-place confirmation banner so the candidate sees
 *     immediate feedback before the page revalidates.
 *   • `initialChoice` (from ?choice=accept|decline in the URL — set by
 *     the email's quick-reply links) pre-opens that mode. Candidate
 *     still has to take a final commit action — matches DocuSign's
 *     "deep-link to a confirm step" pattern.
 *
 * Legal posture:
 *   • Acceptance requires typed full legal name (>= 2 chars). Server
 *     captures + persists alongside IP + UA snapshot.
 *   • Decline supports an optional reason (free-text, 1000 char cap).
 *   • Either path is terminal — server enforces unique(offer_send_id).
 *     We surface "already responded" gracefully if the candidate
 *     re-submits.
 */

import { useState, useTransition } from "react";
import { CheckCircle2, X, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { recordAcceptance, recordDecline } from "./actions";

type Choice = "accept" | "decline" | null;

interface OfferResponseFormProps {
  token: string;
  candidateName: string | null;
  dsoName: string;
  jobTitle: string;
  subject: string | null;
  sentAt: string | null;
  /** Pre-rendered HTML fragment of the offer letter body. */
  bodyHtml: string;
  /** ?choice=accept|decline from the email's quick-reply link. */
  initialChoice: Choice;
}

export function OfferResponseForm({
  token,
  candidateName,
  dsoName,
  jobTitle,
  subject,
  sentAt,
  bodyHtml,
  initialChoice,
}: OfferResponseFormProps) {
  const [choice, setChoice] = useState<Choice>(initialChoice);
  const [signedName, setSignedName] = useState<string>(candidateName ?? "");
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [submittedAs, setSubmittedAs] = useState<
    "accepted" | "declined" | null
  >(null);
  const [pending, startTransition] = useTransition();

  const firstName = candidateName?.split(" ")[0] ?? null;
  const sentAtLabel = sentAt
    ? new Date(sentAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  function handleAccept() {
    setError(null);
    if (signedName.trim().length < 2) {
      setError(
        "Type your full legal name to acknowledge the offer (at least 2 characters)."
      );
      return;
    }
    startTransition(async () => {
      const res = await recordAcceptance(token, signedName);
      if (!res.ok) {
        setError(res.error);
        if (res.alreadyResponded) {
          // Force a hard refresh so the page falls into the
          // "AlreadyRespondedView" branch on the server component.
          setTimeout(() => window.location.reload(), 1200);
        }
        return;
      }
      setSubmittedAs("accepted");
    });
  }

  function handleDecline() {
    setError(null);
    startTransition(async () => {
      const res = await recordDecline(token, reason || null);
      if (!res.ok) {
        setError(res.error);
        if (res.alreadyResponded) {
          setTimeout(() => window.location.reload(), 1200);
        }
        return;
      }
      setSubmittedAs("declined");
    });
  }

  /* ── In-place success state ── */

  if (submittedAs === "accepted") {
    return (
      <SuccessPane
        kind="accepted"
        firstName={firstName}
        dsoName={dsoName}
        jobTitle={jobTitle}
      />
    );
  }
  if (submittedAs === "declined") {
    return (
      <SuccessPane
        kind="declined"
        firstName={firstName}
        dsoName={dsoName}
        jobTitle={jobTitle}
      />
    );
  }

  /* ── Live form ── */

  return (
    <div>
      <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-[-0.8px] text-ink mb-2 leading-tight">
        {firstName ? `${firstName}, ` : ""}you have an offer from {dsoName}
      </h1>
      <p className="text-[14px] text-slate-body leading-relaxed mb-1">
        Role: <strong className="text-ink">{jobTitle}</strong>
      </p>
      {sentAtLabel && (
        <p className="text-[13px] text-slate-meta leading-relaxed">
          Sent {sentAtLabel}
          {subject ? <> · Subject: {subject}</> : null}
        </p>
      )}

      <div className="mt-6 mb-7">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Offer letter
        </div>
        <OfferBodyFrame html={bodyHtml} />
      </div>

      {choice === null && (
        <ChoicePane
          onAccept={() => setChoice("accept")}
          onDecline={() => setChoice("decline")}
        />
      )}

      {choice === "accept" && (
        <AcceptPane
          signedName={signedName}
          onChange={setSignedName}
          onCancel={() => {
            setChoice(null);
            setError(null);
          }}
          onSubmit={handleAccept}
          pending={pending}
        />
      )}

      {choice === "decline" && (
        <DeclinePane
          reason={reason}
          onChange={setReason}
          onCancel={() => {
            setChoice(null);
            setError(null);
          }}
          onSubmit={handleDecline}
          pending={pending}
        />
      )}

      {error && (
        <div
          role="alert"
          className="mt-4 border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800 flex items-start gap-2"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <p className="mt-6 text-[12px] text-slate-meta leading-relaxed">
        Your response is final once submitted. If you need to change it later,
        reach out to {dsoName} directly.
      </p>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Choice pane — initial two-button state
 * ───────────────────────────────────────────────────────────── */

function ChoicePane({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="border border-ivory-deep bg-cream p-5 sm:p-6">
      <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep mb-2">
        Your response
      </div>
      <p className="text-[14px] text-ink leading-relaxed mb-4">
        When you&apos;re ready, choose how you&apos;d like to respond.
        Acceptance asks you to type your full legal name as
        acknowledgement; declining lets you add an optional reason.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={onAccept}
          className="inline-flex items-center justify-center gap-2 bg-ink text-ivory px-5 py-3 text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-ink-1000 transition-colors"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Accept offer
        </button>
        <button
          type="button"
          onClick={onDecline}
          className="inline-flex items-center justify-center gap-2 bg-white text-ink border border-[#D4CCBB] px-5 py-3 text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-ivory transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          Decline offer
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Accept pane — typed-name soft-sig
 * ───────────────────────────────────────────────────────────── */

function AcceptPane({
  signedName,
  onChange,
  onCancel,
  onSubmit,
  pending,
}: {
  signedName: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <div className="border border-heritage bg-[#F1F6F2] p-5 sm:p-6">
      <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep mb-2">
        Accept offer
      </div>
      <p className="text-[14px] text-ink leading-relaxed mb-4">
        Type your full legal name below to acknowledge the offer. We&apos;ll
        record your acceptance with the time and your IP address as a digital
        signature — the same approach DocuSign and HelloSign use.
      </p>
      <label className="block mb-4">
        <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-body mb-1.5">
          Your full legal name
        </div>
        <input
          type="text"
          value={signedName}
          onChange={(e) => onChange(e.target.value)}
          maxLength={120}
          autoFocus
          placeholder="e.g. Jordan Reyes"
          disabled={pending}
          className="w-full px-3 py-2.5 bg-white border border-[#D4CCBB] text-ink text-[15px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage disabled:opacity-60"
        />
      </label>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 bg-ink text-ivory px-5 py-3 text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-ink-1000 transition-colors disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Recording…
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Confirm acceptance
              <ArrowRight className="h-3 w-3" />
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 bg-transparent text-slate-body px-4 py-3 text-[12px] font-bold tracking-[1.5px] uppercase hover:text-ink disabled:opacity-60"
        >
          Back
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Decline pane — optional reason
 * ───────────────────────────────────────────────────────────── */

function DeclinePane({
  reason,
  onChange,
  onCancel,
  onSubmit,
  pending,
}: {
  reason: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <div className="border border-[#D4CCBB] bg-white p-5 sm:p-6">
      <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta mb-2">
        Decline offer
      </div>
      <p className="text-[14px] text-ink leading-relaxed mb-4">
        Letting us know why is optional, but it helps the team improve their
        process. Your reason goes only to the hiring team — not the broader
        DSO Hire community.
      </p>
      <label className="block mb-4">
        <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-body mb-1.5">
          Reason (optional)
        </div>
        <textarea
          value={reason}
          onChange={(e) => onChange(e.target.value)}
          maxLength={1000}
          rows={4}
          autoFocus
          placeholder="e.g. Accepted a different offer · Compensation didn't fit · Location wasn't workable"
          disabled={pending}
          className="w-full px-3 py-2.5 bg-cream border border-[#D4CCBB] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage resize-y disabled:opacity-60"
        />
        <div className="mt-1 text-[11px] text-slate-meta text-right">
          {reason.length} / 1000
        </div>
      </label>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 bg-ink text-ivory px-5 py-3 text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-ink-1000 transition-colors disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Recording…
            </>
          ) : (
            <>
              Confirm decline
              <ArrowRight className="h-3 w-3" />
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 bg-transparent text-slate-body px-4 py-3 text-[12px] font-bold tracking-[1.5px] uppercase hover:text-ink disabled:opacity-60"
        >
          Back
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Offer body iframe — sandboxed render of the snapshot HTML
 * ───────────────────────────────────────────────────────────── */

function OfferBodyFrame({ html }: { html: string }) {
  const shell = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:22px;font-family:'Manrope','Helvetica Neue',Arial,sans-serif;color:#14233F;font-size:15px;line-height:1.65;background:#ffffff;}p{margin:0 0 14px;}h2{font-size:18px;margin:22px 0 10px;}h3{font-size:16px;margin:18px 0 8px;}ul{margin:12px 0 16px;padding-left:22px;}strong{color:#14233F;}</style></head><body>${html}</body></html>`;
  return (
    <iframe
      title="Offer letter"
      srcDoc={shell}
      sandbox=""
      className="w-full border border-ivory-deep"
      style={{ height: "520px" }}
    />
  );
}

/* ───────────────────────────────────────────────────────────────
 * Success pane — in-place confirmation after submit
 * ───────────────────────────────────────────────────────────── */

function SuccessPane({
  kind,
  firstName,
  dsoName,
  jobTitle,
}: {
  kind: "accepted" | "declined";
  firstName: string | null;
  dsoName: string;
  jobTitle: string;
}) {
  const headline =
    kind === "accepted"
      ? firstName
        ? `Congrats, ${firstName} — your acceptance is recorded.`
        : "Your acceptance is recorded."
      : firstName
        ? `Thanks for letting ${dsoName} know, ${firstName}.`
        : "Thanks for letting the team know.";

  const body =
    kind === "accepted"
      ? `${dsoName} will be in touch shortly with next steps for the ${jobTitle} role. You can close this window.`
      : `${dsoName} has received your decision on the ${jobTitle} offer. You can close this window.`;

  return (
    <div className="text-center py-8">
      <div
        className="inline-flex items-center justify-center h-12 w-12 rounded-full mb-4"
        style={{
          backgroundColor:
            kind === "accepted" ? "#E8F1EC" : "var(--color-ivory)",
        }}
      >
        {kind === "accepted" ? (
          <CheckCircle2 className="h-6 w-6 text-heritage-deep" />
        ) : (
          <CheckCircle2 className="h-6 w-6 text-slate-meta" />
        )}
      </div>
      <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
        Response recorded
      </div>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.8px] text-ink mb-3">
        {headline}
      </h1>
      <p className="text-[14px] text-slate-body leading-relaxed max-w-[520px] mx-auto">
        {body}
      </p>
    </div>
  );
}
