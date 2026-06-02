"use client";

/**
 * <OfferSection> — application-detail surface for sending an offer
 * letter from the library (Phase 5A Track E).
 *
 * Lives in the CANDIDATE-FACING zone of /employer/applications/[id]
 * (section 07, between Messages and the Internal Workspace divider).
 * Renders ONLY when the application's current stage kind is `offer`
 * (parent gates on currentKind === "offer" and only mounts us then).
 *
 * Two states:
 *   • No sends yet: "Send offer" CTA + helper copy.
 *   • Has sends:   most recent shown in a card with "View full text"
 *                  disclosure (iframe) + "Send another" button + the
 *                  earlier history collapsed below.
 *
 * The send modal is a 4-step flow (template → fields → preview →
 * confirm) that posts to `sendOffer()` in offer-actions.ts.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Send,
  Loader2,
  X,
  AlertCircle,
  CheckCircle2,
  FileSignature,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { sendOffer } from "./offer-actions";
import {
  evaluateOfferGuardrail,
  type JobCompPeriod,
} from "@/lib/offers/comp-guardrail";
import { PayBenchmarkHint } from "../../jobs/pay-benchmark-hint";
import {
  OFFER_FIELDS,
  REQUIRED_OFFER_FIELDS,
  renderTemplate,
  type MergeFieldDef,
} from "@/lib/offer-letters/merge";

/* ───────────────────────────────────────────────────────────────
 * Public types — match the server-fetched shapes
 * ───────────────────────────────────────────────────────────── */

export interface OfferTemplateOption {
  id: string;
  name: string;
  body: string;
}

export interface OfferSendRow {
  id: string;
  template_id: string | null;
  template_name: string | null;
  recipient_email: string;
  subject: string;
  body_html: string;
  merge_values: Record<string, string>;
  sent_at: string;
  sender_name: string | null;
  /**
   * Candidate's response to this offer, if any. One per send max
   * (UNIQUE(offer_send_id) on application_offer_responses). Track E
   * completion 2026-05-12.
   */
  response: {
    kind: "accepted" | "declined";
    responded_at: string;
    reason: string | null;
    signed_name: string | null;
  } | null;
}

interface OfferSectionProps {
  applicationId: string;
  candidateName: string;
  candidateEmail: string | null;
  /** Candidate-view DSO name (affiliation-masked). Used in the preview
   * + subject default so it matches what the candidate will see in
   * the rendered email. The server action re-resolves this for the
   * actual send, but the preview needs the same string for parity. */
  dsoName: string;
  jobTitle: string;
  /** "City, State" — auto-filled from the job's first linked location.
   * Empty string when unresolvable. */
  jobLocation: string;
  /** Humanized employment type label ("Full-time", "Part-time", etc.). */
  jobEmploymentType: string;
  /** Job role + state — drive the market-pay reference by the comp field (N4). */
  roleCategory: string;
  benchmarkState: string | null;
  /** N12 — the job's POSTED comp range, for the offer guardrail banner. */
  jobCompMin: number | null;
  jobCompMax: number | null;
  jobCompPeriod: string | null;
  /** N12 OFFER-UX — the job's posted benefits text, to prefill the offer
   * benefits field so the offer matches what was advertised. */
  jobBenefits: string | null;
  templates: OfferTemplateOption[];
  sends: OfferSendRow[];
}

