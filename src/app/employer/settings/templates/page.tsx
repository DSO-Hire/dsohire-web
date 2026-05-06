/**
 * /employer/settings/templates — Email template editor (Phase 4.5.f).
 * Locked Q4: ship this sprint (~3 days, Tiptap exists).
 */

import { ComingSoon } from "../_components/coming-soon";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Email templates · Settings" };

export default function EmailTemplatesSettingsPage() {
  return (
    <ComingSoon
      phaseTag="Phase 4.5.f"
      title="Email templates"
      description="Edit the canned messages your team sends to candidates — first-touch, screening invite, interview confirmation, offer, polite decline. Tiptap-edited with merge tags ({{candidate_name}}, {{job_title}}, {{interview_link}})."
      bullets={[
        "Per-DSO templates override DSO Hire defaults",
        "Per-job overrides for any template",
        "Send-test-to-myself before saving",
        "Variable picker with autocomplete + validation",
        "Plain-text + HTML versions kept in sync",
      ]}
    />
  );
}
