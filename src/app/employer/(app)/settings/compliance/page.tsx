/**
 * /employer/settings/compliance — Compliance hub (Growth+ tier-gated).
 *
 * v1 holds one tool: the EEO / applicant-flow export + adverse-impact
 * aggregate. Access model (spec §1, non-negotiable):
 *
 *   • Growth+ tier — lower tiers see the upgrade banner (same pattern as
 *     pipeline settings).
 *   • eeo.view capability — owner by preset; admin only via an explicit
 *     grant in Team permissions; recruiters/hiring managers can never
 *     hold it. Enforced HERE for the screen and AGAIN in the CSV route.
 *   • The aggregate table below the export is aggregate-only with
 *     small-cell suppression (<5) — individual EEO answers only ever
 *     leave as the CSV download to an authorized user.
 *
 * Honest framing (spec §5): this exports the data a DSO needs for its
 * OWN AAP / adverse-impact analysis. It does not make anyone "OFCCP
 * compliant" and we are not giving legal advice — the copy says so.
 *
 * Room is deliberately left to link compliance-adjacent tools later
 * (credential expiry rollup, disposition reporting) — don't rebuild
 * those here.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock, Download, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveSubscription } from "@/lib/billing/subscription";
import { can } from "@/lib/permissions/capabilities";
import { EEO_FIELDS } from "@/lib/eeo/options";
import {
  adverseImpactTable,
  EEO_SMALL_CELL_THRESHOLD,
} from "@/lib/eeo/export";
import { loadApplicantFlowAggregate } from "./data";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Compliance · Settings" };

export const dynamic = "force-dynamic";

/** Tiers with access to the Compliance hub (mirrored in the CSV route). */
const COMPLIANCE_TIERS = new Set(["growth", "scale", "enterprise"]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface PageProps {
  searchParams: Promise<{ job?: string; from?: string; to?: string }>;
}

export default async function ComplianceSettingsPage({
  searchParams,
}: PageProps) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in?next=/employer/settings/compliance");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role, permission_overrides")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  const dsoId = dsoUser.dso_id as string;
  const hasEeoAccess = can(
    dsoUser.role as string,
    (dsoUser as Record<string, unknown>).permission_overrides,
    "eeo.view"
  );

  const sub = await getActiveSubscription(supabase, dsoId);
  const tierUnlocked = !!sub && COMPLIANCE_TIERS.has(sub.tier);

  const unlocked = tierUnlocked && hasEeoAccess;

  // Scope selection (URL-driven so it's shareable/back-button safe).
  const jobId = sp.job && UUID_RE.test(sp.job) ? sp.job : null;
  const from = sp.from && DATE_RE.test(sp.from) ? sp.from : null;
  const to = sp.to && DATE_RE.test(sp.to) ? sp.to : null;

  // Job list for the scope picker (RLS-scoped, no EEO involved).
  const { data: jobRows } = unlocked
    ? await supabase
        .from("jobs")
        .select("id, title")
        .eq("dso_id", dsoId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: [] };
  const jobs = (jobRows ?? []) as Array<{ id: string; title: string }>;

  // Aggregate + preview count — only computed for authorized viewers.
  const aggregate = unlocked
    ? await loadApplicantFlowAggregate(supabase, dsoId, { jobId, from, to })
    : null;

  const exportParams = new URLSearchParams();
  if (jobId) exportParams.set("job", jobId);
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);
  const exportHref = `/api/employer/eeo-applicant-flow.csv${
    exportParams.size > 0 ? `?${exportParams.toString()}` : ""
  }`;

  return (
    <section className="max-w-[820px]">
      <header className="mb-6">
        <div className="text-2xs font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Compliance
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.8px] leading-[1.15] text-ink">
          Applicant-flow &amp; EEO reporting
        </h2>
        <p className="mt-3 text-sm text-slate-body leading-relaxed">
          Export applicant-flow and voluntary self-ID data for your
          affirmative-action / adverse-impact analysis. This gives your
          compliance team the raw data — it is not legal advice, and using
          it doesn&apos;t by itself make your organization OFCCP-compliant.
          Confirm required fields and retention with your compliance
          counsel.
        </p>
      </header>

      {/* Tier gate banner */}
      {!tierUnlocked && (
        <div className="mb-6 border border-warning bg-warning-bg p-5 text-sm text-warning">
          <div className="flex items-start gap-3">
            <Lock className="size-4 mt-0.5 shrink-0 text-warning" />
            <div className="flex-1">
              <strong className="font-semibold inline-flex items-center gap-1.5">
                <BrandMark className="size-3.5" />
                Growth+ feature
              </strong>
              <p className="mt-1.5 leading-relaxed">
                The Compliance hub is part of the Growth and Enterprise
                tiers.
              </p>
              <Link
                href="/employer/billing"
                className="mt-2 inline-block font-semibold text-warning underline-offset-2 hover:underline"
              >
                Upgrade to Growth →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* EEO-access gate (tier fine, capability missing) */}
      {tierUnlocked && !hasEeoAccess && (
        <div className="mb-6 border border-warning bg-warning-bg p-5 text-sm text-warning">
          <div className="flex items-start gap-3">
            <ShieldCheck className="size-4 mt-0.5 shrink-0 text-warning" />
            <div className="flex-1">
              <strong className="font-semibold">
                EEO data is restricted.
              </strong>
              <p className="mt-1.5 leading-relaxed">
                Applicant demographic data is firewalled from anyone who
                makes hiring decisions. Only the account owner — or an
                admin explicitly granted{" "}
                <em className="not-italic font-semibold">
                  &ldquo;View EEO / demographic reports&rdquo;
                </em>{" "}
                in Team permissions — can use this export. Recruiters and
                hiring managers can never be granted access.
              </p>
            </div>
          </div>
        </div>
      )}

      {unlocked && (
        <>
          {/* Scope picker */}
          <form
            method="get"
            className="mb-6 border border-[var(--rule)] bg-card p-5"
          >
            <div className="text-2xs font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
              Export scope
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <label className="block">
                <span className="block text-xs font-semibold text-slate-body mb-1">
                  Job
                </span>
                <select
                  name="job"
                  defaultValue={jobId ?? ""}
                  className="min-w-[220px] border border-[var(--rule-strong)] bg-card px-3 py-2 text-sm text-ink focus:border-heritage focus:outline-none"
                >
                  <option value="">All jobs</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-slate-body mb-1">
                  Applied from
                </span>
                <input
                  type="date"
                  name="from"
                  defaultValue={from ?? ""}
                  className="border border-[var(--rule-strong)] bg-card px-3 py-2 text-sm text-ink focus:border-heritage focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-slate-body mb-1">
                  Applied to
                </span>
                <input
                  type="date"
                  name="to"
                  defaultValue={to ?? ""}
                  className="border border-[var(--rule-strong)] bg-card px-3 py-2 text-sm text-ink focus:border-heritage focus:outline-none"
                />
              </label>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Preview
              </button>
            </div>
          </form>

          {/* Preview + download */}
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border border-[var(--rule)] bg-cream p-5">
            <div>
              <div className="text-lg font-extrabold text-ink tabular">
                {aggregate?.totalApplicants ?? 0}{" "}
                <span className="text-sm font-semibold text-slate-body">
                  applicant{aggregate?.totalApplicants === 1 ? "" : "s"} in
                  scope
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-meta leading-relaxed max-w-[440px]">
                One CSV row per applicant: identifier, job, state,
                application date, final disposition, source, and voluntary
                self-ID (declines preserved as &ldquo;Declined&rdquo;).
                Every download is recorded in your audit log.
              </p>
            </div>
            <a
              href={exportHref}
              className="inline-flex items-center gap-2 bg-heritage px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-heritage-deep transition-colors"
            >
              <Download className="size-4" />
              Download CSV
            </a>
          </div>

          {/* Adverse-impact aggregate (spec §4) */}
          <div className="mb-8">
            <h3 className="text-base font-extrabold tracking-[-0.3px] text-ink mb-1">
              Selection rates by group
            </h3>
            <p className="text-xs text-slate-meta leading-relaxed mb-4 max-w-[640px]">
              The input to a 4/5ths (impact-ratio) analysis: applicants and
              selection rate per self-identified group in the scope above.
              Groups with fewer than {EEO_SMALL_CELL_THRESHOLD} applicants
              are suppressed to prevent re-identification.
            </p>
            {EEO_FIELDS.map((field) => {
              const rows = adverseImpactTable(
                field.key,
                aggregate?.byField[field.key] ?? []
              );
              return (
                <div key={field.key} className="mb-6">
                  <div className="text-2xs font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
                    {field.label}
                  </div>
                  {rows.length === 0 ? (
                    <p className="text-xs italic text-slate-meta">
                      No applicants in scope.
                    </p>
                  ) : (
                    <table className="w-full max-w-[640px] border border-[var(--rule)] text-sm">
                      <thead>
                        <tr className="bg-cream text-left">
                          <th className="px-3 py-2 text-2xs font-bold tracking-[1px] uppercase text-slate-body">
                            Group
                          </th>
                          <th className="px-3 py-2 text-2xs font-bold tracking-[1px] uppercase text-slate-body text-right">
                            Applicants
                          </th>
                          <th className="px-3 py-2 text-2xs font-bold tracking-[1px] uppercase text-slate-body text-right">
                            Hired
                          </th>
                          <th className="px-3 py-2 text-2xs font-bold tracking-[1px] uppercase text-slate-body text-right">
                            Selection rate
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr
                            key={r.group}
                            className="border-t border-[var(--rule)]"
                          >
                            <td className="px-3 py-2 text-ink">{r.group}</td>
                            {r.suppressed ? (
                              <td
                                colSpan={3}
                                className="px-3 py-2 text-right text-xs italic text-slate-meta"
                              >
                                Suppressed (&lt;{EEO_SMALL_CELL_THRESHOLD}{" "}
                                applicants)
                              </td>
                            ) : (
                              <>
                                <td className="px-3 py-2 text-right tabular text-ink">
                                  {r.applicants}
                                </td>
                                <td className="px-3 py-2 text-right tabular text-ink">
                                  {r.hired}
                                </td>
                                <td className="px-3 py-2 text-right tabular text-ink">
                                  {r.selectionRate === null
                                    ? "—"
                                    : `${Math.round(r.selectionRate * 100)}%`}
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Compliance-adjacent tools — links only, deliberately not rebuilt here. */}
      <div className="border-t border-[var(--rule)] pt-5">
        <div className="text-2xs font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
          Related
        </div>
        <ul className="space-y-2 text-sm">
          <li>
            <Link
              href="/employer/dashboard#credentials-expiring"
              className="text-heritage font-semibold underline-offset-2 hover:underline"
            >
              Credential expiry rollup
            </Link>{" "}
            <span className="text-slate-meta">
              — licenses &amp; certifications expiring across your team.
            </span>
          </li>
          <li>
            <Link
              href="/employer/analytics"
              className="text-heritage font-semibold underline-offset-2 hover:underline"
            >
              Hiring analytics &amp; disposition reporting
            </Link>{" "}
            <span className="text-slate-meta">
              — structured non-selection reasons ship in the applications
              export.
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}
