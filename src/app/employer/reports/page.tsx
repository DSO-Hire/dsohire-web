/**
 * /employer/reports — analytics + Annual Hiring Report (Phase 5C — stub at 4.6).
 *
 * Placeholder until Phase 5C ships time-to-hire, source attribution,
 * salary benchmarks, and the public Annual Hiring Report (locked feature
 * for DentalPost parity per project_dentalpost_parity_pre_launch.md).
 */

import type { Metadata } from "next";
import { EmployerShell } from "@/components/employer/employer-shell";
import { ComingSoon } from "../settings/_components/coming-soon";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <EmployerShell active="reports">
      <div className="space-y-6 max-w-[820px]">
        <header>
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
            Reports
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.8px] text-ink leading-tight">
            Hiring metrics that justify the budget.
          </h1>
        </header>
        <ComingSoon
          phaseTag="Phase 5C"
          title="Time-to-hire, source attribution, salary benchmarks, Annual Hiring Report"
          description="Operator-grade analytics: how long roles sit open, where your hires actually came from, how your comp stacks against the market, and a public Annual Hiring Report that drives SEO + thought leadership."
          bullets={[
            "Time-to-fill by role, location, recruiter",
            "Source attribution (where applications come from)",
            "Salary benchmarks against aggregate platform data",
            "Per-location dashboards (Growth+ tier)",
            "Public Annual Hiring Report — DentalPost-parity differentiator",
          ]}
        />
      </div>
    </EmployerShell>
  );
}
