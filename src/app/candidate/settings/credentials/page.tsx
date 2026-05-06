import type { Metadata } from "next";
import { ComingSoonCard } from "../coming-soon-card";

export const metadata: Metadata = { title: "Credentials · Settings" };

export default function CandidateCredentialsPage() {
  return (
    <ComingSoonCard
      title="Credentials"
      description="The dental-ops tab no other job board has. Track your licenses, CE compliance, certifications, and saved searches in one place."
      features={[
        "License expiry tracking with 60/30/14-day reminders",
        "CE tracking — upload certificates, check state-specific requirements",
        "Certifications: CPR/BLS, anesthesia, nitrous, sedation",
        "Saved job searches with email/instant alerts when matches land",
      ]}
      alternatives={[
        { label: "Add licenses + certifications on your profile", href: "/candidate/profile" },
      ]}
    />
  );
}
