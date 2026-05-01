import { EmployerShell } from "@/components/employer/employer-shell";
import { ComingSoon } from "@/components/employer/coming-soon";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Team" };

export default function TeamPage() {
  return (
    <EmployerShell active="team">
      <ComingSoon
        title="Team members"
        blurb="Invite recruiters, regional managers, and office managers to your DSO account. Owner-admin-recruiter roles with per-role permissions."
        phase="Phase 2 Week 2"
      />
    </EmployerShell>
  );
}
