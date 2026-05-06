import type { Metadata } from "next";
import { ComingSoonCard } from "../coming-soon-card";

export const metadata: Metadata = { title: "Privacy & visibility · Settings" };

export default function CandidatePrivacyPage() {
  return (
    <ComingSoonCard
      title="Privacy & visibility"
      description="Control who sees your profile, hide from your current employer, block specific DSOs, and toggle Practice Fit consent."
      features={[
        "Open to Work / Recruiters Only / Hidden — three-state visibility",
        "Auto-blocklist your current employer (already on by default)",
        "Block list — up to 100 specific DSOs",
        "Resume + contact info visibility separate from profile visibility",
        "View-as-DSO preview — see what an employer sees before applying",
        "Practice Fit consent — opt in / out of the matching primer",
      ]}
      alternatives={[
        { label: "Edit visibility on your profile", href: "/candidate/profile" },
        { label: "Read our privacy policy", href: "/legal/privacy" },
      ]}
    />
  );
}
