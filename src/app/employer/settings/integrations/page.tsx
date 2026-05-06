/**
 * /employer/settings/integrations — placeholder for the integrations
 * surface that lands across multiple phases. Calendar (Phase 5C), PMS
 * connectors (Phase 6+), webhooks + API (Enterprise trigger). Keeping
 * the surface visible now even before the first integration ships
 * makes the roadmap legible to demo prospects.
 */

import { ComingSoon } from "../_components/coming-soon";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Integrations · Settings" };

export default function IntegrationsSettingsPage() {
  return (
    <ComingSoon
      phaseTag="Phase 5C+"
      title="Integrations"
      description="Connect DSO Hire to the rest of your stack. Each connector keeps the data flowing one direction with idempotent writes — no double-entry, no surprises."
      bullets={[
        "Calendar (Google Calendar / Microsoft 365) — interview scheduling auto-blocks",
        "PMS systems — Phase 6+ roadmap; pulled forward when first paying customer signs",
        "Webhooks — outbound POSTs on application + stage events (Pro+)",
        "API tokens — read/write REST endpoints (Enterprise tier)",
      ]}
    />
  );
}
