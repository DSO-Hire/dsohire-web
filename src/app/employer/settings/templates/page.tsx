/**
 * /employer/settings/templates — Email template editor.
 *
 * Two sections:
 *   1. PREDEFINED — the 3 system-driven templates the platform sends on
 *      candidate events (apply confirmation, message received, stage moved).
 *      Available to ALL paid tiers including Solo (2026-05-27).
 *   2. CUSTOM TEMPLATES — Growth+ only. Arbitrary user-defined templates
 *      DSO admins author for ad-hoc sends from the application detail page.
 *
 * Server component: loads tier + existing template rows (split by
 * is_custom), hydrates the client orchestrator with both lists.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, Sparkles } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dsoCanUseCustomTemplates } from "@/lib/email/templates/tier";
import {
  PREDEFINED_TEMPLATE_KINDS,
  TEMPLATE_META,
  type PredefinedTemplateKind,
} from "@/lib/email/templates/manifest";
import { DEFAULT_TEMPLATES } from "@/lib/email/templates/defaults";
import { TemplatesEditor } from "./templates-editor";
import { CustomTemplatesEditor } from "./custom-templates-editor";
import type { TemplateInitial } from "./templates-data";
import type { CustomTemplateInitial } from "./custom-templates-editor";

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
    .select("id, kind, name, description, subject, body_html, updated_at, is_custom, is_archived")
    .eq("dso_id", dsoId);

  // Split predefined vs custom from the same fetch.
  const customByKind = new Map<
    PredefinedTemplateKind,
    { subject: string; body_html: string; updated_at: string }
  >();
  const customTemplates: CustomTemplateInitial[] = [];

  for (const row of (templateRows ?? []) as Array<{
    id: string;
    kind: string;
    name: string | null;
    description: string | null;
    subject: string;
    body_html: string;
    updated_at: string;
    is_custom: boolean;
    is_archived: boolean;
  }>) {
    if (row.is_archived) continue;

    if (!row.is_custom && (PREDEFINED_TEMPLATE_KINDS as string[]).includes(row.kind)) {
      customByKind.set(row.kind as PredefinedTemplateKind, {
        subject: row.subject,
        body_html: row.body_html,
        updated_at: row.updated_at,
      });
    } else if (row.is_custom) {
      customTemplates.push({
        id: row.id,
        kind: row.kind,
        name: row.name ?? "(unnamed)",
        description: row.description ?? "",
        subject: row.subject,
        body_html: row.body_html,
        updatedAt: row.updated_at,
      });
    }
  }

  customTemplates.sort((a, b) => a.name.localeCompare(b.name));

  const initial: TemplateInitial[] = PREDEFINED_TEMPLATE_KINDS.map((kind) => {
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
    <div className="space-y-10 max-w-[920px]">
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

      {!canEdit && (
        <div className="border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <strong className="font-semibold">View-only.</strong> Only DSO
          owners and admins can edit email templates.
        </div>
      )}

      {/* ─── Predefined templates (all paid tiers) ─── */}
      <section className="space-y-5">
        <div className="space-y-1.5">
          <h2 className="font-display text-xl font-bold tracking-[-0.4px] text-ink">
            Automatic emails
          </h2>
          <p className="text-[13px] text-slate-meta leading-relaxed">
            Sent automatically when candidates apply, message you, or move
            between stages. Edit the subject and body to match your voice.
          </p>
        </div>

        <TemplatesEditor
          initial={initial}
          canEdit={canEdit}
          templateMeta={TEMPLATE_META}
        />
      </section>

      {/* ─── Custom templates (Growth+) ─── */}
      <section className="space-y-5 pt-6 border-t border-[var(--rule)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1.5 flex-1 min-w-0">
            <h2 className="font-display text-xl font-bold tracking-[-0.4px] text-ink inline-flex items-center gap-2">
              Custom templates
              <span className="inline-flex items-center gap-1 rounded-full bg-heritage-deep/10 px-2 py-0.5 text-[10px] font-semibold tracking-[0.5px] uppercase text-heritage-deep">
                <Sparkles className="size-3" />
                Growth+
              </span>
            </h2>
            <p className="text-[13px] text-slate-meta leading-relaxed max-w-[560px]">
              Build reusable templates for the emails you send ad-hoc — interview
              prep, offer details, no-show follow-ups. Send them on demand from
              any candidate&apos;s profile.
            </p>
          </div>
        </div>

        {!tierUnlocked ? (
          <div className="border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
            <div className="flex items-start gap-3">
              <Lock className="size-4 mt-0.5 shrink-0 text-amber-700" />
              <div className="flex-1">
                <strong className="font-semibold">Growth+ feature</strong>
                <p className="mt-1.5 leading-relaxed">
                  Custom templates unlock on the Growth, Scale, and Enterprise
                  tiers. The 3 automatic emails above are already available on
                  your current plan.
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
        ) : (
          <CustomTemplatesEditor
            initial={customTemplates}
            canEdit={canEdit}
          />
        )}
      </section>
    </div>
  );
}
