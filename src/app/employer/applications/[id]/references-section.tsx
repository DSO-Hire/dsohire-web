"use client";

/**
 * <ReferencesSection> — employer-side view of reference requests
 * collected on a candidate (Phase 5A Track D).
 *
 * Lives inside the Internal Workspace block on
 * /employer/applications/[id]. Three responsibilities:
 *   1. Render a "Request a reference" CTA + modal (name/email/role/
 *      relationship) that calls createReferenceRequest.
 *   2. List existing requests with status pill + per-request actions:
 *      Resend, Mark declined, View response, Delete.
 *   3. Render the completed response in a structured expander using
 *      the question copy from reference-data.ts.
 *
 * All mutations route through the server actions in reference-actions.ts.
 * After each mutation we router.refresh() so the server-fetched list
 * stays the source of truth (no optimistic state to keep in sync).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Mail,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Send,
  Ban,
  Trash2,
  Eye,
  EyeOff,
  X,
} from "lucide-react";
import {
  REFERENCE_FIELDS,
  formatReferenceAnswer,
  renderPrompt,
  type ReferenceRequestStatus,
} from "./reference-data";
import {
  createReferenceRequest,
  resendReferenceRequest,
  markReferenceDeclined,
  deleteReferenceRequest,
} from "./reference-actions";

/* ───────────────────────────────────────────────────────────────
 * Public types — matches the server-fetched select shape
 * ───────────────────────────────────────────────────────────── */

export interface ReferenceRequestRow {
  id: string;
  reference_name: string;
  reference_email: string;
  reference_role: string | null;
  relationship: string | null;
  status: string; // narrowed at render time
  sent_at: string | null;
  completed_at: string | null;
  response_data: Record<string, string | null> | null;
  decline_reason: string | null;
  created_at: string;
}

interface ReferencesSectionProps {
  applicationId: string;
  candidateName: string | null;
  requests: ReferenceRequestRow[];
  /**
   * Current pipeline stage kind. References can only be requested once
   * the candidate is past `screen` (i.e., kind in interview/offer/hired).
   * `open` + `screen` show a gentle gate; terminal kinds (rejected/
   * withdrawn) also hide the CTA but still render existing rows for
   * the audit trail.
   */
  currentStageKind: string;
}

/** Pipeline-stage kinds that allow new reference requests. */
const REQUEST_ENABLED_KINDS = new Set(["interview", "offer", "hired"]);

/* ───────────────────────────────────────────────────────────────
 * Main component
 * ───────────────────────────────────────────────────────────── */

