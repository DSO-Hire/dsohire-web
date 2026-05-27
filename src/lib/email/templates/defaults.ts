/**
 * System default templates (Phase 4.5.f).
 *
 * These are the "out of the box" subject + body strings the editor pre-fills
 * when a DSO opens a template they haven't customized yet. They mirror the
 * voice + structure of the existing React Email components but expressed as
 * Tiptap-compatible HTML with mergefield tokens.
 *
 * Important: dispatch-time fallback (when no custom template exists OR the
 * DSO isn't on Growth+) uses the React Email components directly — these
 * defaults are NOT part of the dispatch path. They exist purely so the
 * editor can show "this is what the system sends today, edit to taste."
 */

import type { PredefinedTemplateKind } from "./manifest";

export interface DefaultTemplate {
  subject: string;
  body_html: string;
}

export const DEFAULT_TEMPLATES: Record<PredefinedTemplateKind, DefaultTemplate> = {
  "candidate.application_received": {
    subject:
      "Your application for {{job.title}} at {{dso.name}} was received",
    body_html: `<p>Hi {{candidate.first_name}},</p>
<p>Your application for <strong>{{job.title}}</strong> at <strong>{{dso.name}}</strong> was successfully submitted. We'll email you when the hiring team reviews it or moves it forward.</p>
<p>You can track this application — and apply to future roles in one click — from your candidate dashboard.</p>
<p>Questions about this application? Reply to this email and we'll route it to the {{dso.name}} team.</p>`,
  },
  "application.message_received": {
    subject:
      "New message about your application for {{job.title}}",
    body_html: `<p>Hi {{candidate.first_name}},</p>
<p>The hiring team at <strong>{{dso.name}}</strong> sent you a message about your application for <strong>{{job.title}}</strong>:</p>
<blockquote>{{message.preview}}</blockquote>
<p>Reply on DSO Hire to keep the conversation tied to your application.</p>`,
  },
  "candidate.stage_changed": {
    subject:
      "Update on your application for {{job.title}}",
    body_html: `<p>Hi {{candidate.first_name}},</p>
<p>Quick update on your application for <strong>{{job.title}}</strong> at <strong>{{dso.name}}</strong>: it moved from <strong>{{stage.from_label}}</strong> to <strong>{{stage.to_label}}</strong>.</p>
<p>You can see the full status in your candidate dashboard.</p>`,
  },
};
