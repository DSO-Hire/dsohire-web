"use client";

/**
 * <CredentialsSection> — employer-side view of the candidate's licenses +
 * certifications (Phase 5B v1).
 *
 * Renders inside the Internal Workspace block on
 * /employer/applications/[id]. Two stacked subsections — Licenses and
 * Certifications — both with a per-row expiry pill, a verification
 * badge, a document-download chip, and a Mark verified / Mark expired /
 * Mark unverified pill row that swaps based on the current
 * verification_status.
 *
 * Privacy:
 *   • license_number is NEVER rendered when display_number=false on the
 *     row. The toggle is the candidate's opt-in; we honor it on the
 *     employer surface.
 *
 * Realtime:
 *   • This component is purely server-fetch + optimistic local state
 *     after an action. There's no realtime subscription because the
 *     verification status is employer-driven — the same DSO updates
 *     it; cross-tab consistency isn't a v1 must-have.
 */

import { useState, useTransition } from "react";
import {
  ShieldCheck,
  Clock,
  AlertTriangle,
  FileText,
  Paperclip,
  Eye,
  Loader2,
  CheckCircle2,
  Undo2,
} from "lucide-react";
import {
  LICENSE_TYPES,
  CERTIFICATION_KINDS,
  type CanonicalOption,
} from "@/lib/candidate/canonical-lists";
import {
  verifyCredential,
  unverifyCredential,
  markCredentialExpired,
  getEmployerCredentialSignedUrl,
} from "./credential-actions";

/* ───────────────────────────────────────────────────────────────
 * Public types
 * ───────────────────────────────────────────────────────────── */

export interface CredentialLicenseRow {
  id: string;
  license_type: string;
  license_number: string | null;
  state: string | null;
  issued_date: string | null;
  expires_date: string | null;
  display_number: boolean;
  document_path: string | null;
  verification_status: string;
  verified_at: string | null;
}

export interface CredentialCertificationRow {
  id: string;
  kind: string;
  level: string | null;
  issued_date: string | null;
  expires_date: string | null;
  document_path: string | null;
  verification_status: string;
  verified_at: string | null;
}

interface CredentialsSectionProps {
  applicationId: string;
  licenses: CredentialLicenseRow[];
  certifications: CredentialCertificationRow[];
}

/* ───────────────────────────────────────────────────────────────
 * Helpers — labels + expiry coloring
 * ───────────────────────────────────────────────────────────── */

const LICENSE_LABEL = new Map<string, string>(
  LICENSE_TYPES.map((o: CanonicalOption) => [o.value, o.label])
);
const CERTIFICATION_LABEL = new Map<string, string>(
  CERTIFICATION_KINDS.map((o: CanonicalOption) => [o.value, o.label])
);

function licenseLabel(value: string): string {
  return LICENSE_LABEL.get(value) ?? value;
}
function certificationLabel(value: string): string {
  return CERTIFICATION_LABEL.get(value) ?? value;
}

