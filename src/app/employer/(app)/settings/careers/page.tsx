/**
 * /employer/settings/careers — Careers & Distribution (Job Distribution Phase 4).
 *
 * One screen to get a DSO's live roles out into the world:
 *   • their hosted careers page URL (/companies/[slug])
 *   • copy-paste embed codes (JS widget + iframe) with a live preview
 *   • per-job distribution toggle (default on; confidential/internal locked off)
 *   • the syndication feed URL + how to list on Indeed / LinkedIn
 *
 * Owner/admin only (settings.manage). Recruiters + hiring managers are
 * redirected, mirroring the affiliation settings page.
 */

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/distribution/public-jobs";
import { CareersEditor, type CareersJobRow } from "./careers-editor";

export const metadata: Metadata = { title: "Careers & Distribution · Settings" };

export const dynamic = "force-dynamic";

export default async function CareersSettingsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  if (dsoUser.role === "hiring_manager" || dsoUser.role === "recruiter") {
    redirect("/employer/dashboard");
  }

  const { data: dso } = await supabase
    .from("dsos")
    .select("name, slug")
    .eq("id", dsoUser.dso_id)
    .maybeSingle();

  const dsoName = (dso?.name as string | undefined) ?? "your DSO";
  const slug = (dso?.slug as string | undefined) ?? "";

  // Active jobs only — the surface is about what's currently live. Confidential
  // and internal_only rows are shown locked (excluded) so the rule is visible.
  const { data: jobRows } = await supabase
    .from("jobs")
    .select("id, title, confidential, visibility, distribution_enabled")
    .eq("dso_id", dsoUser.dso_id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("title", { ascending: true });

  const jobs: CareersJobRow[] = (
    (jobRows ?? []) as Array<{
      id: string;
      title: string;
      confidential: boolean | null;
      visibility: string | null;
      distribution_enabled: boolean | null;
    }>
  ).map((j) => {
    const excludedReason =
      j.confidential === true
        ? "confidential"
        : j.visibility === "internal_only"
          ? "internal"
          : null;
    return {
      id: j.id,
      title: j.title,
      distributionEnabled: j.distribution_enabled !== false,
      excludedReason,
    };
  });

  return (
    <section className="max-w-[820px]">
      <header className="mb-8">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Careers &amp; Distribution
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.8px] leading-[1.15] text-ink">
          Put {dsoName}&apos;s open roles everywhere
        </h2>
        <p className="mt-3 text-[14px] text-slate-body leading-relaxed">
          Your hosted careers page, an embeddable roles widget for your own
          website, and a syndication feed for Indeed and LinkedIn — all served
          from your live postings. Confidential and internal-only roles are
          always excluded.
        </p>
      </header>

      <CareersEditor
        slug={slug}
        dsoName={dsoName}
        siteUrl={SITE_URL}
        jobs={jobs}
      />
    </section>
  );
}
