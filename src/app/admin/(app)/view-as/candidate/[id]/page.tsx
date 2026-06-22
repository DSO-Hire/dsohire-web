/**
 * /admin/view-as/candidate/[id] — read-only candidate mirror (Phase 4.1, Option B).
 *
 * Founder-only (Tier-2). Re-renders the candidate's own key data via service-role
 * — NOT a session swap, NOT the live candidate pages. Read-only by construction:
 * the page has no mutation forms, so no write-block is needed. The view is
 * audited (admin.impersonation.start, no PII in metadata). EEO never shown.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { requireSuperadmin } from "@/lib/admin/gate";
import { recordAdminAudit } from "@/lib/admin/audit";
import { getCandidateMirror } from "@/lib/admin/view-as-candidate";
import { Panel, Row, fmtDate } from "@/components/admin/account-360-ui";

export const metadata: Metadata = {
  title: "View as candidate · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function ViewAsCandidate({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireSuperadmin(`/admin/view-as/candidate/${id}`);

  const m = await getCandidateMirror(id);
  if (!m) notFound();

  await recordAdminAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "admin.impersonation.start",
    targetType: "candidate",
    targetId: m.id,
    summary: "Opened read-only view-as (candidate)",
  });

  return (
    <>
      {/* Read-only banner */}
      <div className="mb-6 flex items-center justify-between gap-4 border border-heritage-deep/30 bg-heritage/10 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Eye className="h-4 w-4 text-heritage-deep" />
          <span className="text-[13px] text-ink">
            Viewing as{" "}
            <strong className="font-bold">{m.fullName ?? "candidate"}</strong>{" "}
            — <span className="font-bold text-heritage-deep">READ ONLY</span>
          </span>
        </div>
        <Link
          href={`/admin/candidate/${m.id}`}
          className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Exit
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-3xl font-extrabold tracking-[-1px] text-ink">
          {m.fullName ?? "(no name)"}
        </h1>
        {(m.currentTitle || m.headline) && (
          <p className="mt-1 text-[14px] text-slate-body">
            {m.currentTitle ?? m.headline}
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel title="Profile (as they see it)">
          <Row k="Headline" v={m.headline ?? "—"} />
          <Row k="Location" v={m.location ?? "—"} />
          <Row k="Searchable" v={m.isSearchable ? "Yes" : "No"} />
          <Row k="Anonymous mode" v={m.anonymousMode ? "On" : "Off"} />
        </Panel>

        <Panel title={`Applications (${m.applications.length})`}>
          {m.applications.length === 0 ? (
            <p className="text-[13px] text-slate-meta italic">
              No applications yet.
            </p>
          ) : (
            <ul className="list-none divide-y divide-[var(--rule)]/60">
              {m.applications.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] text-ink font-semibold truncate">
                      {a.jobTitle}
                    </div>
                    <div className="text-[11px] text-slate-meta truncate">
                      {a.dsoName} · {fmtDate(a.appliedAt)}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold tracking-[0.5px] uppercase text-heritage-deep bg-heritage/10 px-2 py-0.5">
                    {a.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <p className="mt-8 text-[11px] text-slate-meta leading-relaxed">
        Read-only mirror via service-role — the candidate&apos;s own view. EEO is
        never shown. v1 covers profile + applications; deeper screens (fit, resume)
        are a follow-on.
      </p>
    </>
  );
}
