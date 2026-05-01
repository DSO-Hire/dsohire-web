import { EmployerShell } from "@/components/employer/employer-shell";
import { ComingSoon } from "@/components/employer/coming-soon";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <EmployerShell active="settings">
      <ComingSoon
        title="DSO settings"
        blurb="Edit your DSO profile (name, slug, logo, description, public branding) that candidates see at /companies/[slug]. Slug changes auto-create 301 redirects from the old URL."
        phase="Phase 2 Week 2"
      />
    </EmployerShell>
  );
}
