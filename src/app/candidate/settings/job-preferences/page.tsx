import type { Metadata } from "next";
import { ComingSoonCard } from "../coming-soon-card";

export const metadata: Metadata = { title: "Job preferences · Settings" };

export default function CandidateJobPreferencesPage() {
  return (
    <ComingSoonCard
      title="Job preferences"
      description="Roles, specialty, license states, locations + radius, DSO size, schedule, salary range, willing-to-relocate, temp/perm — all in one place."
      features={[
        "Multi-state license preferences for traveling clinicians",
        "Per-location radius (different willingness to commute per city)",
        "DSO size preference (boutique vs. multi-state)",
        "Day + evening availability per weekday",
      ]}
      alternatives={[
        { label: "Edit Job Preferences on your profile", href: "/candidate/profile" },
      ]}
    />
  );
}
