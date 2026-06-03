/**
 * N12 Phase 3 — offer "what changed" diff (pure, shared by the application
 * detail OfferSection [client] and the approvals queue [server]).
 *
 * Compares the structured base + the key offer terms between an offer and
 * the one it supersedes (revised_from). Returns only the fields that differ.
 */

export interface OfferDiffSnapshot {
  base_amount: number | null;
  base_period: "hourly" | "annual" | null;
  merge_values: Record<string, string> | null;
}

export interface OfferChange {
  label: string;
  from: string;
  to: string;
}

/** Pretty "$72/hr" / "$165,000/yr" label for a structured base, or null. */
export function formatOfferBase(
  amount: number | null,
  period: "hourly" | "annual" | null
): string | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  const pretty =
    amount % 1 === 0
      ? amount.toLocaleString("en-US")
      : amount.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  return `$${pretty}/${period === "annual" ? "yr" : "hr"}`;
}

const DIFF_FIELDS: ReadonlyArray<[key: string, label: string]> = [
  ["offer.compensation", "Compensation details"],
  ["offer.signing_bonus", "Signing bonus"],
  ["offer.start_date", "Start date"],
  ["offer.deadline_to_accept", "Response deadline"],
  ["offer.reporting_to", "Reporting to"],
  ["offer.benefits_summary", "Benefits"],
];

export function diffOffers(
  prev: OfferDiffSnapshot,
  curr: OfferDiffSnapshot
): OfferChange[] {
  const changes: OfferChange[] = [];
  const baseFrom = formatOfferBase(prev.base_amount, prev.base_period) ?? "—";
  const baseTo = formatOfferBase(curr.base_amount, curr.base_period) ?? "—";
  if (baseFrom !== baseTo) changes.push({ label: "Base pay", from: baseFrom, to: baseTo });
  for (const [key, label] of DIFF_FIELDS) {
    const from = (prev.merge_values?.[key] ?? "").trim();
    const to = (curr.merge_values?.[key] ?? "").trim();
    if (from !== to) changes.push({ label, from: from || "—", to: to || "—" });
  }
  return changes;
}
