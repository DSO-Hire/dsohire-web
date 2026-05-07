/**
 * /employer/settings/templates — Email template editor (Phase 4.5.f).
 *
 * Lists the 3 customizable templates as cards. Click one to expand an
 * inline editor (subject + Tiptap body + mergefield dropdown + reference
 * panel + live preview).
 *
 * Tier-gated to Growth + Enterprise. Starter sees the page with a soft
 * lock banner explaining the upgrade path.
 *
 * Server component: loads tier + existing custom rows, hydrates the
 * client orchestrator.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, Sparkles } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dsoCanUseCustomTemplates } from "@/lib/email/templates/tier";
import {
  TEMPLATE_KINDS,
  TEMPLATE_META,
  type EmailTemplateKind,
} from "@/lib/email/templates/manifest";
import { DEFAULT_TEMPLATES } from "@/lib/email/templates/defaults";
import { TemplatesEditor } from "./templates-editor";
import type { TemplateInitial } from "./templates-data";

export const metadata: Metadata = {
  title: "Email templates · Settings",
};

export const dynamic = "force-dynamic";

export default async function EmailTemplatesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return notFound();

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return notFound();

  const dsoId = dsoUser.dso_id as string;
  const role = dsoUser.role as string;
  const canEdit = role === "owner" || role === "admin";
  const tierUnlocked = await dsoCanUseCustomTemplates(supabase, dsoId);

  const { data: templateRows } = await supabase
    .from("email_templates")
    .select("kind, subject, body_html, updated_at")
    .eq("dso_id", dsoId);

  const customByKind = new Map<
    EmailTemplateKind,
    { subject: string; body_html: string; updated_at: string }
  >();
  for (const row of (templateRows ?? []) as Array<{
    kind: string;
    subject: string;
    body_html: string;
    updated_at: string;
  }>) {
    if ((TEMPLATE_KINDS as string[]).includes(row.kind)) {
      customByKind.set(row.kind as EmailTemplateKind, {
        subject: row.subject,
        body_html: row.body_html,
        updated_at: row.updated_at,
      });
    }
  }

  const initial: TemplateInitial[] = TEMPLATE_KINDS.map((kind) => {
    const custom = customByKind.get(kind);
    const def = DEFAULT_TEMPLATES[kind];
    return {
      kind,
      isCustom: !!custom,
      subject: custom?.subject ?? def.subject,
      body_html: custom?.body_html ?? def.body_html,
      updatedAt: custom?.updated_at ?? null,
    };
  });

  return (
    <div className="space-y-6 max-w-[920px]">
      <header className="space-y-3 pb-2">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          Email templates
        </div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.8px] text-ink leading-tight">
          The emails candidates get from you, in your voice.
        </h1>
        <p className="text-sm text-slate-body leading-relaxed max-w-[640px]">
          Customize the candidate-facing emails the platform sends on your
          behalf. Use mergefields like{" "}
          <code className="font-mono text-[12px] bg-cream/60 px-1 py-0.5 rounded border border-[var(--rule)]">
            {"{{candidate.first_name}}"}
          </code>{" "}
          and{" "}
          <code className="font-mono text-[12px] bg-cream/60 px-1 py-0.5 rounded border border-[var(--rule)]">
            {"{{job.title}}"}
          </code>{" "}
          to personalize each send.
        </p>
      </header>

      {!tierUnlocked ? (
        <div className="border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          <div className="flex items-start gap-3">
            <Lock className="size-4 mt-0.5 shrink-0 text-amber-700" />
            <div className="flex-1">
              <strong className="font-semibold inline-flex items-center gap-1.5">
                <Sparkles className="size-3.5" />
                Growth+ feature
              </strong>
              <p className="mt-1.5 leading-relaxed">
                Custom email templates are part of the Growth and Enterprise
                tiers. You can preview the editor below — saves are blocked
                until you upgrade.
              </p>
              <Link
                href="/employer/billing"
                className="mt-2 inline-block font-semibold text-amber-900 underline-offset-2 hover:underline"
              >
                See pricing →
              </Link>
            </div>
          </div>
        </div>
      ) : !canEdit ? (
        <div className="border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <strong className="font-semibold">View-only.</strong> Only DSO
          owners and admins can edit email templates.
        </div>
      ) : null}

      <TemplatesEditor
        initial={initial}
        canEdit={canEdit && tierUnlocked}
        templateMeta={TEMPLATE_META}
      />
    </div>
  );
}
