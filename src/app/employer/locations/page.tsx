import { EmployerShell } from "@/components/employer/employer-shell";
import { ComingSoon } from "@/components/employer/coming-soon";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Locations" };

export default function LocationsPage() {
  return (
    <EmployerShell active="locations">
      <ComingSoon
        title="Practice locations"
        blurb="Add, edit, and remove practice locations. Tag jobs to specific offices in one flow. Map view of your DSO footprint."
        phase="Phase 2 Week 2 (later this week)"
      />
    </EmployerShell>
  );
}
