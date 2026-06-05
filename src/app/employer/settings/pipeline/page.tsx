/**
 * /employer/settings/pipeline — Configurable pipeline stages editor
 * (Phase 5A Track B follow-on, 2026-05-12).
 *
 * Server component: resolves auth + DSO + role + active subscription
 * tier, fetches the DSO's `dso_pipeline_stages` rows, hands them to the
 * client orchestrator.
 *
 * Tier posture:
 *   - Starter (or no active sub) → read-only. The editor renders the
 *     stages list with all controls disabled and a prominent upgrade
 *     CTA at the top.
 *   - Growth / Enterprise → full CRUD.
 *
 * Role posture:
 *   - owner / admin → can edit (subject to tier above).
 *   - recruiter / hiring_manager → read-only view, with a "view-only"
 *     banner instead of the upgrade CTA. Server actions also reject
 *     these roles as a second line of defense.
 *
 * The settings layout already wraps with EmployerShell + the 2-column
 * nav (per feedback_settings_layout_already_wraps_shell.md) so we
 * return inner content only.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock, Info } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveSubscription } from "@/lib/billing/subscription";
import { MAX_STAGES_PER_DSO, type PipelineStage } from "@/lib/applications/stages";
import { PIPELINE_CRUD_TIERS } from "./pipeline-data";
import { PipelineEditor } from "./pipeline-editor";

export const metadata: Metadata = { title: "Pipeline stages · Settings" };

export const dynamic = "force-dynamic";

export default async function PipelineSettingsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in?next=/employer/settings/pipeline");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  const dsoId = dsoUser.dso_id as string;
  const role = (dsoUser.role as string) ?? "";
  const isAdmin = role === "owner" || role === "admin";

  // Fetch stages — RLS lets any DSO member SELECT.
  const { data: stageRows, error: stagesErr } = await supabase
    .from("dso_pipeline_stages")
    .select(
      "id, dso_id, kind, label, slug, sort_order, is_hidden, is_default, color_class"
    )
    .eq("dso_id", dsoId)
    .order("sort_order", { ascending: true });
  if (stagesErr) {
    console.warn("[settings/pipeline] stages lookup", stagesErr);
  }
  const stages = ((stageRows ?? []) as PipelineStage[]) ?? [];

  const sub = await getActiveSubscription(supabase, dsoId);
  const tier = sub?.tier ?? null;
  const tierUnlocked = !!tier && PIPELINE_CRUD_TIERS.has(tier);
  const canEdit = isAdmin && tierUnlocked;

  const totalCount = stages.length;

  return (
    <section className="max-w-[820px]">
      <header className="mb-6">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Pipeline stages
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.8px] leading-[1.15] text-ink">
          Customize how your team moves candidates through hiring
        </h2>
        <p className="mt-3 text-[14px] text-slate-body leading-relaxed">
          Rename the stages on your kanban, recolor them, hide ones you
          don&apos;t use, and add custom stages for your process. Every
          DSO starts with the canonical seven — open, screening,
          interview, offer, hired, rejected, withdrawn.
        </p>
      </header>

      {/* Tier gate banner */}
      {!tierUnlocked && (
        <div className="mb-6 border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          <div className="flex items-start gap-3">
            <Lock className="size-4 mt-0.5 shrink-0 text-amber-700" />
            <div className="flex-1">
              <strong className="font-semibold inline-flex items-center gap-1.5">
                <BrandMark className="size-3.5" />
                Growth+ feature
              </strong>
              <p className="mt-1.5 leading-relaxed">
                Custom pipeline stages are part of the Growth and
                Enterprise tiers. You can preview the seven default
                stages below — edits are blocked until you upgrade.
              </p>
              <Link
                href="/employer/billing"
                className="mt-2 inline-block font-semibold text-amber-900 underline-offset-2 hover:underline"
              >
                Upgrade to Growth →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Role-only gate (only show when tier is fine but role isn't) */}
      {tierUnlocked && !isAdmin && (
        <div className="mb-6 border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <strong className="font-semibold">View-only.</strong> Only DSO
          owners and admins can edit pipeline stages.
        </div>
      )}

      {/* How `kind` works */}
      <div className="mb-6 border-l-2 border-heritage bg-cream/60 px-4 py-3">
        <div className="flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-heritage-deep mt-1 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep mb-1">
              Labels vs. kinds
            </div>
            <p className="text-[13px] text-slate-body leading-relaxed">
              The <strong className="text-ink">label</strong> is what
              your team sees on the kanban — rename freely. The{" "}
              <strong className="text-ink">kind</strong> controls system
              behavior: terminal kinds (rejected, withdrawn) skip the
              advance arrow, and the kind &quot;open&quot; receives
              brand-new applications. Each kind needs at least one
              visible stage at all times.
            </p>
          </div>
        </div>
      </div>

      {/* Capacity counter */}
      <div className="mb-3 flex items-center justify-between text-[12px] text-slate-meta">
        <span>
          <strong className="text-ink font-semibold">{totalCount}</strong>{" "}
          of {MAX_STAGES_PER_DSO} stages used
        </span>
      </div>

      <PipelineEditor
        initialStages={stages}
        canEdit={canEdit}
        tier={tier}
      />
    </section>
  );
}