export function ReferencesSection({
  applicationId,
  candidateName,
  requests,
  currentStageKind,
}: ReferencesSectionProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const canRequest = REQUEST_ENABLED_KINDS.has(currentStageKind);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-slate-meta leading-relaxed max-w-[480px]">
          {requests.length === 0
            ? `Ask 2-3 professional references about ${candidateName ?? "this candidate"}. They get an email with a private link to a short form (3-5 min). Responses show up here when they finish.`
            : `${requests.length} request${requests.length === 1 ? "" : "s"} on file. Responses appear here as they come in.`}
        </p>
        {canRequest && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 bg-[#14233F] text-[#F7F4ED] px-4 py-2 text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-[#070F1C] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Request a reference
          </button>
        )}
      </div>

      {!canRequest && (
        <StageGateNotice currentStageKind={currentStageKind} />
      )}

      {requests.length === 0 ? (
        <EmptyState candidateName={candidateName} canRequest={canRequest} />
      ) : (
        <div className="border border-[var(--rule)] bg-white divide-y divide-[var(--rule)]">
          {requests.map((req) => (
            <RequestRow
              key={req.id}
              applicationId={applicationId}
              candidateName={candidateName}
              req={req}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <RequestModal
          applicationId={applicationId}
          candidateName={candidateName}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Stage gate notice — shown when the application is in a stage that
 * doesn't yet warrant references (open / screen) or is terminal
 * (rejected / withdrawn).
 * ───────────────────────────────────────────────────────────── */

function StageGateNotice({ currentStageKind }: { currentStageKind: string }) {
  const isTerminal =
    currentStageKind === "rejected" || currentStageKind === "withdrawn";
  return (
    <div className="border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-amber-800 mt-0.5 shrink-0" />
        <div>
          <p className="text-[13px] font-semibold text-amber-900 mb-1">
            {isTerminal
              ? "This application is closed."
              : "References open after the screen stage."}
          </p>
          <p className="text-[12px] text-amber-800 leading-relaxed">
            {isTerminal
              ? "New reference requests are disabled on rejected or withdrawn applications. Existing requests stay visible for the audit trail."
              : "Move the candidate into Interview or later to start collecting references. Most DSOs hold references until after a successful screen."}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Empty state
 * ───────────────────────────────────────────────────────────── */

function EmptyState({
  candidateName,
  canRequest,
}: {
  candidateName: string | null;
  canRequest: boolean;
}) {
  return (
    <div className="border border-[var(--rule)] bg-cream/40 p-6">
      <div className="flex items-start gap-3">
        <Mail className="h-4 w-4 text-heritage-deep mt-0.5 shrink-0" />
        <div>
          <p className="text-[13px] font-semibold text-ink mb-1">
            No references requested yet
          </p>
          <p className="text-[13px] text-slate-body leading-relaxed">
            Most DSOs collect 2-3 references on a finalist.{" "}
            {canRequest ? (
              <>
                Click <strong>Request a reference</strong> above to send{" "}
                {candidateName ? <strong>{candidateName}</strong> : "the candidate"}
                &apos;s reference a private link to a short 7-question form.
              </>
            ) : (
              <>Once this application moves to Interview or later, you&apos;ll be able to send a reference request from this section.</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Status badge
 * ───────────────────────────────────────────────────────────── */

function statusBadge(status: string, completedAt: string | null): {
  label: string;
  className: string;
  Icon: React.ComponentType<{ className?: string }>;
} {
  const narrow = status as ReferenceRequestStatus;
  switch (narrow) {
    case "pending":
      return {
        label: "Sending…",
        className:
          "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
        Icon: Loader2,
      };
    case "sent":
      return {
        label: "Awaiting response",
        className:
          "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-300",
        Icon: Mail,
      };
    case "completed": {
      const when = completedAt
        ? new Date(completedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })
        : null;
      return {
        label: when ? `Completed · ${when}` : "Completed",
        className:
          "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-300",
        Icon: CheckCircle2,
      };
    }
    case "declined":
      return {
        label: "Declined",
        className: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300",
        Icon: Ban,
      };
    default:
      return {
        label: status,
        className: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300",
        Icon: AlertCircle,
      };
  }
}

/* ───────────────────────────────────────────────────────────────
 * Request row
 * ───────────────────────────────────────────────────────────── */

function RequestRow({
  applicationId,
  candidateName,
  req,
}: {
  applicationId: string;
  candidateName: string | null;
  req: ReferenceRequestRow;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showResponse, setShowResponse] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);

  const badge = statusBadge(req.status, req.completed_at);
  const BadgeIcon = badge.Icon;

  function runAction(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function onDelete() {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        `Delete the reference request for ${req.reference_name}? This cannot be undone.`
      );
      if (!ok) return;
    }
    runAction(() => deleteReferenceRequest(req.id));
  }

  const subtitleParts: string[] = [];
  if (req.reference_role) subtitleParts.push(req.reference_role);
  if (req.relationship) subtitleParts.push(req.relationship);

  const sentMeta = req.sent_at
    ? `Sent ${new Date(req.sent_at).toLocaleDateString()}`
    : "Not yet sent";

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-ink leading-snug">
            {req.reference_name}
          </div>
          <div className="text-[12px] text-slate-body mt-0.5 break-all">
            {req.reference_email}
          </div>
          {subtitleParts.length > 0 && (
            <div className="text-[12px] text-slate-body mt-0.5">
              {subtitleParts.join(" · ")}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold ${badge.className}`}
            >
              <BadgeIcon
                className={`h-3 w-3 ${req.status === "pending" ? "animate-spin" : ""}`}
              />
              {badge.label}
            </span>
            <span className="text-[11px] text-slate-meta">{sentMeta}</span>
          </div>
          {req.status === "declined" && req.decline_reason && (
            <div className="mt-2 text-[12px] text-slate-body bg-slate-50 border border-slate-200 px-3 py-2">
              <span className="font-semibold text-slate-700">Reason: </span>
              {req.decline_reason}
            </div>
          )}
        </div>

        {/* Right column: actions */}
        <div className="flex flex-wrap items-center gap-2">
          {req.status === "completed" && (
            <button
              type="button"
              onClick={() => setShowResponse((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-[1.5px] uppercase border border-[var(--rule-strong)] text-[#14233F] bg-white hover:bg-cream transition-colors"
            >
              {showResponse ? (
                <>
                  <EyeOff className="h-3 w-3" />
                  Hide response
                </>
              ) : (
                <>
                  <Eye className="h-3 w-3" />
                  View response
                </>
              )}
            </button>
          )}
          {(req.status === "sent" || req.status === "pending") && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => runAction(() => resendReferenceRequest(req.id))}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-[1.5px] uppercase bg-[#4D7A60] text-ivory hover:bg-[#3d6450] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {pending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
                Resend
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setDeclineOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-[1.5px] uppercase border border-[var(--rule-strong)] text-slate-body bg-white hover:bg-cream transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Ban className="h-3 w-3" />
                Mark declined
              </button>
            </>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-[1.5px] uppercase border border-red-300 text-red-700 bg-white hover:bg-red-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 text-[12px] text-red-700 bg-red-50 border border-red-200 px-3 py-2">
          {error}
        </div>
      )}

      {showResponse && req.status === "completed" && (
        <ResponseExpander
          candidateName={candidateName}
          response={req.response_data}
        />
      )}

      {declineOpen && (
        <DeclineModal
          referenceName={req.reference_name}
          onClose={() => setDeclineOpen(false)}
          onConfirm={(reason) => {
            setDeclineOpen(false);
            runAction(() => markReferenceDeclined(req.id, reason));
          }}
        />
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Response expander — structured display using REFERENCE_FIELDS
 * ───────────────────────────────────────────────────────────── */

function ResponseExpander({
  candidateName,
  response,
}: {
  candidateName: string | null;
  response: Record<string, string | null> | null;
}) {
  if (!response) {
    return (
      <div className="mt-4 border border-[var(--rule)] bg-cream/30 p-5 text-[13px] text-slate-meta italic">
        Response data is not available.
      </div>
    );
  }
  return (
    <div className="mt-4 border border-[var(--rule)] bg-cream/30 divide-y divide-[var(--rule)]">
      {REFERENCE_FIELDS.map((field) => {
        const value = response[field.key] ?? null;
        const display = formatReferenceAnswer(field, value);
        return (
          <div key={field.key} className="p-4">
            <div className="text-[12px] font-semibold text-ink leading-snug mb-1">
              {renderPrompt(field.promptTemplate, candidateName)}
            </div>
            {display ? (
              <div
                className={`text-[13px] text-ink leading-relaxed ${field.kind === "long_text" ? "whitespace-pre-wrap" : ""}`}
              >
                {display}
              </div>
            ) : (
              <div className="text-[13px] text-slate-meta italic">
                {field.required ? "No answer provided" : "Not answered (optional)"}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Request modal — name / email / role / relationship
 * ───────────────────────────────────────────────────────────── */

function RequestModal({
  applicationId,
  candidateName,
  onClose,
}: {
  applicationId: string;
  candidateName: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [relationship, setRelationship] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Enter the reference's name.");
      return;
    }
    if (!email.trim()) {
      setError("Enter the reference's email.");
      return;
    }
    startTransition(async () => {
      const result = await createReferenceRequest(applicationId, {
        name: name.trim(),
        email: email.trim(),
        role: role.trim() || null,
        relationship: relationship.trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#14233F]/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="w-full max-w-[520px] bg-white border border-[var(--rule)] shadow-xl">
        <header className="flex items-start justify-between p-5 border-b border-[var(--rule)]">
          <div>
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1">
              Reference request
            </div>
            <h2 className="text-[18px] font-extrabold tracking-[-0.4px] text-ink">
              Request a reference
              {candidateName ? ` for ${candidateName}` : ""}
            </h2>
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
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <FormField
            label="Reference name"
            required
            value={name}
            onChange={setName}
            placeholder="e.g., Dr. Jordan Lee"
            disabled={pending}
            maxLength={120}
          />
          <FormField
            label="Email"
            required
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="reference@example.com"
            disabled={pending}
            maxLength={254}
          />
          <FormField
            label="Role or title"
            value={role}
            onChange={setRole}
            placeholder="e.g., Office Manager"
            disabled={pending}
            maxLength={120}
            helper="Optional — helps the reference orient when they open the email."
          />
          <FormField
            label="Relationship"
            value={relationship}
            onChange={setRelationship}
            placeholder="e.g., Direct supervisor for 3 years"
            disabled={pending}
            maxLength={240}
            helper="Optional — your team will see this on the response."
          />

          {error && (
            <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 px-3 py-2">
              {error}
            </div>
          )}

          <div className="text-[12px] text-slate-meta leading-relaxed">
            They&apos;ll get an email with a private link to a 7-question form
            (3-5 min). You&apos;ll see their answers here when they finish.
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-[var(--rule)] -mx-5 -mb-5 px-5 py-4 bg-cream/40">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase border border-[var(--rule-strong)] text-slate-body bg-white hover:bg-cream transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 bg-[#14233F] text-[#F7F4ED] px-5 py-2 text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-[#070F1C] transition-colors disabled:opacity-60"
            >
              {pending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Send request
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Decline modal — captures optional reason
 * ───────────────────────────────────────────────────────────── */

function DeclineModal({
  referenceName,
  onClose,
  onConfirm,
}: {
  referenceName: string;
  onClose: () => void;
  onConfirm: (reason: string | null) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#14233F]/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[460px] bg-white border border-[var(--rule)] shadow-xl">
        <header className="flex items-start justify-between p-5 border-b border-[var(--rule)]">
          <div>
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta mb-1">
              Mark declined
            </div>
            <h2 className="text-[16px] font-extrabold tracking-[-0.3px] text-ink">
              Mark this request as declined?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-meta hover:text-ink"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="p-5 space-y-4">
          <p className="text-[13px] text-slate-body leading-relaxed">
            <strong>{referenceName}</strong> didn&apos;t respond or isn&apos;t
            going to. The row stays in the audit trail with the status
            <strong> declined</strong>; emails stop.
          </p>
          <label className="block">
            <div className="text-[12px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1.5">
              Reason (optional)
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full border border-[var(--rule-strong)] bg-white px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-[#4D7A60]/40 resize-y"
              placeholder="e.g., No response after 2 emails"
            />
          </label>
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 bg-cream/40 border-t border-[var(--rule)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase border border-[var(--rule-strong)] text-slate-body bg-white hover:bg-cream transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim() || null)}
            className="px-5 py-2 text-[12px] font-bold tracking-[1.5px] uppercase bg-slate-700 text-white hover:bg-slate-800 transition-colors"
          >
            Mark declined
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Form field — small wrapper used inside the request modal
 * ───────────────────────────────────────────────────────────── */

function FormField({
  label,
  required,
  type = "text",
  value,
  onChange,
  placeholder,
  disabled,
  maxLength,
  helper,
}: {
  label: string;
  required?: boolean;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  helper?: string;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[12px] font-bold tracking-[1.5px] uppercase text-slate-meta">
          {label}
        </span>
        {required && (
          <span className="text-[9px] font-bold tracking-[1.5px] uppercase text-heritage-deep">
            Required
          </span>
        )}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        className="w-full border border-[var(--rule-strong)] bg-white px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-[#4D7A60]/40 disabled:bg-slate-50 disabled:cursor-not-allowed"
      />
      {helper && (
        <div className="mt-1 text-[11px] text-slate-meta leading-snug">
          {helper}
        </div>
      )}
    </label>
  );
}
