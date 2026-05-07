/**
 * /employer/talent-pool — proactive sourcing surface (Phase 5A — stub at 4.6).
 *
 * Placeholder until Phase 5A's "search candidates → save to talent pool →
 * outreach campaigns" loop ships. Lives in the rail today so the IA is
 * visible to prospects and Cam doesn't have to remember to add it later.
 */

import type { Metadata } from "next";
import { EmployerShell } from "@/components/employer/employer-shell";
import { ComingSoon } from "../settings/_components/coming-soon";

export const metadata: Metadata = { title: "Talent Pool" };

export default function TalentPoolPage() {
  return (
    <EmployerShell active="talent-pool">
      <div className="space-y-6 max-w-[820px]">
        <header>
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
            Talent Pool
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.8px] text-ink leading-tight">
            Proactive sourcing for roles you haven&apos;t posted yet.
          </h1>
        </header>
        <ComingSoon
          phaseTag="Phase 5A"
          title="Search the candidate database, save to lists, run outreach"
          description="The flip side of the job board: search active and passive candidates, save them to named pools, and run nurture campaigns when a fit role opens. Pulls from every candidate who applied to your DSO + opt-in candidates from across the platform."
          bullets={[
            "Search by role, specialty, license state, years of experience, PMS familiarity",
            "Save searches as live pools that auto-update",
            "1-click outreach using your custom email templates (4.5.f)",
            "Talent CRM view: notes, tags, last contacted, status",
          ]}
        />
      </div>
    </EmployerShell>
  );
}
