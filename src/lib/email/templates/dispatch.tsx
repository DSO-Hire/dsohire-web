/**
 * dispatchCandidateEmail() — wraps dispatchNotification() with custom-template
 * lookup (Phase 4.5.f).
 *
 * Flow:
 *   1. Try `loadCustomTemplate(dsoId, kind)` — returns null if no row exists
 *      OR the DSO isn't on Growth+ (tier gate inside loader).
 *   2. If a custom template was found:
 *        a. Pull DSO row to populate `dso.*` mergefields (name, profile_url,
 *           contact_cta_url).
 *        b. Render subject + body_html through the mergefield renderer.
 *        c. Sanitize the rendered body via the shared Tiptap sanitizer.
 *        d. Wrap in `<CustomTemplate>` (Layout shell + dangerouslySetInnerHTML).
 *        e. Send via dispatchNotification.
 *   3. Otherwise, dispatch the caller-provided fallback (existing React
 *      Email component) — no behavior change vs. pre-4.5.f for Starter
 *      DSOs or those who haven't customized.
 *
 * Server-only — imports the service-role client. Don't import from a
 * "use client" file.
 */

import type { ReactElement } from "react";
import { dispatchNotification, type DispatchNotificationResult } from "@/lib/notifications/dispatcher";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sanitizeTiptapHtml, htmlToPlainText } from "@/lib/html/sanitize-tiptap";
import { loadCustomTemplate } from "./loader";
import { renderTemplate } from "./renderer";
import { CustomTemplate } from "@/emails/CustomTemplate";
import type { PredefinedTemplateKind } from "./manifest";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

export interface CandidateMergeContext {
  first_name: string;
  full_name: string;
  email: string;
}

export interface JobMergeContext {
  title: string;
  /** Public-facing job URL — fully qualified. */
  url: string;
  location_name?: string | null;
}

export interface CandidateEmailDispatchInput {
  kind: PredefinedTemplateKind;
  dsoId: string;
  recipientUserId: string;
  recipientEmail: string;
  candidate: CandidateMergeContext;
  job: JobMergeContext;
  /**
   * Optional extra namespaces. For "candidate.stage_changed" pass
   * { stage: { from_label, to_label } }. For "application.message_received"
   * pass { message: { preview, thread_url } }.
   */
  extraContext?: Record<string, Record<string, string>>;
  /** Used when no custom template exists (existing React Email component). */
  fallback: {
    subject: string;
    react: ReactElement;
  };
  relatedDsoId?: string | null;
  relatedCandidateId?: string | null;
  replyTo?: string;
  /**
   * Affiliation-MASKED DSO name for the `{{dso.name}}` mergefield. Callers
   * MUST pass this for candidate-facing sends so a masked DSO's corporate
   * name never leaks through a custom template. Falls back to the raw
   * dsos.name only if omitted (audit any caller that does).
   */
  displayDsoName?: string;
}

/**
 * Single entry point for any candidate-facing email that supports custom
 * templates. Replaces direct dispatchNotification() calls at the call sites.
 */
export async function dispatchCandidateEmail(
  input: CandidateEmailDispatchInput
): Promise<DispatchNotificationResult> {
  const custom = await loadCustomTemplate(input.dsoId, input.kind);

  // No custom template → use the caller's fallback. This is the path for
  // Starter DSOs and any Growth+ DSO that hasn't customized yet.
  if (!custom) {
    return dispatchNotification({
      userId: input.recipientUserId,
      eventKind: input.kind,
      relatedDsoId: input.relatedDsoId ?? null,
      relatedCandidateId: input.relatedCandidateId ?? null,
      email: {
        to: input.recipientEmail,
        subject: input.fallback.subject,
        react: input.fallback.react,
        replyTo: input.replyTo,
      },
    });
  }

  // Pull DSO row for `dso.*` mergefields. Service-role bypasses RLS — caller
  // already authorized the original action that triggered this email send.
  const admin = createSupabaseServiceRoleClient();
  const { data: dsoRow } = await admin
    .from("dsos")
    .select("name, slug, contact_cta_url")
    .eq("id", input.dsoId)
    .maybeSingle();

  // Masked name wins — never leak the corporate DSO name to a candidate.
  const dsoName =
    input.displayDsoName ?? (dsoRow?.name as string | undefined) ?? "the hiring team";
  const dsoSlug = (dsoRow?.slug as string | undefined) ?? "";

  const mergeContext: Record<string, Record<string, string>> = {
    candidate: {
      first_name: input.candidate.first_name,
      full_name: input.candidate.full_name,
      email: input.candidate.email,
    },
    job: {
      title: input.job.title,
      location_name: input.job.location_name ?? "",
      url: input.job.url,
    },
    dso: {
      name: dsoName,
      profile_url: dsoSlug ? `${SITE_URL}/companies/${dsoSlug}` : SITE_URL,
      contact_cta_url:
        (dsoRow?.contact_cta_url as string | null | undefined) ?? "",
    },
    ...(input.extraContext ?? {}),
  };

  // Render subject + body. Subject is plain text (no HTML escape); body
  // is HTML and goes through the sanitizer afterward to drop any Tiptap
  // tags that fall outside our allowlist.
  const subjectResult = renderTemplate({
    kind: input.kind,
    template: custom.subject,
    context: mergeContext,
    mode: "subject",
  });
  const bodyResult = renderTemplate({
    kind: input.kind,
    template: custom.body_html,
    context: mergeContext,
    mode: "html",
  });
  const cleanBody = sanitizeTiptapHtml(bodyResult.output);

  // Plain-text preview for the inbox list — strip tags from the rendered body.
  const previewText = htmlToPlainText(bodyResult.output).slice(0, 140);

  return dispatchNotification({
    userId: input.recipientUserId,
    eventKind: input.kind,
    relatedDsoId: input.relatedDsoId ?? null,
    relatedCandidateId: input.relatedCandidateId ?? null,
    email: {
      to: input.recipientEmail,
      subject: subjectResult.output,
      replyTo: input.replyTo,
      react: (
        <CustomTemplate previewText={previewText} bodyHtml={cleanBody} />
      ),
    },
  });
}
