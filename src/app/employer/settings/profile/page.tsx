/**
 * /employer/settings/profile — Public DSO profile builder (Phase 4.5.d).
 * Locked Q1: free at every tier; only custom domain stays Enterprise.
 */

import { ComingSoon } from "../_components/coming-soon";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Public profile · Settings" };

export default function PublicProfileSettingsPage() {
  return (
    <ComingSoon
      phaseTag="Phase 4.5.d"
      title="Public DSO profile"
      description="The public-facing page candidates see when they click your DSO name on a job posting. Free at every tier — only custom domains stay Enterprise."
      bullets={[
        "DSO description, mission, benefits highlight reel",
        "Banner image + photo gallery of your practices",
        "Built-in slug at /companies/[slug]; custom domain Enterprise-only",
        "SEO-optimized — indexed for candidate organic search",
      ]}
    />
  );
}