export function OfferSection({
  applicationId,
  candidateName,
  candidateEmail,
  dsoName,
  jobTitle,
  jobLocation,
  jobEmploymentType,
  roleCategory,
  benchmarkState,
  jobCompMin,
  jobCompMax,
  jobCompPeriod,
  jobBenefits,
  templates,
  sends,
}: OfferSectionProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  // When the latest send has been accepted, the primary CTA changes
  // copy + intent. A fresh send becomes a revised-offer flow and
  // requires explicit confirmation before opening the modal — guards
  // against accidental double-fires at someone who's already said yes.
  const [confirmRevision, setConfirmRevision] = useState(false);
  const hasSends = sends.length > 0;
  const latest = sends[0] ?? null;
  const earlier = sends.slice(1);
  const canSend = templates.length > 0 && !!candidateEmail;
  const latestAccepted = latest?.response?.kind === "accepted";
  const ctaLabel = !hasSends
    ? "Send offer"
    : latestAccepted
      ? "Send revised offer"
      : "Send another";

  function handleCtaClick() {
    if (latestAccepted) {
      setConfirmRevision(true);
      return;
    }
    setModalOpen(true);
  }

  // OFFER-UX — when the recruiter lands here via ?compose=offer (e.g. they
  // just flipped the candidate into the Offer stage from the kanban or the
  // stage selector), scroll the offer block into view and open the composer
  // automatically instead of making them hunt for it. We consume the param
  // once (router.replace strips it) so a refresh doesn't reopen the modal.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (searchParams.get("compose") !== "offer") return;
    autoOpenedRef.current = true;
    // Strip the param without adding a history entry.
    router.replace(`/employer/applications/${applicationId}`, { scroll: false });
    if (!canSend) return;
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (latestAccepted) setConfirmRevision(true);
    else setModalOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div ref={sectionRef} id="offer-composer" className="space-y-4 scroll-mt-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-[13px] text-slate-meta leading-relaxed max-w-[520px]">
          {hasSends
            ? `${sends.length} offer${sends.length === 1 ? "" : "s"} sent to ${candidateName}.`
            : `Send a templated offer letter to ${candidateName} via email. Pick a template, fill in the offer specifics, and preview before it goes out.`}
        </p>
        {canSend && (
          <button
            type="button"
            onClick={handleCtaClick}
            className="inline-flex items-center gap-2 bg-[#14233F] text-[#F7F4ED] px-4 py-2 text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-[#070F1C] transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
            {ctaLabel}
          </button>
        )}
      </div>

      {!candidateEmail && (
        <NoticeBox tone="warn">
          We don&apos;t have an email on file for {candidateName}. Once they
          have a contact email, you&apos;ll be able to send an offer letter
          from this section.
        </NoticeBox>
      )}

      {candidateEmail && templates.length === 0 && (
        <NoticeBox tone="info">
          No offer-letter templates yet. An owner or admin can create one
          under <strong>Settings → Offer letters</strong>, then you can send
          from here.
        </NoticeBox>
      )}

      {hasSends && latest && (
        <LatestSendCard send={latest} />
      )}

      {earlier.length > 0 && (
        <EarlierSendsAccordion sends={earlier} />
      )}

      {modalOpen && candidateEmail && (
        <SendOfferModal
          applicationId={applicationId}
          candidateName={candidateName}
          candidateEmail={candidateEmail}
          dsoName={dsoName}
          jobTitle={jobTitle}
          jobLocation={jobLocation}
          jobEmploymentType={jobEmploymentType}
          roleCategory={roleCategory}
          benchmarkState={benchmarkState}
          jobCompMin={jobCompMin}
          jobCompMax={jobCompMax}
          jobCompPeriod={jobCompPeriod}
          jobBenefits={jobBenefits}
          templates={templates}
          onClose={() => setModalOpen(false)}
        />
      )}

      {confirmRevision && (
        <ConfirmRevisionDialog
          candidateName={candidateName}
          jobTitle={jobTitle}
          onCancel={() => setConfirmRevision(false)}
          onConfirm={() => {
            setConfirmRevision(false);
            setModalOpen(true);
          }}
        />
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Latest-send card — "Sent {date} to {email}" + iframe disclosure
 * ───────────────────────────────────────────────────────────── */

function LatestSendCard({ send }: { send: OfferSendRow }) {
  const [open, setOpen] = useState(false);
  const sentAt = new Date(send.sent_at);
  const resp = send.response;
  // Color the card by response state. Accepted → emerald (the original
  // colorway), declined → muted slate (terminal-but-not-celebratory),
  // pending → amber (action awaited on candidate side).
  const containerCls =
    resp?.kind === "accepted"
      ? "border-emerald-200 bg-emerald-50/60"
      : resp?.kind === "declined"
        ? "border-slate-300 bg-slate-50/70"
        : "border-amber-200 bg-amber-50/40";
  return (
    <div className={`border ${containerCls}`}>
      <div className="px-4 py-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
            <span className="text-[10px] font-bold tracking-[2px] uppercase text-emerald-800">
              Offer sent
            </span>
            {send.template_name && (
              <span className="text-[11px] text-slate-meta">
                · {send.template_name}
              </span>
            )}
          </div>
          <div className="text-[13px] text-ink leading-snug">
            <strong>{sentAt.toLocaleDateString()}</strong> at{" "}
            {sentAt.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            to <span className="break-all">{send.recipient_email}</span>
          </div>
          <div className="text-[12px] text-slate-meta mt-0.5">
            Subject: {send.subject}
            {send.sender_name ? ` · Sent by ${send.sender_name}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-[1.5px] uppercase border border-[var(--rule-strong)] text-ink bg-white hover:bg-cream"
        >
          {open ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Hide full text
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              View full text
            </>
          )}
        </button>
      </div>

      {/* Response status — renders when the candidate has accepted or
          declined. Surfaces the typed-name soft-sig + optional decline
          reason inline so the recruiter has full context without
          clicking through to the audit log. */}
      {resp && <OfferResponseStrip response={resp} />}

      {open && (
        <div className="border-t border-emerald-200 bg-white">
          <SendBodyFrame html={send.body_html} />
        </div>
      )}
    </div>
  );
}

function OfferResponseStrip({
  response,
}: {
  response: NonNullable<OfferSendRow["response"]>;
}) {
  const respondedAt = new Date(response.responded_at);
  const accepted = response.kind === "accepted";
  const stripCls = accepted
    ? "border-emerald-300 bg-white"
    : "border-slate-300 bg-white";
  const eyebrowCls = accepted
    ? "text-emerald-800"
    : "text-slate-700";
  const eyebrowLabel = accepted ? "Candidate accepted" : "Candidate declined";
  return (
    <div className={`border-t ${stripCls} px-4 py-3`}>
      <div className="flex items-start gap-2 mb-1">
        {accepted ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 shrink-0 mt-0.5" />
        ) : (
          <X className="h-3.5 w-3.5 text-slate-600 shrink-0 mt-0.5" />
        )}
        <div className="min-w-0">
          <div className={`text-[10px] font-bold tracking-[2px] uppercase ${eyebrowCls}`}>
            {eyebrowLabel}
          </div>
          <div className="text-[13px] text-ink leading-snug">
            <strong>{respondedAt.toLocaleDateString()}</strong> at{" "}
            {respondedAt.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </div>
          {accepted && response.signed_name && (
            <div className="text-[12px] text-slate-meta mt-0.5">
              Typed name on file:{" "}
              <strong className="text-ink">{response.signed_name}</strong>
            </div>
          )}
          {!accepted && response.reason && (
            <div className="text-[12px] text-slate-meta mt-1 italic">
              “{response.reason}”
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Sandboxed iframe so the snapshot HTML (including its inline styles)
 * can't leak into the rest of the page. We use the data: URL approach
 * because the snapshot is a fragment, not a full document — `srcDoc`
 * wraps it in a minimal HTML shell.
 */
function SendBodyFrame({ html }: { html: string }) {
  const shell = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:18px;font-family:'Manrope','Helvetica Neue',Arial,sans-serif;color:#14233F;font-size:14px;line-height:1.6;}p{margin:0 0 12px;}h2{font-size:18px;margin:22px 0 10px;}h3{font-size:16px;margin:18px 0 8px;}ul{margin:12px 0 16px;padding-left:22px;}</style></head><body>${html}</body></html>`;
  return (
    <iframe
      title="Sent offer letter body"
      srcDoc={shell}
      sandbox=""
      className="w-full"
      style={{ height: "520px", border: "0" }}
    />
  );
}

/* ───────────────────────────────────────────────────────────────
 * Earlier-sends accordion
 * ───────────────────────────────────────────────────────────── */

function EarlierSendsAccordion({ sends }: { sends: OfferSendRow[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[1.5px] uppercase text-slate-meta hover:text-ink"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Earlier sends ({sends.length})
      </button>
      {open && (
        <ul className="mt-2 border border-[var(--rule)] bg-white divide-y divide-[var(--rule)]">
          {sends.map((s) => (
            <li key={s.id} className="px-4 py-3 text-[12px] text-slate-body">
              <div className="font-semibold text-ink">
                {new Date(s.sent_at).toLocaleDateString()} ·{" "}
                {new Date(s.sent_at).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
              <div className="text-slate-meta mt-0.5">
                To {s.recipient_email} ·{" "}
                {s.template_name ?? "(template deleted)"}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Confirm-revision dialog — gates the "Send revised offer" CTA when
 * the prior offer is already accepted. Stops a stray click from
 * firing a fresh offer email at someone who already said yes.
 * ───────────────────────────────────────────────────────────── */

function ConfirmRevisionDialog({
  candidateName,
  jobTitle,
  onCancel,
  onConfirm,
}: {
  candidateName: string;
  jobTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#14233F]/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-[480px] bg-white border border-[var(--rule)] shadow-xl">
        <header className="p-5 border-b border-[var(--rule)]">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-amber-700 mb-1 inline-flex items-center gap-2">
            <AlertCircle className="h-3 w-3" />
            Already accepted
          </div>
          <h2 className="text-[17px] font-extrabold tracking-[-0.4px] text-ink">
            Send a revised offer to {candidateName}?
          </h2>
        </header>
        <div className="p-5 text-[13px] text-slate-body leading-relaxed">
          <p>
            {candidateName} already accepted the most recent offer for{" "}
            <strong className="text-ink">{jobTitle}</strong>. Sending a new
            offer will fire a second email and start a fresh accept/decline
            cycle.
          </p>
          <p className="mt-3 text-slate-meta">
            Continue only if the offer terms are intentionally changing —
            e.g., revised comp, updated start date, or corrected typo.
          </p>
        </div>
        <footer className="flex items-center justify-end gap-2 p-4 border-t border-[var(--rule)] bg-cream/40">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-slate-body hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center gap-2 bg-[#14233F] text-[#F7F4ED] px-5 py-2 text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-[#070F1C]"
          >
            <Send className="h-3.5 w-3.5" />
            Continue
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * NoticeBox
 * ───────────────────────────────────────────────────────────── */

function NoticeBox({
  tone,
  children,
}: {
  tone: "warn" | "info";
  children: React.ReactNode;
}) {
  const cls =
    tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-[var(--rule)] bg-cream/40 text-ink";
  return (
    <div className={`border ${cls} p-4 text-[13px] leading-relaxed`}>
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>{children}</div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Send-offer modal
 * ───────────────────────────────────────────────────────────── */

type Step = 1 | 2 | 3 | 4;

function SendOfferModal({
  applicationId,
  candidateName,
  candidateEmail,
  dsoName,
  jobTitle,
  jobLocation,
  jobEmploymentType,
  roleCategory,
  benchmarkState,
  jobCompMin,
  jobCompMax,
  jobCompPeriod,
  jobBenefits,
  templates,
  onClose,
}: {
  applicationId: string;
  candidateName: string;
  candidateEmail: string;
  dsoName: string;
  jobTitle: string;
  jobLocation: string;
  jobEmploymentType: string;
  roleCategory: string;
  benchmarkState: string | null;
  jobCompMin: number | null;
  jobCompMax: number | null;
  jobCompPeriod: string | null;
  jobBenefits: string | null;
  templates: OfferTemplateOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [templateId, setTemplateId] = useState<string | null>(
    templates[0]?.id ?? null
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [subject, setSubject] = useState<string>(`Offer from ${dsoName}`);
  const [error, setError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [pending, startTransition] = useTransition();
  // N12 — structured base comp (separate from the prose offer.compensation).
  const [baseAmount, setBaseAmount] = useState<string>("");
  const [basePeriod, setBasePeriod] = useState<"hourly" | "annual">(
    jobCompPeriod === "annual" ? "annual" : "hourly"
  );

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId]
  );

  // OFFER-UX — prefill the benefits field from what the job posting already
  // advertised, so the offer doesn't silently drop benefits the candidate
  // saw on the listing. Only seeds an EMPTY field, once per template, and
  // stays fully editable.
  const seededBenefitsForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedTemplate) return;
    if (seededBenefitsForRef.current === selectedTemplate.id) return;
    seededBenefitsForRef.current = selectedTemplate.id;
    if (!jobBenefits || !jobBenefits.trim()) return;
    if (!isTokenInBody(selectedTemplate.body, "offer.benefits_summary")) return;
    setValues((prev) =>
      (prev["offer.benefits_summary"] ?? "").trim() !== ""
        ? prev
        : { ...prev, "offer.benefits_summary": jobBenefits.trim() }
    );
  }, [selectedTemplate, jobBenefits]);

  // OFFER-UX — mirror the structured base amount into the prose Compensation
  // field so recruiters don't retype it on a straight hourly/salary offer.
  // We only overwrite while the field is empty or still showing OUR last
  // auto-seed; the moment the recruiter edits it themselves, we back off.
  const lastAutoCompRef = useRef<string>("");
  useEffect(() => {
    if (!selectedTemplate) return;
    if (!isTokenInBody(selectedTemplate.body, "offer.compensation")) return;
    const numeric = baseAmount.trim()
      ? Number(baseAmount.replace(/[^0-9.]/g, ""))
      : null;
    if (numeric == null || !Number.isFinite(numeric) || numeric <= 0) return;
    const pretty = numeric % 1 === 0 ? String(numeric) : numeric.toFixed(2);
    const seed = `$${pretty}/${basePeriod === "annual" ? "year" : "hour"}`;
    setValues((prev) => {
      const cur = prev["offer.compensation"] ?? "";
      if (cur !== "" && cur !== lastAutoCompRef.current) return prev;
      if (cur === seed) return prev;
      return { ...prev, "offer.compensation": seed };
    });
    lastAutoCompRef.current = seed;
  }, [baseAmount, basePeriod, selectedTemplate]);

  function next() {
    setError(null);
    if (step === 1) {
      if (!selectedTemplate) {
        setError("Pick a template first.");
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      const missing = REQUIRED_OFFER_FIELDS.filter(
        (f) => isTokenInBody(selectedTemplate?.body ?? "", f.key) &&
          !(values[f.key] ?? "").trim()
      );
      if (missing.length > 0) {
        setError(
          `Required field${missing.length === 1 ? "" : "s"} missing: ${missing
            .map((f) => f.label)
            .join(", ")}.`
        );
        return;
      }
      // Move to preview, which fetches the rendered HTML via the action's
      // dry-run path. We just call the render client-side via a thin
      // wrapper that mirrors the server-side renderer.
      setStep(3);
      return;
    }
    if (step === 3) {
      setStep(4);
      return;
    }
  }

  function back() {
    setError(null);
    if (step > 1) setStep((s) => (s - 1) as Step);
  }

  function handleSubmit() {
    if (!selectedTemplate) return;
    setError(null);
    startTransition(async () => {
      const parsedBase = baseAmount.trim()
        ? Number(baseAmount.replace(/[^0-9.]/g, "")) || null
        : null;
      const res = await sendOffer({
        applicationId,
        templateId: selectedTemplate.id,
        mergeValues: values,
        subject: subject.trim() || `Offer from ${dsoName}`,
        baseAmount: parsedBase,
        basePeriod,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  // Build the preview HTML when we hit step 3. We use the same merge
  // engine as the server so the preview matches what will actually be
  // sent. Auto-filled fields are injected from the props we already
  // have (candidate full_name + email, job title, DSO name).
  useEffect(() => {
    if (step !== 3 || !selectedTemplate) return;
    const allValues: Record<string, string> = {
      "candidate.full_name": candidateName,
      "candidate.first_name": candidateName.split(" ")[0] ?? candidateName,
      "candidate.email": candidateEmail,
      "job.title": jobTitle,
      "job.location": jobLocation,
      "job.employment_type": jobEmploymentType,
      "dso.name": dsoName,
      ...values,
    };
    const result = renderTemplate(selectedTemplate.body, allValues);
    setPreviewHtml(result.html);
  }, [
    step,
    selectedTemplate,
    candidateName,
    candidateEmail,
    jobTitle,
    jobLocation,
    jobEmploymentType,
    dsoName,
    values,
  ]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#14233F]/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="w-full max-w-[720px] max-h-[92vh] bg-white border border-[var(--rule)] shadow-xl flex flex-col">
        <header className="flex items-start justify-between p-5 border-b border-[var(--rule)]">
          <div>
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1 inline-flex items-center gap-2">
              <FileSignature className="h-3 w-3" />
              Offer letter
            </div>
            <h2 className="text-[18px] font-extrabold tracking-[-0.4px] text-ink">
              Send an offer to {candidateName}
            </h2>
            <div className="mt-1 text-[12px] text-slate-meta">
              Step {step} of 4 ·{" "}
              {step === 1
                ? "Pick a template"
                : step === 2
                  ? "Fill in offer specifics"
                  : step === 3
                    ? "Preview"
                    : "Confirm & send"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="p-1 text-slate-meta hover:text-ink disabled:opacity-60"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {step === 1 && (
            <Step1PickTemplate
              templates={templates}
              templateId={templateId}
              onPick={setTemplateId}
            />
          )}
          {step === 2 && selectedTemplate && (
            <div className="space-y-5">
              <OfferBaseCompField
                amount={baseAmount}
                onAmount={setBaseAmount}
                period={basePeriod}
                onPeriod={setBasePeriod}
                jobCompMin={jobCompMin}
                jobCompMax={jobCompMax}
                jobCompPeriod={jobCompPeriod}
              />
              <Step2FillFields
                template={selectedTemplate}
                values={values}
                onChange={setValues}
                roleCategory={roleCategory}
                benchmarkState={benchmarkState}
              />
            </div>
          )}
          {step === 3 && (
            <Step3Preview html={previewHtml} />
          )}
          {step === 4 && (
            <Step4Confirm
              candidateName={candidateName}
              candidateEmail={candidateEmail}
              subject={subject}
              onSubjectChange={setSubject}
            />
          )}
          {error && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 p-4 border-t border-[var(--rule)] bg-cream/40">
          <button
            type="button"
            onClick={step === 1 ? onClose : back}
            disabled={pending}
            className="inline-flex items-center gap-2 px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-slate-body hover:text-ink disabled:opacity-60"
          >
            {step === 1 ? (
              "Cancel"
            ) : (
              <>
                <ArrowLeft className="h-3 w-3" />
                Back
              </>
            )}
          </button>
          {step < 4 ? (
            <button
              type="button"
              onClick={next}
              disabled={pending}
              className="inline-flex items-center gap-2 bg-[#14233F] text-[#F7F4ED] px-5 py-2 text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-[#070F1C] disabled:opacity-60"
            >
              Next
              <ArrowRight className="h-3 w-3" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={pending}
              className="inline-flex items-center gap-2 bg-[#14233F] text-[#F7F4ED] px-5 py-2 text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-[#070F1C] disabled:opacity-60"
            >
              {pending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Send offer
                </>
              )}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

/* ── Step 1 ── */

function Step1PickTemplate({
  templates,
  templateId,
  onPick,
}: {
  templates: OfferTemplateOption[];
  templateId: string | null;
  onPick: (id: string) => void;
}) {
  if (templates.length === 0) {
    return (
      <p className="text-[13px] text-slate-body">
        No active templates available. An owner needs to create one under
        Settings → Offer letters before you can send.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[13px] text-slate-body leading-relaxed">
        Pick a template. You&apos;ll fill in the per-offer specifics
        (start date, comp, etc.) in the next step.
      </p>
      <ul className="border border-[var(--rule)] bg-white divide-y divide-[var(--rule)]">
        {templates.map((t) => {
          const selected = t.id === templateId;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onPick(t.id)}
                className={
                  "w-full text-left px-4 py-3 transition-colors " +
                  (selected ? "bg-cream" : "hover:bg-cream/60")
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[14px] font-semibold text-ink">
                    {t.name}
                  </span>
                  {selected && (
                    <CheckCircle2 className="h-4 w-4 text-heritage-deep" />
                  )}
                </div>
                <div className="text-[12px] text-slate-meta mt-0.5 line-clamp-2">
                  {t.body.slice(0, 220)}
                  {t.body.length > 220 ? "…" : ""}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Step 2 ── */

/**
 * N12 — structured base-comp input + live guardrail banner. The amount/period
 * here is the number we check against the job's posted range (and store for
 * offer analytics); the prose pay details still live in the "Compensation"
 * field. Phase 1 surfaces an in-range / out-of-range banner; Phase 2 will
 * route out-of-range offers through the approval policy.
 */
function OfferBaseCompField({
  amount,
  onAmount,
  period,
  onPeriod,
  jobCompMin,
  jobCompMax,
  jobCompPeriod,
}: {
  amount: string;
  onAmount: (v: string) => void;
  period: "hourly" | "annual";
  onPeriod: (p: "hourly" | "annual") => void;
  jobCompMin: number | null;
  jobCompMax: number | null;
  jobCompPeriod: string | null;
}) {
  const numeric = amount.trim() ? Number(amount.replace(/[^0-9.]/g, "")) : null;
  const guardrail = evaluateOfferGuardrail({
    baseAmount: numeric != null && Number.isFinite(numeric) ? numeric : null,
    basePeriod: period,
    jobMin: jobCompMin,
    jobMax: jobCompMax,
    jobPeriod: jobCompPeriod as JobCompPeriod | null,
  });
  const hasRange = jobCompMin != null || jobCompMax != null;

  return (
    <div className="rounded-md border border-[var(--rule)] bg-cream/40 p-4">
      <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1">
        Base compensation
      </div>
      <p className="text-[12px] text-slate-body leading-relaxed mb-2.5">
        The structured base we check against your posted range and use in offer
        analytics. The full pay details still go in the “Compensation” field below.
        {!hasRange && " (This job has no posted range, so there's nothing to check against.)"}
      </p>
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-meta text-sm">
            $
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => onAmount(e.target.value)}
            placeholder={jobCompMin != null ? String(jobCompMin) : "Base amount"}
            className="w-full pl-6 pr-3 py-2 border border-[var(--rule-strong)] bg-white text-ink text-sm focus:outline-none focus:border-heritage"
          />
        </div>
        <select
          value={period}
          onChange={(e) => onPeriod(e.target.value as "hourly" | "annual")}
          className="px-3 py-2 border border-[var(--rule-strong)] bg-white text-ink text-sm focus:outline-none focus:border-heritage"
        >
          <option value="hourly">per hour</option>
          <option value="annual">per year</option>
        </select>
      </div>
      {guardrail.severity === "ok" && guardrail.message && (
        <div className="mt-2 rounded border border-heritage/30 bg-heritage/[0.06] px-3 py-2 text-[12px] font-medium text-heritage-deep">
          ✓ {guardrail.message}
        </div>
      )}
      {guardrail.severity === "out_of_range" && guardrail.message && (
        <div className="mt-2 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            {guardrail.message} You can still send — this is the kind of offer your
            approval policy can route for sign-off.
          </span>
        </div>
      )}
    </div>
  );
}

function Step2FillFields({
  template,
  values,
  onChange,
  roleCategory,
  benchmarkState,
}: {
  template: OfferTemplateOption;
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  roleCategory: string;
  benchmarkState: string | null;
}) {
  // Only ask for offer.* fields the template actually references. If a
  // template doesn't use offer.signing_bonus, we don't need to ask the
  // recruiter for it — keeps the form focused.
  const usedFields = useMemo(() => {
    return OFFER_FIELDS.filter((f) => isTokenInBody(template.body, f.key));
  }, [template.body]);

  function setField(key: string, value: string) {
    onChange({ ...values, [key]: value });
  }

  if (usedFields.length === 0) {
    return (
      <p className="text-[13px] text-slate-body">
        This template doesn&apos;t reference any sender-filled merge fields.
        You can move on to the preview.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-slate-body leading-relaxed">
        Fill in the values that change per offer. Required fields are marked.
      </p>
      {usedFields.some((f) => f.key === "offer.compensation") && (
        <PayBenchmarkHint
          roleCategory={roleCategory}
          state={benchmarkState}
          compMin=""
          compMax=""
          compPeriod=""
          accentText="text-heritage-deep"
        />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {usedFields.map((f) => {
          if (f.key === "offer.start_date") {
            return (
              <DateOfferField
                key={f.key}
                field={f}
                value={values[f.key] ?? ""}
                onChange={(v) => setField(f.key, v)}
                withTime={false}
              />
            );
          }
          if (f.key === "offer.deadline_to_accept") {
            return (
              <DateOfferField
                key={f.key}
                field={f}
                value={values[f.key] ?? ""}
                onChange={(v) => setField(f.key, v)}
                withTime
              />
            );
          }
          return (
            <OfferField
              key={f.key}
              field={f}
              value={values[f.key] ?? ""}
              onChange={(v) => setField(f.key, v)}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ── OFFER-UX date helpers ──
 * The merge value stored on the offer (and rendered in the letter) is a
 * human-readable string like "Monday, June 16, 2026". The <input> wants an
 * ISO value. These convert between the two so the recruiter gets a real
 * calendar/clock picker while the letter still reads naturally. Parsing the
 * stored string back to ISO is best-effort (strips the weekday prefix and
 * trailing tz); if it can't parse, the picker just starts empty and the
 * "Appears as" caption still shows what's saved. */
function isoToHumanDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
function humanToIsoDate(human: string): string {
  if (!human) return "";
  const cleaned = human.replace(/^[A-Za-z]+,\s*/, "").replace(/\s+at\s+.*$/i, "");
  const d = new Date(cleaned);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isoToHumanDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso); // datetime-local is local time, no tz suffix
  if (Number.isNaN(d.getTime())) return "";
  const datePart = d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timePart = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} at ${timePart}`;
}
function humanToIsoDateTime(human: string): string {
  if (!human) return "";
  const cleaned = human
    .replace(/^[A-Za-z]+,\s*/, "")
    .replace(/\bat\b/i, " ")
    .replace(/\s+[A-Za-z]{2,4}\s*$/, "")
    .trim();
  const d = new Date(cleaned);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${da}T${h}:${mi}`;
}

/** OFFER-UX — calendar (and optionally clock) picker for date merge fields. */
function DateOfferField({
  field,
  value,
  onChange,
  withTime,
}: {
  field: MergeFieldDef;
  value: string;
  onChange: (v: string) => void;
  withTime: boolean;
}) {
  const inputValue = withTime ? humanToIsoDateTime(value) : humanToIsoDate(value);
  return (
    <label className="block sm:col-span-2">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta">
          {field.label}
        </span>
        {field.required && (
          <span className="text-[9px] font-bold tracking-[1.5px] uppercase text-red-700">
            Required
          </span>
        )}
      </div>
      <input
        type={withTime ? "datetime-local" : "date"}
        value={inputValue}
        onChange={(e) =>
          onChange(
            e.target.value
              ? withTime
                ? isoToHumanDateTime(e.target.value)
                : isoToHumanDate(e.target.value)
              : ""
          )
        }
        className="w-full sm:w-auto px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[13px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage"
      />
      {value && (
        <p className="mt-1 text-[11px] text-slate-meta">
          Appears in the letter as:{" "}
          <span className="text-slate-body">{value}</span>
        </p>
      )}
    </label>
  );
}

/** OFFER-UX — display overrides so the prose pay field reads as an
 * additive "details" field now that the structured base lives up top. */
const OFFER_FIELD_LABEL_OVERRIDES: Record<string, string> = {
  "offer.compensation": "Full compensation details",
};
const OFFER_FIELD_HELPER: Record<string, string> = {
  "offer.compensation":
    "Pre-filled from your base above — add bonuses, production %, differentials, or equity here.",
};

function OfferField({
  field,
  value,
  onChange,
}: {
  field: MergeFieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const isLong =
    field.key === "offer.benefits_summary" ||
    field.key === "offer.custom_note" ||
    field.key === "offer.compensation";
  // Long-ish fields get a textarea; short ones get an input. Span full
  // width when long.
  const wrapperClass = isLong ? "sm:col-span-2" : "";
  const label = OFFER_FIELD_LABEL_OVERRIDES[field.key] ?? field.label;
  const helper = OFFER_FIELD_HELPER[field.key];
  return (
    <label className={`block ${wrapperClass}`}>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta">
          {label}
        </span>
        {field.required && (
          <span className="text-[9px] font-bold tracking-[1.5px] uppercase text-red-700">
            Required
          </span>
        )}
      </div>
      {helper && (
        <p className="text-[11px] text-slate-meta leading-snug mb-1.5">{helper}</p>
      )}
      {isLong ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={field.example}
          className="w-full px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[13px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage resize-y"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.example}
          className="w-full px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[13px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage"
        />
      )}
    </label>
  );
}

/* ── Step 3 ── */

function Step3Preview({ html }: { html: string }) {
  if (!html) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-meta">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  const shell = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:20px;font-family:'Manrope','Helvetica Neue',Arial,sans-serif;color:#14233F;font-size:14px;line-height:1.6;background:#FAF7F1;}p{margin:0 0 12px;}h2{font-size:18px;margin:22px 0 10px;}h3{font-size:16px;margin:18px 0 8px;}ul{margin:12px 0 16px;padding-left:22px;}</style></head><body>${html}</body></html>`;
  return (
    <div>
      <p className="text-[13px] text-slate-body mb-3">
        Preview of the rendered offer letter. The actual email also includes
        the standard DSO Hire header + closing chrome.
      </p>
      <iframe
        title="Offer letter preview"
        srcDoc={shell}
        sandbox=""
        className="w-full border border-[var(--rule-strong)]"
        style={{ height: "520px" }}
      />
    </div>
  );
}

/* ── Step 4 ── */

function Step4Confirm({
  candidateName,
  candidateEmail,
  subject,
  onSubjectChange,
}: {
  candidateName: string;
  candidateEmail: string;
  subject: string;
  onSubjectChange: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-slate-body leading-relaxed">
        You&apos;re about to send this offer to{" "}
        <strong>{candidateName}</strong> at{" "}
        <span className="break-all">{candidateEmail}</span>. Last chance to
        adjust the subject line.
      </p>
      <label className="block">
        <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1.5">
          Subject
        </div>
        <input
          type="text"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          maxLength={200}
          className="w-full px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage"
        />
      </label>
      <div className="text-[12px] text-slate-meta leading-relaxed">
        The recipient sees the rendered offer letter wrapped in the standard
        DSO Hire email chrome. A snapshot of the exact HTML is saved on the
        application so the legal record is preserved even if the template is
        later edited or archived.
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

function isTokenInBody(body: string, key: string): boolean {
  // Match `{{ key }}` with optional whitespace, case-sensitive.
  const re = new RegExp(`\\{\\{\\s*${escapeRegex(key)}\\s*\\}\\}`);
  return re.test(body);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
