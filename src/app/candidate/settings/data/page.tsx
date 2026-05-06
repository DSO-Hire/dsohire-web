import type { Metadata } from "next";
import { ComingSoonCard } from "../coming-soon-card";

export const metadata: Metadata = { title: "Data & account · Settings" };

export default function CandidateDataPage() {
  return (
    <ComingSoonCard
      title="Data & account"
      description="Download a copy of your data, withdraw active applications, or delete your account."
      features={[
        "Download my data — async ZIP delivered by email, valid 24 hours",
        "Application history — quick link to /candidate/applications",
        "Withdraw applications — bulk withdraw any actives in one click",
        "Delete account — 30-day soft-delete grace period before hard delete",
      ]}
      alternatives={[
        { label: "View your applications", href: "/candidate/applications" },
        { label: "Email cam@dsohire.com to request deletion now", href: "mailto:cam@dsohire.com?subject=Delete%20my%20DSO%20Hire%20account" },
      ]}
    />
  );
}
