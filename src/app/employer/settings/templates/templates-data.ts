/**
 * /employer/settings/templates — shared types (Phase 4.5.f).
 *
 * Lives separately from actions.ts so the "use server" file only exports
 * async functions (per feedback_use_server_only_async.md).
 */

import type { PredefinedTemplateKind } from "@/lib/email/templates/manifest";

export interface TemplateInitial {
  kind: PredefinedTemplateKind;
  /** True when a custom row exists in email_templates for this DSO + kind. */
  isCustom: boolean;
  subject: string;
  body_html: string;
  /** ISO timestamp when last customized; null when on system default. */
  updatedAt: string | null;
}
