/**
 * Credential expiry engine — single source of truth for #9 alerting.
 *
 * Buckets a credential's `expires_date` into expired / imminent (<30d) /
 * soon (<60d) / ok / none, with a signed `daysLeft`. Framework-agnostic
 * (no JSX) so it's shared by:
 *   - the per-hire readiness checklist + dashboard roll-up (server)
 *   - the credential-expiry email digest cron
 *   - the candidate credentials card
 *
 * The employer application-detail CredentialsSection has its own richer
 * pill/icon variant (computeExpiryState) — it predates this and uses the
 * SAME thresholds, so all surfaces agree on what "expiring" means. Keep the
 * day thresholds here authoritative if they ever change.
 */

export const EXPIRY_IMMINENT_DAYS = 30;
export const EXPIRY_SOON_DAYS = 60;

export type CredentialExpiryState =
  | "none" // no date on file
  | "ok" // > SOON days out
  | "expiring_soon" // within SOON (but not imminent)
  | "expiring_imminent" // within IMMINENT
  | "expired";

export interface CredentialExpiry {
  state: CredentialExpiryState;
  /** Whole days until expiry; negative = already expired; null = no date. */
  daysLeft: number | null;
  /** Short human label, e.g. "Expires in 12 days" / "Expired 4 days ago". */
  label: string;
}

/** Parse a YYYY-MM-DD (or ISO) string as local midnight — avoids UTC drift. */
function parseLocalDate(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export function daysUntil(expiresDate: string | null | undefined): number | null {
  if (!expiresDate) return null;
  const target = parseLocalDate(expiresDate);
  if (!target) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function credentialExpiry(
  expiresDate: string | null | undefined
): CredentialExpiry {
  const days = daysUntil(expiresDate);
  if (days === null) {
    return { state: "none", daysLeft: null, label: "No expiry on file" };
  }
  if (days < 0) {
    const ago = Math.abs(days);
    return {
      state: "expired",
      daysLeft: days,
      label: `Expired ${ago} day${ago === 1 ? "" : "s"} ago`,
    };
  }
  if (days < EXPIRY_IMMINENT_DAYS) {
    return {
      state: "expiring_imminent",
      daysLeft: days,
      label: days === 0 ? "Expires today" : `Expires in ${days} day${days === 1 ? "" : "s"}`,
    };
  }
  if (days < EXPIRY_SOON_DAYS) {
    return {
      state: "expiring_soon",
      daysLeft: days,
      label: `Expires in ${days} days`,
    };
  }
  return { state: "ok", daysLeft: days, label: "Current" };
}

/** Expired or within SOON window — the set worth surfacing/flagging. */
export function isActionableExpiry(state: CredentialExpiryState): boolean {
  return (
    state === "expired" ||
    state === "expiring_imminent" ||
    state === "expiring_soon"
  );
}

/** Urgent set for the email digest — expired or within IMMINENT window. */
export function isUrgentExpiry(state: CredentialExpiryState): boolean {
  return state === "expired" || state === "expiring_imminent";
}

/** Sort key: most urgent first (expired, then soonest). null-date sorts last. */
export function expirySortKey(daysLeft: number | null): number {
  return daysLeft === null ? Number.POSITIVE_INFINITY : daysLeft;
}
