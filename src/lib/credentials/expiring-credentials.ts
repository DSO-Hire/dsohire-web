/**
 * Expiring-credentials roll-up (#9c) — cross-candidate view for a DSO.
 *
 * Surfaces licenses/certs that are expired or expiring soon for candidates
 * who are HIRED or still active in the DSO's pipeline (terminal rejected /
 * withdrawn excluded — no point alerting on people you're not hiring).
 *
 * RLS does the scoping: "DSO members read licenses of candidates who applied"
 * (current_dso_id()), so the request-scoped client only ever returns this
 * DSO's applicants' credentials. We additionally constrain to the active
 * candidate set we resolved here, and link each row to that candidate's
 * application.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  credentialExpiry,
  isActionableExpiry,
  expirySortKey,
  type CredentialExpiryState,
} from "./expiry";
import {
  LICENSE_TYPES,
  CERTIFICATION_KINDS,
  type CanonicalOption,
} from "@/lib/candidate/canonical-lists";

// Generic client type so both the request-scoped (dashboard, RLS-enforced)
// and service-role (cron) clients can call this. The query is explicitly
// DSO-scoped either way.
type Client = SupabaseClient<Database>;

const LICENSE_LABEL = new Map<string, string>(
  LICENSE_TYPES.map((o: CanonicalOption) => [o.value, o.label])
);
const CERT_LABEL = new Map<string, string>(
  CERTIFICATION_KINDS.map((o: CanonicalOption) => [o.value, o.label])
);

const TERMINAL_KINDS = new Set(["rejected", "withdrawn"]);

export interface ExpiringCredential {
  applicationId: string;
  candidateName: string;
  credentialLabel: string;
  expiresDate: string;
  expiryState: CredentialExpiryState;
  daysLeft: number;
  /** True when the candidate is already hired (vs. still in pipeline). */
  hired: boolean;
}

export async function getExpiringCredentials(
  supabase: Client,
  dsoId: string,
  limit = 6
): Promise<ExpiringCredential[]> {
  // 1) Active + hired applications for this DSO → candidate → application link.
  const { data: rawApps } = await supabase
    .from("applications")
    .select(
      "id, candidate_id, withdrawn_at, created_at, candidates!inner(full_name), stage:dso_pipeline_stages(kind), job:jobs!inner(dso_id)"
    )
    .eq("job.dso_id", dsoId)
    .order("created_at", { ascending: false });

  const apps = (rawApps ?? []) as unknown as Array<{
    id: string;
    candidate_id: string;
    withdrawn_at: string | null;
    created_at: string;
    candidates: { full_name: string | null } | Array<{ full_name: string | null }>;
    stage: { kind: string } | Array<{ kind: string }> | null;
  }>;

  // candidate_id → best (prefer hired, else most-recent active) link.
  const byCandidate = new Map<
    string,
    { applicationId: string; name: string; hired: boolean }
  >();
  for (const a of apps) {
    const stage = Array.isArray(a.stage) ? a.stage[0] : a.stage;
    const kind = stage?.kind ?? "open";
    if (a.withdrawn_at || TERMINAL_KINDS.has(kind)) continue;
    const cand = Array.isArray(a.candidates) ? a.candidates[0] : a.candidates;
    const hired = kind === "hired";
    const existing = byCandidate.get(a.candidate_id);
    // First write wins (already date-desc); upgrade to hired if we find one.
    if (!existing) {
      byCandidate.set(a.candidate_id, {
        applicationId: a.id,
        name: cand?.full_name ?? "Candidate",
        hired,
      });
    } else if (hired && !existing.hired) {
      byCandidate.set(a.candidate_id, {
        applicationId: a.id,
        name: cand?.full_name ?? existing.name,
        hired: true,
      });
    }
  }

  const candidateIds = [...byCandidate.keys()];
  if (candidateIds.length === 0) return [];

  // 2) Their dated licenses + certifications.
  const [{ data: lic }, { data: cert }] = await Promise.all([
    supabase
      .from("candidate_licenses")
      .select("candidate_id, license_type, state, expires_date")
      .in("candidate_id", candidateIds)
      .not("expires_date", "is", null),
    supabase
      .from("candidate_certifications")
      .select("candidate_id, kind, level, expires_date")
      .in("candidate_id", candidateIds)
      .not("expires_date", "is", null),
  ]);

  const out: ExpiringCredential[] = [];

  for (const l of (lic ?? []) as Array<{
    candidate_id: string;
    license_type: string;
    state: string | null;
    expires_date: string;
  }>) {
    const link = byCandidate.get(l.candidate_id);
    if (!link) continue;
    const e = credentialExpiry(l.expires_date);
    if (!isActionableExpiry(e.state) || e.daysLeft === null) continue;
    const base = LICENSE_LABEL.get(l.license_type) ?? l.license_type;
    out.push({
      applicationId: link.applicationId,
      candidateName: link.name,
      credentialLabel: l.state ? `${base} · ${l.state}` : base,
      expiresDate: l.expires_date,
      expiryState: e.state,
      daysLeft: e.daysLeft,
      hired: link.hired,
    });
  }

  for (const c of (cert ?? []) as Array<{
    candidate_id: string;
    kind: string;
    level: string | null;
    expires_date: string;
  }>) {
    const link = byCandidate.get(c.candidate_id);
    if (!link) continue;
    const e = credentialExpiry(c.expires_date);
    if (!isActionableExpiry(e.state) || e.daysLeft === null) continue;
    const base = CERT_LABEL.get(c.kind) ?? c.kind;
    out.push({
      applicationId: link.applicationId,
      candidateName: link.name,
      credentialLabel: c.level ? `${base} · ${c.level}` : base,
      expiresDate: c.expires_date,
      expiryState: e.state,
      daysLeft: e.daysLeft,
      hired: link.hired,
    });
  }

  out.sort((a, b) => expirySortKey(a.daysLeft) - expirySortKey(b.daysLeft));
  return out.slice(0, limit);
}