function formatShortDate(iso: string | null): string | null {
  if (!iso) return null;
  // Parse as a calendar date (no TZ shift). For YYYY-MM-DD values we
  // construct a local Date to avoid the "off by one" bug from UTC parsing.
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface ExpiryState {
  kind: "no_date" | "future_far" | "future_soon" | "future_imminent" | "expired";
  label: string;
  pillClass: string;
  IconComp: React.ComponentType<{ className?: string }>;
}

function computeExpiryState(expires: string | null): ExpiryState {
  if (!expires) {
    return {
      kind: "no_date",
      label: "No expiry on file",
      pillClass:
        "bg-muted text-slate-meta ring-1 ring-inset ring-border",
      IconComp: Clock,
    };
  }
  // Parse YYYY-MM-DD as local-midnight (avoid UTC drift).
  const m = expires.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const target = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(expires);
  if (isNaN(target.getTime())) {
    return {
      kind: "no_date",
      label: "Expiry unknown",
      pillClass:
        "bg-muted text-slate-meta ring-1 ring-inset ring-border",
      IconComp: Clock,
    };
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  const labelDate = formatShortDate(expires) ?? expires;

  if (days < 0) {
    const ago = Math.abs(days);
    return {
      kind: "expired",
      label: `Expired ${ago} day${ago === 1 ? "" : "s"} ago · ${labelDate}`,
      pillClass:
        "bg-danger-bg text-danger ring-1 ring-inset ring-danger",
      IconComp: AlertTriangle,
    };
  }
  if (days < 30) {
    return {
      kind: "future_imminent",
      label: `Expires in ${days} day${days === 1 ? "" : "s"} · ${labelDate}`,
      pillClass:
        "bg-danger-bg text-danger ring-1 ring-inset ring-danger",
      IconComp: AlertTriangle,
    };
  }
  if (days < 60) {
    return {
      kind: "future_soon",
      label: `Expires in ${days} days · ${labelDate}`,
      pillClass:
        "bg-warning-bg text-warning ring-1 ring-inset ring-warning",
      IconComp: Clock,
    };
  }
  return {
    kind: "future_far",
    label: `Expires ${labelDate}`,
    pillClass:
      "bg-success-bg text-success ring-1 ring-inset ring-success",
    IconComp: ShieldCheck,
  };
}

interface StatusBadge {
  label: string;
  pillClass: string;
  IconComp: React.ComponentType<{ className?: string }>;
}

function statusBadge(
  verification_status: string,
  verified_at: string | null
): StatusBadge | null {
  switch (verification_status) {
    case "verified": {
      const when = formatShortDate(verified_at);
      return {
        label: when ? `Verified · ${when}` : "Verified",
        pillClass:
          "bg-success-bg text-success ring-1 ring-inset ring-success",
        IconComp: ShieldCheck,
      };
    }
    case "pending":
      return {
        label: "Pending verification",
        pillClass:
          "bg-warning-bg text-warning ring-1 ring-inset ring-warning",
        IconComp: Clock,
      };
    case "expired":
      return {
        label: "Marked expired",
        pillClass:
          "bg-danger-bg text-danger ring-1 ring-inset ring-danger",
        IconComp: AlertTriangle,
      };
    case "revoked":
      return {
        label: "Revoked",
        pillClass:
          "bg-danger-bg text-danger ring-1 ring-inset ring-danger",
        IconComp: AlertTriangle,
      };
    case "unverified":
    default:
      return null;
  }
}

/* ───────────────────────────────────────────────────────────────
 * Main component
 * ───────────────────────────────────────────────────────────── */

export function CredentialsSection({
  applicationId,
  licenses,
  certifications,
}: CredentialsSectionProps) {
  const isEmpty = licenses.length === 0 && certifications.length === 0;

  return (
    <div className="border border-[var(--rule)] bg-card">
      {isEmpty ? (
        <EmptyState />
      ) : (
        <div className="divide-y divide-[var(--rule)]">
          <CredentialGroup
            title="Licenses"
            count={licenses.length}
            emptyCopy="No licenses on file."
          >
            {licenses.map((row) => (
              <LicenseRow
                key={row.id}
                applicationId={applicationId}
                row={row}
              />
            ))}
          </CredentialGroup>
          <CredentialGroup
            title="Certifications"
            count={certifications.length}
            emptyCopy="No certifications on file."
          >
            {certifications.map((row) => (
              <CertificationRow
                key={row.id}
                applicationId={applicationId}
                row={row}
              />
            ))}
          </CredentialGroup>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="p-8 text-center">
      <ShieldCheck className="h-6 w-6 text-slate-meta mx-auto mb-3" />
      <p className="text-[14px] font-semibold text-ink mb-1">
        No credentials on file yet
      </p>
      <p className="text-[13px] text-slate-body max-w-[420px] mx-auto leading-relaxed">
        This candidate hasn&apos;t added any licenses or certifications.
        Most DSOs want at least the active state license + CPR/BLS on
        file before extending an offer — consider asking the candidate
        to update their profile via the Messages section above.
      </p>
    </div>
  );
}

function CredentialGroup({
  title,
  count,
  emptyCopy,
  children,
}: {
  title: string;
  count: number;
  emptyCopy: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="px-5 py-3 bg-cream/40 border-b border-[var(--rule)] flex items-center justify-between">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-foreground">
          {title}
        </div>
        <div className="text-[11px] font-bold text-slate-meta">
          {count} on file
        </div>
      </div>
      {count === 0 ? (
        <p className="px-5 py-6 text-[13px] text-slate-meta italic">
          {emptyCopy}
        </p>
      ) : (
        <div className="divide-y divide-[var(--rule)]">{children}</div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * License row
 * ───────────────────────────────────────────────────────────── */

function LicenseRow({
  applicationId,
  row,
}: {
  applicationId: string;
  row: CredentialLicenseRow;
}) {
  const [verificationStatus, setVerificationStatus] = useState<string>(
    row.verification_status
  );
  const [verifiedAt, setVerifiedAt] = useState<string | null>(row.verified_at);

  const number =
    row.display_number && row.license_number
      ? row.license_number
      : row.license_number
        ? "Hidden by candidate"
        : null;

  // Primary headline = license type label.
  const heading = licenseLabel(row.license_type);
  // Subtitle line — state + number (or hidden hint).
  const subParts: string[] = [];
  if (row.state) subParts.push(row.state);
  if (number) subParts.push(number);
  const subtitle = subParts.join(" · ");

  return (
    <CredentialRowShell
      kind="license"
      applicationId={applicationId}
      rowId={row.id}
      heading={heading}
      subtitle={subtitle || null}
      expiresDate={row.expires_date}
      issuedDate={row.issued_date}
      verificationStatus={verificationStatus}
      verifiedAt={verifiedAt}
      documentPath={row.document_path}
      onStatusChange={(next, when) => {
        setVerificationStatus(next);
        setVerifiedAt(when);
      }}
    />
  );
}

/* ───────────────────────────────────────────────────────────────
 * Certification row
 * ───────────────────────────────────────────────────────────── */

function CertificationRow({
  applicationId,
  row,
}: {
  applicationId: string;
  row: CredentialCertificationRow;
}) {
  const [verificationStatus, setVerificationStatus] = useState<string>(
    row.verification_status
  );
  const [verifiedAt, setVerifiedAt] = useState<string | null>(row.verified_at);

  const heading = certificationLabel(row.kind);
  const subtitle = row.level ? row.level : null;

  return (
    <CredentialRowShell
      kind="certification"
      applicationId={applicationId}
      rowId={row.id}
      heading={heading}
      subtitle={subtitle}
      expiresDate={row.expires_date}
      issuedDate={row.issued_date}
      verificationStatus={verificationStatus}
      verifiedAt={verifiedAt}
      documentPath={row.document_path}
      onStatusChange={(next, when) => {
        setVerificationStatus(next);
        setVerifiedAt(when);
      }}
    />
  );
}

/* ───────────────────────────────────────────────────────────────
 * Shared row shell — actions + presentation
 * ───────────────────────────────────────────────────────────── */

function CredentialRowShell({
  kind,
  applicationId,
  rowId,
  heading,
  subtitle,
  expiresDate,
  issuedDate,
  verificationStatus,
  verifiedAt,
  documentPath,
  onStatusChange,
}: {
  kind: "license" | "certification";
  applicationId: string;
  rowId: string;
  heading: string;
  subtitle: string | null;
  expiresDate: string | null;
  issuedDate: string | null;
  verificationStatus: string;
  verifiedAt: string | null;
  documentPath: string | null;
  onStatusChange: (next: string, when: string | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [docPending, setDocPending] = useState(false);

  const expiry = computeExpiryState(expiresDate);
  const badge = statusBadge(verificationStatus, verifiedAt);

  function runAction(action: () => Promise<{ ok: true } | { ok: false; error: string }>, optimisticStatus: string, optimisticAt: string | null) {
    setError(null);
    // Optimistic local update; rolled back on failure.
    const prevStatus = verificationStatus;
    const prevAt = verifiedAt;
    onStatusChange(optimisticStatus, optimisticAt);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        onStatusChange(prevStatus, prevAt);
        setError(result.error);
      }
    });
  }

  async function openDocument() {
    if (!documentPath) return;
    setError(null);
    setDocPending(true);
    try {
      const result = await getEmployerCredentialSignedUrl(
        kind,
        rowId,
        applicationId
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Open in a new tab. Popup blockers can interfere — surface a
      // gentle fallback link if window.open returns null.
      const win = window.open(result.url, "_blank", "noopener,noreferrer");
      if (!win) {
        setError(
          "Your browser blocked the popup. Allow popups for dsohire.com to view documents."
        );
      }
    } finally {
      setDocPending(false);
    }
  }

  const ExpiryIcon = expiry.IconComp;
  const BadgeIcon = badge?.IconComp ?? ShieldCheck;

  return (
    // Anchor target — the Verifications section's "Linked proof" entries
    // deep-link here via #credential-${rowId}. scroll-mt keeps the row
    // clear of any sticky chrome when jumped to.
    <div id={`credential-${rowId}`} className="p-5 scroll-mt-24">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-ink leading-snug">
            {heading}
          </div>
          {subtitle && (
            <div className="text-[12px] text-slate-body mt-0.5">{subtitle}</div>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 mt-3">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold ${expiry.pillClass}`}
            >
              <ExpiryIcon className="h-3 w-3" />
              {expiry.label}
            </span>
            {issuedDate && (
              <span className="text-[11px] text-slate-meta">
                Issued {formatShortDate(issuedDate)}
              </span>
            )}
            {badge && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold ${badge.pillClass}`}
              >
                <BadgeIcon className="h-3 w-3" />
                {badge.label}
              </span>
            )}
          </div>
        </div>

        {/* Right column: document chip + action pills */}
        <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
          {documentPath ? (
            <button
              type="button"
              onClick={openDocument}
              disabled={docPending}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold tracking-[1.5px] uppercase border border-[var(--rule-strong)] text-foreground bg-card hover:bg-cream transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {docPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
              <FileText className="h-3 w-3" />
              View document
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-meta">
              <Paperclip className="h-3 w-3" />
              No document attached
            </span>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {verificationStatus !== "verified" && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  runAction(
                    () => verifyCredential(kind, rowId, applicationId),
                    "verified",
                    new Date().toISOString()
                  )
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-[1.5px] uppercase bg-heritage text-primary-foreground hover:bg-heritage-deep transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {pending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                Mark verified
              </button>
            )}
            {verificationStatus === "verified" && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  runAction(
                    () => unverifyCredential(kind, rowId, applicationId),
                    "unverified",
                    null
                  )
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-[1.5px] uppercase border border-[var(--rule-strong)] text-slate-body bg-card hover:bg-cream transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {pending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Undo2 className="h-3 w-3" />
                )}
                Mark unverified
              </button>
            )}
            {verificationStatus !== "expired" && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  runAction(
                    () => markCredentialExpired(kind, rowId, applicationId),
                    "expired",
                    verifiedAt
                  )
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-[1.5px] uppercase border border-danger text-danger bg-card hover:bg-danger-bg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {pending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <AlertTriangle className="h-3 w-3" />
                )}
                Mark expired
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-3 text-[12px] text-danger bg-danger-bg border border-danger px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
