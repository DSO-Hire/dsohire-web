"use server";

/**
 * Send a custom (user-defined) email template to the candidate on a
 * specific application. Growth+ only.
 *
 * Flow:
 *   1. Verify the caller is a DSO owner/admin on the application's DSO
 *      and that the DSO is on a Growth+ tier.
 *   2. Load the candidate + job + DSO context needed to render the
 *      template's mergefields.
 *   3. Resolve the candidate's email via auth.users.
 *   4. Render the custom template (subject + body) through the mergefield
 *      renderer + Tiptap sanitizer.
 *   5. Send via sendEmail (writes to email_log) with the kind embedded
 *      in the template identifier.
 *   6. Audit the send via recordAuditEvent.
 *
 * Errors are returned in-band (never thrown) so the client dialog can
 * surface them inline.
 */

import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { dsoCanUseCustomTemplates } from "@/lib/email/templates/tier";
import { renderTemplate } from "@/lib/email/templates/renderer";
import { sanitizeTiptapHtml, htmlToPlainText } from "@/lib/html/sanitize-tiptap";
import { sendEmail } from "@/lib/email/send";
import { CustomTemplate } from "@/emails/CustomTemplate";
import { greetingFirstName } from "@/lib/candidate/name";
import { recordAuditEvent } from "@/lib/audit/record";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

type Result =
  | { ok: true; messageId?: string }
  | { ok: false; error: string };

export async function sendCustomTemplateEmail(input: {
  applicationId: string;
  templateId: string;
}): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  // DSO membership + role check.
  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return { ok: false, error: "No DSO membership found." };
  const role = dsoUser.role as string;
  if (role !== "owner" && role !== "admin") {
    return {
      ok: false,
      error: "Only owners and admins can send custom emails.",
    };
  }
  const dsoId = dsoUser.dso_id as string;

  // Tier gate.
  const tierOk = await dsoCanUseCustomTemplates(supabase, dsoId);
  if (!tierOk) {
    return {
      ok: false,
      error: "Custom email templates are a Growth+ feature.",
    };
  }

  // Load template (must be custom + non-archived + belong to this DSO).
  const { data: template, error: tplErr } = await supabase
    .from("email_templates")
    .select("id, kind, name, subject, body_html, is_custom, is_archived")
    .eq("id", input.templateId)
    .eq("dso_id", dsoId)
    .maybeSingle();
  if (tplErr || !template) {
    return { ok: false, error: "Template not found." };
  }
  if (!(template as { is_custom: boolean }).is_custom) {
    return {
      ok: false,
      error: "Predefined templates send automatically — choose a custom template.",
    };
  }
  if ((template as { is_archived: boolean }).is_archived) {
    return { ok: false, error: "This template has been archived." };
  }

  // Load application first — RLS scopes it to this DSO's jobs so an
  // attacker can't smuggle a foreign applicationId past the action.
  // Candidate + job are pulled as separate hops (per the codebase rule:
  // multi-aliased embed chains in one select blow up Vercel's type-check
  // with a GenericStringError).
  const { data: appRow, error: appErr } = await supabase
    .from("applications")
    .select("id, candidate_id, job_id")
    .eq("id", input.applicationId)
    .maybeSingle();
  if (appErr || !appRow) {
    return { ok: false, error: "Application not found." };
  }

  const [{ data: jobRow }, { data: candRow }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, dso_id")
      .eq("id", (appRow as { job_id: string }).job_id)
      .maybeSingle(),
    supabase
      .from("candidates")
      .select("first_name, full_name, auth_user_id")
      .eq("id", (appRow as { candidate_id: string }).candidate_id)
      .maybeSingle(),
  ]);

  if (!jobRow || (jobRow as { dso_id: string }).dso_id !== dsoId) {
    return { ok: false, error: "Application is not on one of your jobs." };
  }
  const job = jobRow as { id: string; title: string | null; dso_id: string };

  if (!candRow) {
    return { ok: false, error: "Candidate not found." };
  }
  const cand = candRow as {
    first_name: string | null;
    full_name: string | null;
    auth_user_id: string | null;
  };
  if (!cand.auth_user_id) {
    return {
      ok: false,
      error:
        "This candidate doesn't have an account yet (guest application). Reach out by other means.",
    };
  }

  // Look up email + DSO row via service-role.
  const admin = createSupabaseServiceRoleClient();
  const { data: authUserResp, error: authErr } =
    await admin.auth.admin.getUserById(cand.auth_user_id);
  if (authErr || !authUserResp?.user?.email) {
    return { ok: false, error: "Couldn't resolve the candidate's email." };
  }
  const recipientEmail = authUserResp.user.email;

  const { data: dsoRow } = await admin
    .from("dsos")
    .select("name, slug, contact_cta_url")
    .eq("id", dsoId)
    .maybeSingle();

  const dsoName = (dsoRow?.name as string | undefined) ?? "the hiring team";
  const dsoSlug = (dsoRow?.slug as string | undefined) ?? "";

  const firstName = greetingFirstName({
    first_name: cand.first_name,
    full_name: cand.full_name,
  });
  const fullName = cand.full_name ?? firstName;
  const jobTitle = job.title ?? "the role";
  const jobUrl = `${SITE_URL}/jobs/${job.id}`;

  // Build merge context — same shape dispatchCandidateEmail uses for
  // custom templates, restricted to candidate/job/dso namespaces.
  const mergeContext: Record<string, Record<string, string>> = {
    candidate: {
      first_name: firstName,
      full_name: fullName,
      email: recipientEmail,
    },
    job: {
      title: jobTitle,
      url: jobUrl,
    },
    dso: {
      name: dsoName,
      profile_url: dsoSlug ? `${SITE_URL}/companies/${dsoSlug}` : SITE_URL,
      contact_cta_url:
        (dsoRow?.contact_cta_url as string | null | undefined) ?? "",
    },
  };

  const kind = (template as { kind: string }).kind;
  const subjectResult = renderTemplate({
    kind,
    template: (template as { subject: string }).subject,
    context: mergeContext,
    mode: "subject",
  });
  const bodyResult = renderTemplate({
    kind,
    template: (template as { body_html: string }).body_html,
    context: mergeContext,
    mode: "html",
  });
  const cleanBody = sanitizeTiptapHtml(bodyResult.output);
  const previewText = htmlToPlainText(bodyResult.output).slice(0, 140);

  const sendResult = await sendEmail({
    to: recipientEmail,
    subject: subjectResult.output,
    template: kind, // shows up in email_log; e.g. "custom.interview-prep"
    react: CustomTemplate({ previewText, bodyHtml: cleanBody }),
    relatedDsoId: dsoId,
    relatedCandidateId: cand.auth_user_id,
  });

  if (!sendResult.ok) {
    return {
      ok: false,
      error: sendResult.error ?? "Couldn't send the email.",
    };
  }

  // Audit log — surfaces in the DSO's activity feed.
  void recordAuditEvent({
    dsoId,
    actorUserId: user.id,
    eventKind: "application.custom_email_sent",
    targetTable: "applications",
    targetId: input.applicationId,
    summary: `Sent "${(template as { name: string | null }).name ?? "custom template"}" to ${fullName} about ${jobTitle}`,
    metadata: {
      application_id: input.applicationId,
      template_id: input.templateId,
      template_kind: kind,
      template_name: (template as { name: string | null }).name,
      subject: subjectResult.output,
      recipient_email: recipientEmail,
      message_id: sendResult.messageId ?? null,
    },
  });

  return { ok: true, messageId: sendResult.messageId };
}
