/**
 * <HireReadinessChecklist> — #9 per-hire onboarding readiness.
 *
 * Consolidates, for a candidate on the offer/hired stage, the three things a
 * DSO must clear before someone starts:
 *   1. Required verifications attested (job_verification_requirements ×
 *      application_verifications).
 *   2. Credentials marked verified by the team.
 *   3. No expired / imminently-expiring credentials.
 *
 * Pure presentational server component — no client state. The actionable
 * controls (Mark verified, attestation) live in the sections below; this is
 * the at-a-glance "are we ready?" summary that sits on top.
 */

import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  Clock,
  ShieldCheck,
} from "lucide-react";
import {
  LICENSE_TYPES,
  CERTIFICATION_KINDS,
  type CanonicalOption,
} from "@/lib/candidate/canonical-lists";
import {
  credentialExpiry,
  isActionableExpiry,
  type CredentialExpiryState,
} from "@/lib/credentials/expiry";

const LICENSE_LABEL = new Map<string, string>(
  LICENSE_TYPES.map((o: CanonicalOption) => [o.value, o.label])
);
const CERT_LABEL = new Map<string, string>(
  CERTIFICATION_KINDS.map((o: CanonicalOption) => [o.value, o.label])
);

export interface ReadinessVerification {
  label: string;
  required: boolean;
  attested: boolean;
}

interface CredInput {
  expires_date: string | null;
  verification_status: string;
}
export interface ReadinessLicense extends CredInput {
  license_type: string;
  state: string | null;
}
export interface ReadinessCertification extends CredInput {
  kind: string;
  level: string | null;
}

interface CredRow {
  label: string;
  verified: boolean;
  expiryState: CredentialExpiryState;
  expiryLabel: string;
}

function expiryPill(state: CredentialExpiryState): string {
  switch (state) {
    case "expired":
      return "bg-red-50 text-red-800 ring-1 ring-inset ring-red-300";
    case "expiring_imminent":
      return "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200";
    case "expiring_soon":
      return "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200";
    default:
      return "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200";
  }
}

export function HireReadinessChecklist({
  verifications,
  licenses,
  certifications,
}: {
  verifications: ReadinessVerification[];
  licenses: ReadinessLicense[];
  certifications: ReadinessCertification[];
}) {
  const credentials: CredRow[] = [
    ...licenses.map((l) => {
      const e = credentialExpiry(l.expires_date);
      const base = LICENSE_LABEL.get(l.license_type) ?? l.license_type;
      return {
        label: l.state ? `${base} · ${l.state}` : base,
        verified: l.verification_status === "verified",
        expiryState: e.state,
        expiryLabel: e.label,
      };
    }),
    ...certifications.map((c) => {
      const e = credentialExpiry(c.expires_date);
      const base = CERT_LABEL.get(c.kind) ?? c.kind;
      return {
        label: c.level ? `${base} · ${c.level}` : base,
        verified: c.verification_status === "verified",
        expiryState: e.state,
        expiryLabel: e.label,
      };
    }),
  ];

  const requiredVerifs = verifications.filter((v) => v.required);
  const verifsOutstanding = requiredVerifs.filter((v) => !v.attested);
  const expiredCount = credentials.filter(
    (c) => c.expiryState === "expired"
  ).length;
  const expiringCreds = credentials.filter((c) =>
    isActionableExpiry(c.expiryState)
  );
  const unverifiedCreds = credentials.filter((c) => !c.verified);

  const attention =
    verifsOutstanding.length + expiredCount;
  const ready = attention === 0;

  // Nothing to track at all → render nothing (caller also gates, but be safe).
  if (verifications.length === 0 && credentials.length === 0) return null;

  return (
    <div className="border border-[var(--rule)] bg-white">
      {/* Summary banner */}
      <div
        className={`flex items-center gap-3 px-5 py-4 border-b border-[var(--rule)] ${
          ready ? "bg-emerald-50/60" : "bg-amber-50/50"
        }`}
      >
        {ready ? (
          <ShieldCheck className="h-5 w-5 text-emerald-700 shrink-0" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0" />
        )}
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-ink">
            {ready
              ? "Ready to hire — all checks clear"
              : `${attention} item${attention === 1 ? "" : "s"} need attention before start`}
          </div>
          <div className="text-[12px] text-slate-body mt-0.5">
            {requiredVerifs.length > 0 && (
              <>
                {requiredVerifs.length - verifsOutstanding.length}/
                {requiredVerifs.length} required verifications attested
              </>
            )}
            {requiredVerifs.length > 0 && credentials.length > 0 && " · "}
            {credentials.length > 0 && (
              <>
                {credentials.length - unverifiedCreds.length}/
                {credentials.length} credentials verified
                {expiredCount > 0 && ` · ${expiredCount} expired`}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="divide-y divide-[var(--rule)]">
        {/* Required verifications */}
        {requiredVerifs.length > 0 && (
          <div className="px-5 py-4">
            <div className="text-[10px] font-bold tracking-[2px] uppercase text-[#14233F] mb-3">
              Required verifications
            </div>
            <ul className="space-y-2">
              {requiredVerifs.map((v) => (
                <li key={v.label} className="flex items-center gap-2.5 text-[13px]">
                  {v.attested ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-amber-500 shrink-0" />
                  )}
                  <span className={v.attested ? "text-ink" : "text-amber-800 font-semibold"}>
                    {v.label}
                  </span>
                  {!v.attested && (
                    <span className="text-[11px] text-amber-700">— not yet attested</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Credentials + expiry */}
        {credentials.length > 0 && (
          <div className="px-5 py-4">
            <div className="text-[10px] font-bold tracking-[2px] uppercase text-[#14233F] mb-3">
              Credentials on file
            </div>
            <ul className="space-y-2.5">
              {credentials.map((c, i) => (
                <li
                  key={`${c.label}-${i}`}
                  className="flex flex-wrap items-center gap-2 text-[13px]"
                >
                  {c.verified ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-slate-400 shrink-0" />
                  )}
                  <span className="text-ink">{c.label}</span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold ${expiryPill(c.expiryState)}`}
                  >
                    {c.expiryState === "expired" ||
                    c.expiryState === "expiring_imminent" ? (
                      <AlertTriangle className="h-3 w-3" />
                    ) : c.expiryState === "expiring_soon" ? (
                      <Clock className="h-3 w-3" />
                    ) : (
                      <ShieldCheck className="h-3 w-3" />
                    )}
                    {c.expiryLabel}
                  </span>
                  {!c.verified && (
                    <span className="text-[11px] text-slate-meta">— verify below</span>
                  )}
                </li>
              ))}
            </ul>
            {expiringCreds.length > 0 && (
              <p className="mt-3 text-[12px] text-amber-800 leading-snug">
                {expiringCreds.length} credential
                {expiringCreds.length === 1 ? "" : "s"} expired or expiring soon —
                ask {`the candidate`} to upload a current copy before their start date.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
