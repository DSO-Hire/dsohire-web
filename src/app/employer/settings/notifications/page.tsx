/**
 * /employer/settings/notifications — Notification preference matrix (Phase 4.5.c).
 * Per-event, per-channel (email / in-app / both / none) granular controls.
 */

import { ComingSoon } from "../_components/coming-soon";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Notifications · Settings" };

export default function NotificationsSettingsPage() {
  return (
    <ComingSoon
      phaseTag="Phase 4.5.c"
      title="Notification preferences"
      description="Granular per-event, per-channel control. Pick where each kind of update reaches you — email, in-app bell, both, or off."
      bullets={[
        "New application submitted",
        "Candidate replied to a message",
        "Teammate @-mentioned you in a comment",
        "Stage transition (you moved a candidate)",
        "Job approaching the candidate-traffic milestone",
        "Weekly digest (Mondays)",
      ]}
    />
  );
}
