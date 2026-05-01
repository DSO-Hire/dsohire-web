import { EmployerShell } from "@/components/employer/employer-shell";
import { ComingSoon } from "@/components/employer/coming-soon";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Applications" };

export default function ApplicationsPage() {
  return (
    <EmployerShell active="applications">
      <ComingSoon
        title="Applications inbox"
        blurb="Cross-job application inbox with status tracking, candidate notes, and a kanban view of your hiring pipeline. Submitted → Reviewed → Interviewing → Offer → Hired."
        phase="Phase 2 Week 4"
      />
    </EmployerShell>
  );
}
