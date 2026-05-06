/**
 * /employer/settings/audit — Activity & audit log (Phase 4.5.e — P0).
 * Filterable audit trail with tier-graduated retention.
 */

import { ComingSoon } from "../_components/coming-soon";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Activity & audit · Settings" };

export default function AuditSettingsPage() {
  return (
    <ComingSoon
      phaseTag="Phase 4.5.e"
      title="Activity & audit log"
      description="Every meaningful action your team takes — login, role change, candidate-PII access, job mutations, stage transitions, billing events, settings changes — captured with actor, timestamp, IP, and user agent."
      bullets={[
        "Filter by user, event kind, date range",
        "Retention by tier: 7 days at Starter · 30 days at Pro/Growth · indefinite + API export at Enterprise",
        "User Access Report: one-click CSV of (name, email, role, scope, last sign-in, status)",
        "Doubles as the compliance audit trail when an Enterprise prospect asks",
      ]}
    />
  );
}
