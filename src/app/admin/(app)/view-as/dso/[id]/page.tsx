/**
 * /admin/view-as/dso/[id] — read-only DSO mirror (Tranche 2, Option B).
 *
 * Founder-only (Tier-2). Re-renders a DSO's own view (identity, jobs, team) via
 * service-role. Read-only by construction (no mutation forms). No EEO; no
 * individual applicant identities (aggregate counts only); deleted_at → 404.
 * Audited (admin.impersonation.start, no PII in metadata).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { requireSuperadmin } from "@/lib/admin/gate";
import { recordAdminAudit } from "@/lib/admin/audit";
import { getDsoMirror } from "@/lib/admin/view-as-dso";
import { Panel, Row } from "@/components/admin/account-360-ui";

export const metadata: Metadata = {
  title: "View as DSO · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function ViewAsDso({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireSuperadmin(`/admin/view-as/dso/${id}`);

  const m = await getDsoMirror(id);
  if (!m) notFound();

  await recordAdminAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "admin.impersonation.start",
    targetType: "dso",
    targetId: m.id,
    summary: "Opened read-only view-as (dso)",
  });

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4 border border-heritage-deep/30 bg-heritage/10 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Eye className="h-4 w-4 text-heritage-deep" />
          <span className="text-[13px] text-ink">
            Viewing as <strong className="font-bold">{m.name}</strong> —{" "}
            <span className="font-bold text-heritage-deep">READ ONLY</span>
          </span>
        </div>
        <Link
          href={`/admin/dso/${m.id}`}
          className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Exit
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-3xl font-extrabold tracking-[-1px] text-ink">
          {m.name}
        </h1>
        <p className="mt-1 text-[13px] text-slate-meta">
          {m.tier ?? "no plan"}
          {m.subscriptionStatus ? ` · ${m.subscriptionStatus}` : ""} ·{" "}
          {m.status ?? "—"}
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <Panel title={`Jobs (${m.jobs.length})`}>
            {m.jobs.length === 0 ? (
              <p className="text-[13px] text-slate-meta italic">No jobs yet.</p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta border-b border-[var(--rule)]">
                    <th className="text-left py-2 font-bold">Title</th>
                    <th className="text-left py-2 font-bold">Status</th>
                    <th className="text-right py-2 font-bold">Apps</th>
                    <th className="text-right py-2 font-bold">Views</th>
                  </tr>
                </thead>
                <tbody>
                  {m.jobs.map((j) => (
                    <tr key={j.id} className="border-b border-[var(--rule)]/60">
                      <td className="py-1.5 text-ink font-semibold truncate max-w-[360px]">
                        {j.title}
                      </td>
                      <td className="py-1.5 text-slate-body">{j.status}</td>
                      <td className="py-1.5 text-right text-ink tabular-nums">
                        {j.applications}
                      </td>
                      <td className="py-1.5 text-right text-slate-body tabular-nums">
                        {j.views}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>

        <Panel title={`Team (${m.team.length})`}>
          {m.team.length === 0 ? (
            <p className="text-[13px] text-slate-meta italic">No members.</p>
          ) : (
            m.team.map((t, i) => <Row key={i} k={t.name} v={t.role} />)
          )}
        </Panel>
      </div>

      <p className="mt-8 text-[11px] text-slate-meta leading-relaxed">
        Read-only mirror via service-role. Aggregate only — individual applicant
        identities aren&apos;t shown here (anonymity-safe); applicant detail with
        masking re-applied is a follow-on. EEO is never shown.
      </p>
    </>
  );
}
