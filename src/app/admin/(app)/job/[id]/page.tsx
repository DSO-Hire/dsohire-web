/**
 * /admin/job/[id] — Job Account 360 (Tranche 1, Phase 3).
 *
 * Operator view (Tier-1 read; layout gates admin_users). Read-only. View is
 * audited. No EEO. Soft-deleted job → not-found. Links to the owning DSO 360.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAdminAudit } from "@/lib/admin/audit";
import { getJobAccount } from "@/lib/admin/account-360";
import {
  BackLink,
  Panel,
  Row,
  HealthChips,
  fmtDate,
} from "@/components/admin/account-360-ui";
import { humanizeRole } from "@/lib/admin/liquidity";

export const metadata: Metadata = {
  title: "Job · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function JobAccount360({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const j = await getJobAccount(id);
  if (!j) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await recordAdminAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: "admin.account.viewed",
      targetType: "job",
      targetId: j.id,
      summary: `Viewed job ${j.id}`,
    });
  }

  return (
    <>
      <BackLink />
      <header className="mb-8">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-extrabold tracking-[-1px] text-ink">
            {j.title ?? "(untitled)"}
          </h1>
          <span className="inline-block px-2 py-0.5 text-[10px] font-bold tracking-[1px] uppercase text-slate-body bg-cream">
            {j.status ?? "—"}
          </span>
        </div>
        {j.dsoId && (
          <Link
            href={`/admin/dso/${j.dsoId}`}
            className="inline-flex items-center gap-1.5 mt-2 text-[12px] text-heritage-deep hover:text-ink transition-colors"
          >
            {j.dsoName ?? "DSO"} <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </header>

      <HealthChips flags={j.health} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel title="Posting">
          <Row k="Role" v={j.roleCategory ? humanizeRole(j.roleCategory) : "—"} />
          <Row k="Posted" v={fmtDate(j.postedAt)} />
        </Panel>
        <Panel title="Performance">
          <Row k="Views" v={String(j.views)} />
          <Row k="Applications" v={String(j.applicationsCount)} />
        </Panel>
      </div>
    </>
  );
}
