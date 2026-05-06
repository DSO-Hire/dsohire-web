/**
 * /employer/settings/compliance — Compliance hub (Growth+ tier-gated).
 * Bundles CE Status & Renewals, EEO/OFCCP, Practice Fit configuration,
 * and the audit pack PDF export.
 */

import { ComingSoon } from "../_components/coming-soon";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Compliance · Settings" };

export default function ComplianceSettingsPage() {
  return (
    <ComingSoon
      phaseTag="Phase 4.5 + 5D"
      title="Compliance"
      description="The dental-ops compliance surface no generic ATS has. Growth+ tier-gated; lower tiers see the section name with a locked-tooltip preview of what's behind it."
      bullets={[
        "CE status & renewals — track every team member's continuing-ed hours against state requirements",
        "EEO/OFCCP toggle — one-click voluntary self-ID disclosure on the apply form",
        "Practice Fit configuration — calibrate the DISC-derived match weights to your culture (lands with Phase 5D)",
        "Audit pack PDF — one-click export of every hiring-related event for a date range",
      ]}
    />
  );
}
