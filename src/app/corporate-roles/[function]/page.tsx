/**
 * /corporate-roles/[function] — landing page per 5G.c (2026-05-13).
 *
 * SEO play. Each of the 12 corporate functions gets its own URL with
 * a hero, sub-role list, and a live feed of open corporate jobs at any
 * DSO matching that function. Static path generation means
 * the routes pre-render at build time and serve fast.
 *
 * The slate-blue accent matches the Corporate Roles tab on /jobs?surface=corporate
 * so a candidate hopping between landing → tab knows they're in the
 * same conceptual surface.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Building2, MapPin, Clock } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { candidateCtaHref } from "@/lib/marketing/candidate-cta";
import {
  CORPORATE_FUNCTIONS,
  CORPORATE_FUNCTION_SLUGS,
  getCorporateFunction,
} from "@/lib/corporate/functions";
import {
  WORK_MODE_LABELS,
  AUTHORITY_LEVEL_LABELS,
} from "@/lib/corporate/job-fields";

export const dynamic = "force-static";
export const revalidate = 3600; // 1 hour — jobs don't churn fast on corporate side.

interface PageProps {
  params: Promise<{ function: string }>;
}

export function generateStaticParams() {
  return CORPORATE_FUNCTION_SLUGS.map((slug) => ({ function: slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { function: slug } = await params;
  const fn = getCorporateFunction(slug);
  if (!fn) return { title: "Corporate roles · DSO Hire" };
  return {
    title: `${fn.label} jobs at dental groups · DSO Hire`,
    description: fn.blurb,
    alternates: { canonical: `/corporate-roles/${fn.slug}` },
  };
}

export default async function CorporateFunctionPage({ params }: PageProps) {
  const { function: slug } = await params;
  const fn = getCorporateFunction(slug);
  if (!fn) notFound();

  // Auth-aware CTA: a signed-in candidate goes to their dashboard, not back
  // through sign-up (Cam, Day 37).
  const ctaHref = await candidateCtaHref("dashboard");

  const supabase = await createSupabaseServerClient();

  // Pull active corporate jobs in this function. Service-role not needed —
  // RLS allows public read of active jobs.
  const { data: rawJobs } = await supabase
    .from("jobs")
    .select(
      "id, dso_id, title, slug, employment_type, posted_at, compensation_min, compensation_max, compensation_period, compensation_visible, work_mode, authority_level"
    )
    .eq("status", "active")
    .eq("scope", "corporate")
    .eq("corporate_function", fn.slug)
    .is("deleted_at", null)
    .order("posted_at", { ascending: false })
    .limit(20);

  const jobs = (rawJobs ?? []) as Array<{
    id: string;
    dso_id: string;
    title: string;
    slug: string;
    employment_type: string;
    posted_at: string | null;
    compensation_min: number | null;
    compensation_max: number | null;
    compensation_period: string | null;
    compensation_visible: boolean;
    work_mode: string | null;
    authority_level: string | null;
  }>;

  // DSO names for the cards.
  const dsoIds = Array.from(new Set(jobs.map((j) => j.dso_id)));
  const { data: dsos } =
    dsoIds.length > 0
      ? await supabase.from("dsos").select("id, name, slug").in("id", dsoIds)
      : { data: [] as Array<{ id: string; name: string; slug: string }> };
  const dsoById = new Map(
    (dsos ?? []).map((d) => [d.id, d as { id: string; name: string; slug: string }])
  );

  return (
    <SiteShell>
      <section className="pt-[140px] pb-12 px-6 sm:px-14 max-w-[1240px] mx-auto">
        <div className="flex items-center gap-3.5 mb-6">
          <span className="block w-7 h-px" style={{ background: "#3D5266" }} />
          <span
            className="text-[10px] font-bold tracking-[3.5px] uppercase"
            style={{ color: "#3D5266" }}
          >
            Corporate Roles · {fn.label}
          </span>
        </div>
        <h1 className="text-4xl sm:text-7xl font-extrabold tracking-[-2px] leading-[1.02] text-ink mb-5 max-w-[820px]">
          {fn.label} jobs at multi-location dental groups.
        </h1>
        <p className="text-base sm:text-lg text-slate-body leading-relaxed max-w-[760px]">
          {fn.blurb}
        </p>
      </section>

      {/* Sub-role chips — useful as candidate intent + helps SEO surface
          long-tail title variants. */}
      <section className="px-6 sm:px-14 pb-12 max-w-[1240px] mx-auto">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta mb-3">
          Common titles in {fn.label}
        </div>
        <ul className="flex flex-wrap gap-2">
          {fn.subRoles.map((sr) => (
            <li
              key={sr}
              className="px-3 py-1.5 text-[13px] font-semibold border border-[var(--rule-strong)] bg-card text-ink"
            >
              {sr}
            </li>
          ))}
        </ul>
      </section>

      {/* Open jobs feed for this function. */}
      <section className="px-6 sm:px-14 pb-24 max-w-[1240px] mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta">
            {jobs.length === 0
              ? `No ${fn.label} roles open right now`
              : jobs.length === 1
                ? `1 open ${fn.label} role`
                : `${jobs.length} open ${fn.label} roles`}
          </div>
          <Link
            href="/jobs?surface=corporate"
            className="inline-flex items-center gap-1.5 text-[12px] font-bold tracking-[1.5px] uppercase hover:opacity-75"
            style={{ color: "#3D5266" }}
          >
            View all Corporate Roles
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {jobs.length === 0 ? (
          <div className="border border-[var(--rule)] bg-cream p-12 text-center max-w-[640px] mx-auto">
            <h3 className="text-[18px] font-extrabold tracking-[-0.4px] text-ink mb-2">
              No {fn.label} roles open right now.
            </h3>
            <p className="text-[14px] text-slate-body leading-relaxed mb-4">
              Corporate roles at multi-practice dental groups don&apos;t open as
              often as practice-side hires. Check back, or browse all
              currently-open corporate roles.
            </p>
            <Link
              href={ctaHref}
              className="text-heritage underline underline-offset-2 hover:text-heritage-deep font-semibold text-[13px]"
            >
              Create a free candidate account
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-[var(--rule)] border border-[var(--rule)]">
            {jobs.map((job) => {
              const dso = dsoById.get(job.dso_id);
              const ago = job.posted_at
                ? formatPostedAgo(new Date(job.posted_at))
                : null;
              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="block bg-card hover:bg-cream/60 transition-colors p-6"
                >
                  <div
                    className="inline-flex items-center gap-1.5 mb-2 text-[10px] font-bold tracking-[2px] uppercase"
                    style={{ color: "#3D5266" }}
                  >
                    <Building2 className="h-3 w-3" />
                    {fn.label}
                  </div>
                  <h3 className="text-[18px] font-extrabold tracking-[-0.3px] leading-snug text-ink mb-2">
                    {job.title}
                  </h3>
                  <div className="text-[13px] text-slate-body mb-3">
                    {dso?.name ?? "—"}
                  </div>
                  {/* 5G.d (2026-05-14) — work mode + authority level chips,
                      each rendered only when the field is set. Slate-blue
                      accent matches the corporate surface. */}
                  {(job.work_mode || job.authority_level) && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {job.work_mode && (
                        <span
                          className="px-2 py-0.5 text-[11px] font-semibold border"
                          style={{
                            color: "#3D5266",
                            borderColor: "#3D5266",
                            background: "rgba(61,82,102,0.06)",
                          }}
                        >
                          {WORK_MODE_LABELS[
                            job.work_mode as keyof typeof WORK_MODE_LABELS
                          ] ?? job.work_mode}
                        </span>
                      )}
                      {job.authority_level && (
                        <span
                          className="px-2 py-0.5 text-[11px] font-semibold border"
                          style={{
                            color: "#3D5266",
                            borderColor: "#3D5266",
                            background: "rgba(61,82,102,0.06)",
                          }}
                        >
                          {AUTHORITY_LEVEL_LABELS[
                            job.authority_level as keyof typeof AUTHORITY_LEVEL_LABELS
                          ] ?? job.authority_level}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-slate-meta">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      DSO-wide
                    </span>
                    {ago && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {ago}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Cross-link to the other 11 functions — keeps the candidate inside
          the corporate landscape if this one isn't a fit. */}
      <section className="px-6 sm:px-14 pb-24 max-w-[1240px] mx-auto border-t border-[var(--rule)] pt-12">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta mb-4">
          Explore other corporate functions
        </div>
        <ul className="flex flex-wrap gap-2">
          {CORPORATE_FUNCTIONS.filter((f) => f.slug !== fn.slug).map((f) => (
            <li key={f.slug}>
              <Link
                href={`/corporate-roles/${f.slug}`}
                className="px-3 py-1.5 text-[13px] font-semibold border border-[var(--rule-strong)] bg-card text-ink hover:bg-cream/60 transition-colors inline-block"
              >
                {f.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </SiteShell>
  );
}

/** Local time-ago helper. ~12-line pure fn, simpler than importing date-fns. */
function formatPostedAgo(when: Date): string {
  const diffMs = Date.now() - when.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "1 week ago";
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return "1 month ago";
  return `${Math.floor(days / 30)} months ago`;
}
