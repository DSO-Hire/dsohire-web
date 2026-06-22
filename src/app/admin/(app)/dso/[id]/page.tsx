/**
 * /admin/dso/[id] — DSO Account 360 (Tranche 1, Phase 3).
 *
 * Operator view (Tier-1 read; the (app) layout gates admin_users). The view is
 * audited (admin.account.viewed). Quick actions are tiered: Tier-1 safe
 * (verify/re-pending, feature) shown to all staff; Tier-2 destructive (suspend,
 * soft-delete) rendered only for founders AND re-enforced server-side in the
 * actions. No EEO; soft-deleted DSO reads as not-found (loader filters it).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Eye } from "lucide-react";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSuperadminEmail } from "@/lib/admin/gate";
import { recordAdminAudit } from "@/lib/admin/audit";
import { getDsoAccount } from "@/lib/admin/account-360";
import {
  setDsoStatus,
  setDsoFeaturedUntil,
  setDsoDeleted,
} from "../../dsos/actions";
import { ConfirmSubmitButton } from "../../dsos/confirm-submit-button";

export const metadata: Metadata = {
  title: "DSO · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function DsoAccount360({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dso = await getDsoAccount(id);
  if (!dso) notFound();

  // Founder flag + audit the view.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const founder = isSuperadminEmail(user?.email);
  if (user) {
    await recordAdminAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: "admin.account.viewed",
      targetType: "dso",
      targetId: dso.id,
      summary: `Viewed DSO ${dso.name}`,
    });
  }

  return (
    <>
      <BackLink />

      <header className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-extrabold tracking-[-1px] text-ink">
              {dso.name}
            </h1>
            <StatusChip status={dso.status} />
          </div>
          {dso.slug && (
            <Link
              href={`/companies/${dso.slug}`}
              className="inline-flex items-center gap-1.5 mt-2 text-[12px] text-heritage-deep hover:text-ink transition-colors"
            >
              /companies/{dso.slug} <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
        {founder && (
          <Link
            href={`/admin/view-as/dso/${dso.id}`}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold tracking-[1px] uppercase border border-heritage-deep/40 text-heritage-deep hover:bg-heritage/10 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" /> View as (read-only)
          </Link>
        )}
      </header>

      {dso.health.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {dso.health.map((h) => (
            <span
              key={h}
              className="inline-block px-2 py-1 text-[10px] font-bold tracking-[0.5px] uppercase text-danger bg-danger/10"
            >
              {h}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel title="Identity">
          <Row k="Created" v={fmtDate(dso.createdAt)} />
          <Row k="Verified" v={fmtDate(dso.verifiedAt)} />
          <Row k="MFA required" v={dso.requireMfa ? "Yes" : "No"} />
          <Row k="Spotlight until" v={fmtDate(dso.featuredUntil)} />
        </Panel>

        <Panel title="Billing (read-only)">
          <Row k="Tier" v={dso.subscription?.tier ?? "—"} />
          <Row k="Subscription" v={dso.subscription?.status ?? "No subscription"} />
          <Row k="Renews / ends" v={fmtDate(dso.subscription?.currentPeriodEnd ?? null)} />
        </Panel>

        <Panel title="Related">
          <Row k="Jobs" v={String(dso.jobsCount)} />
          <Row k="Team members" v={String(dso.usersCount)} />
          <Row k="Applications" v={String(dso.applicationsCount)} />
        </Panel>

        <Panel title="Quick actions">
          <div className="flex flex-wrap gap-2">
            {dso.status !== "active" && (
              <StatusForm dsoId={dso.id} to="active" label="Mark verified" />
            )}
            {dso.status === "active" && (
              <StatusForm dsoId={dso.id} to="pending" label="Re-queue (pending)" subtle />
            )}
            <FeatureForm dsoId={dso.id} action="+30d" label="Spotlight +30d" subtle />
            {dso.featuredUntil && (
              <FeatureForm dsoId={dso.id} action="clear" label="Clear spotlight" subtle />
            )}

            {/* Tier-2 (founder only) */}
            {founder && dso.status !== "suspended" && (
              <form action={suspendAction}>
                <input type="hidden" name="dso_id" value={dso.id} />
                <input type="hidden" name="new_status" value="suspended" />
                <ConfirmSubmitButton
                  confirmMessage={`Suspend ${dso.name}? Their public presence goes dark immediately.`}
                  className={DESTRUCTIVE_BTN}
                >
                  Suspend
                </ConfirmSubmitButton>
              </form>
            )}
            {founder && dso.status === "suspended" && (
              <StatusForm dsoId={dso.id} to="active" label="Restore (activate)" />
            )}
            {founder && (
              <form action={deleteAction}>
                <input type="hidden" name="dso_id" value={dso.id} />
                <input type="hidden" name="action" value="delete" />
                <ConfirmSubmitButton
                  confirmMessage={`Soft-delete ${dso.name}? This hides it everywhere (reversible).`}
                  className={DESTRUCTIVE_BTN}
                >
                  Soft-delete
                </ConfirmSubmitButton>
              </form>
            )}
          </div>
          {!founder && (
            <p className="mt-3 text-[11px] text-slate-meta">
              Suspend / delete are founder-only.
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}

/* ───── inline server-action wrappers (form-action signature) ───── */

async function statusActionWrap(formData: FormData) {
  "use server";
  await setDsoStatus({ ok: true }, formData);
}
async function suspendAction(formData: FormData) {
  "use server";
  await setDsoStatus({ ok: true }, formData);
}
async function featureActionWrap(formData: FormData) {
  "use server";
  await setDsoFeaturedUntil({ ok: true }, formData);
}
async function deleteAction(formData: FormData) {
  "use server";
  await setDsoDeleted({ ok: true }, formData);
}

/* ───── presentational ───── */

const SAFE_BTN =
  "px-3 py-1.5 text-[11px] font-bold tracking-[1px] uppercase bg-primary text-primary-foreground hover:bg-primary/90 transition-colors";
const SUBTLE_BTN =
  "px-3 py-1.5 text-[11px] font-bold tracking-[1px] uppercase border border-[var(--rule-strong)] text-slate-body hover:bg-cream/60 transition-colors";
const DESTRUCTIVE_BTN =
  "px-3 py-1.5 text-[11px] font-bold tracking-[1px] uppercase border border-danger/40 text-danger hover:bg-danger/10 transition-colors";

function StatusForm({
  dsoId,
  to,
  label,
  subtle,
}: {
  dsoId: string;
  to: string;
  label: string;
  subtle?: boolean;
}) {
  return (
    <form action={statusActionWrap}>
      <input type="hidden" name="dso_id" value={dsoId} />
      <input type="hidden" name="new_status" value={to} />
      <button type="submit" className={subtle ? SUBTLE_BTN : SAFE_BTN}>
        {label}
      </button>
    </form>
  );
}

function FeatureForm({
  dsoId,
  action,
  label,
  subtle,
}: {
  dsoId: string;
  action: string;
  label: string;
  subtle?: boolean;
}) {
  return (
    <form action={featureActionWrap}>
      <input type="hidden" name="dso_id" value={dsoId} />
      <input type="hidden" name="action" value={action} />
      <button type="submit" className={subtle ? SUBTLE_BTN : SAFE_BTN}>
        {label}
      </button>
    </form>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/search"
      className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-6"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Search
    </Link>
  );
}

function StatusChip({ status }: { status: string | null }) {
  const tone =
    status === "active"
      ? "text-heritage-deep bg-heritage/10"
      : status === "suspended"
        ? "text-danger bg-danger/10"
        : "text-slate-body bg-cream";
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-bold tracking-[1px] uppercase ${tone}`}>
      {status ?? "—"}
    </span>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-[var(--rule)] bg-card p-5">
      <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
        {title}
      </div>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1 text-[13px]">
      <span className="text-slate-meta">{k}</span>
      <span className="text-ink font-semibold text-right">{v}</span>
    </div>
  );
}
