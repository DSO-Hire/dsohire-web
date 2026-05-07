"use server";

/**
 * Employer Data & Deletion server actions (Phase 4.5.g).
 *
 *   • exportOrgData       — owner-only ZIP export of every DSO-owned row
 *                           + storage-attached files (logos, photos,
 *                           location logos). Includes job postings,
 *                           applications, screening responses, comments,
 *                           scorecards, status events, team, locations,
 *                           email templates, subscription history.
 *
 *   • softDeleteOrg       — owner-only. Sets dsos.deleted_at,
 *                           cancels Stripe subscription if active,
 *                           signs the user out. Restore-on-sign-in
 *                           handled by /employer/restore.
 *
 * Owner-only enforcement at the server-action layer; the UI also hides
 * these surfaces from non-owners but the action is the source of truth.
 */

import { redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import {
  buildExportZip,
  extFromStoragePath,
  exportTimestamp,
  type ZipFile,
} from "@/lib/data-export/build-zip";
import { getStripe } from "@/lib/stripe/server";

const SOFT_DELETE_GRACE_DAYS = 30;

/* ──────────────────────────────────────────────────────────────
 * Shared helpers
 * ─────────────────────────────────────────────────────────── */

interface OwnerContext {
  ok: true;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  user: { id: string; email: string | null };
  dsoId: string;
  dsoName: string;
}

async function getOwnerContext(): Promise<
  OwnerContext | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!dsoUser) {
    return { ok: false, error: "No team membership found for this account." };
  }
  if ((dsoUser as Record<string, unknown>).role !== "owner") {
    return {
      ok: false,
      error: "Only the DSO owner can export or delete the organization.",
    };
  }

  const dsoId = (dsoUser as Record<string, unknown>).dso_id as string;
  const { data: dso } = await supabase
    .from("dsos")
    .select("name")
    .eq("id", dsoId)
    .maybeSingle();

  return {
    ok: true,
    supabase,
    user: { id: user.id, email: user.email ?? null },
    dsoId,
    dsoName: (dso?.name as string | null) ?? "this DSO",
  };
}

function parseStoragePath(url: string, bucket: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const bucketIdx = parts.indexOf(bucket);
    if (bucketIdx < 0) return null;
    const rest = parts.slice(bucketIdx + 1);
    if (rest.length === 0) return null;
    return rest.join("/");
  } catch {
    return null;
  }
}

/* ──────────────────────────────────────────────────────────────
 * Export
 * ─────────────────────────────────────────────────────────── */

export type ExportOrgResult =
  | {
      ok: true;
      zipBytes: ArrayBuffer;
      filename: string;
      fetchFailures: Array<{ pathInZip: string; reason: string }>;
    }
  | { ok: false; error: string };

export async function exportOrgData(): Promise<ExportOrgResult> {
  const ctx = await getOwnerContext();
  if (!ctx.ok) return ctx;

  const { supabase, dsoId } = ctx;

  // Pull every owned table in parallel. RLS already restricts most of
  // these to the owner's DSO; the explicit dso_id filter is belt-and-
  // suspenders.
  const [
    dso,
    locations,
    photos,
    jobs,
    jobLocations,
    jobScreeningQuestions,
    jobSkills,
    teamMembers,
    invitations,
    locationAssignments,
    applications,
    applicationAnswers,
    applicationComments,
    applicationScorecards,
    applicationStatusEvents,
    applicationMessages,
    emailTemplates,
    subscriptions,
    invoices,
    slugHistory,
  ] = await Promise.all([
    supabase.from("dsos").select("*").eq("id", dsoId).maybeSingle()
      .then((r) => r.data),
    supabase
      .from("dso_locations")
      .select("*")
      .eq("dso_id", dsoId)
      .then((r) => r.data ?? []),
    supabase
      .from("dso_photos")
      .select("*")
      .eq("dso_id", dsoId)
      .then((r) => r.data ?? []),
    supabase
      .from("jobs")
      .select("*")
      .eq("dso_id", dsoId)
      .then((r) => r.data ?? []),
    supabase
      .from("job_locations")
      .select("*, jobs:jobs!inner(dso_id)")
      .eq("jobs.dso_id", dsoId)
      .then((r) => r.data ?? []),
    supabase
      .from("job_screening_questions")
      .select("*, jobs:jobs!inner(dso_id)")
      .eq("jobs.dso_id", dsoId)
      .then((r) => r.data ?? []),
    supabase
      .from("job_skills")
      .select("*, jobs:jobs!inner(dso_id)")
      .eq("jobs.dso_id", dsoId)
      .then((r) => r.data ?? []),
    supabase
      .from("dso_users")
      .select("auth_user_id, role, full_name, created_at")
      .eq("dso_id", dsoId)
      .then((r) => r.data ?? []),
    supabase
      .from("dso_invitations")
      .select("*")
      .eq("dso_id", dsoId)
      .then((r) => r.data ?? []),
    supabase
      .from("dso_user_locations")
      .select("*, dso_users:dso_users!inner(dso_id)")
      .eq("dso_users.dso_id", dsoId)
      .then((r) => r.data ?? []),
    supabase
      .from("applications")
      .select("*, jobs:jobs!inner(dso_id)")
      .eq("jobs.dso_id", dsoId)
      .then((r) => r.data ?? []),
    supabase
      .from("application_question_answers")
      .select("*, applications:applications!inner(job_id, jobs:jobs!inner(dso_id))")
      .eq("applications.jobs.dso_id", dsoId)
      .then((r) => r.data ?? []),
    supabase
      .from("application_comments")
      .select("*, applications:applications!inner(job_id, jobs:jobs!inner(dso_id))")
      .eq("applications.jobs.dso_id", dsoId)
      .then((r) => r.data ?? []),
    supabase
      .from("application_scorecards")
      .select("*, applications:applications!inner(job_id, jobs:jobs!inner(dso_id))")
      .eq("applications.jobs.dso_id", dsoId)
      .then((r) => r.data ?? []),
    supabase
      .from("application_status_events")
      .select("*, applications:applications!inner(job_id, jobs:jobs!inner(dso_id))")
      .eq("applications.jobs.dso_id", dsoId)
      .then((r) => r.data ?? []),
    supabase
      .from("application_messages")
      .select("*, applications:applications!inner(job_id, jobs:jobs!inner(dso_id))")
      .eq("applications.jobs.dso_id", dsoId)
      .then((r) => r.data ?? []),
    supabase
      .from("email_templates")
      .select("*")
      .eq("dso_id", dsoId)
      .then((r) => r.data ?? []),
    supabase
      .from("subscriptions")
      .select("*")
      .eq("dso_id", dsoId)
      .then((r) => r.data ?? []),
    supabase
      .from("invoices")
      .select("*")
      .eq("dso_id", dsoId)
      .then((r) => r.data ?? []),
    supabase
      .from("dso_slug_history")
      .select("*")
      .eq("dso_id", dsoId)
      .then((r) => r.data ?? []),
  ]);

  // Build the file list. Every brand image lives in the single
  // `public-images` bucket under <auth_user_id>/<purpose>/<file>; we
  // parse the public URL stored on each row to recover the storage path.
  const files: ZipFile[] = [];
  const IMAGE_BUCKET = "public-images";

  const dsoRow = dso as Record<string, unknown> | null;
  const dsoLogoUrl = dsoRow?.logo_url as string | null;
  if (dsoLogoUrl) {
    const p = parseStoragePath(dsoLogoUrl, IMAGE_BUCKET);
    if (p) {
      const ext = extFromStoragePath(p) || "png";
      files.push({
        pathInZip: `dso-logo.${ext}`,
        bucket: IMAGE_BUCKET,
        storagePath: p,
      });
    }
  }

  const dsoBannerUrl = dsoRow?.banner_url as string | null;
  if (dsoBannerUrl) {
    const p = parseStoragePath(dsoBannerUrl, IMAGE_BUCKET);
    if (p) {
      const ext = extFromStoragePath(p) || "jpg";
      files.push({
        pathInZip: `dso-banner.${ext}`,
        bucket: IMAGE_BUCKET,
        storagePath: p,
      });
    }
  }

  for (const [i, loc] of (
    locations as Array<Record<string, unknown>>
  ).entries()) {
    const url = loc.logo_url as string | null;
    if (!url) continue;
    const p = parseStoragePath(url, IMAGE_BUCKET);
    if (!p) continue;
    const ext = extFromStoragePath(p) || "png";
    const safeName = String(loc.name ?? `location-${i + 1}`)
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 60);
    files.push({
      pathInZip: `location-logos/${String(i + 1).padStart(2, "0")}-${safeName}.${ext}`,
      bucket: IMAGE_BUCKET,
      storagePath: p,
    });
  }

  for (const [i, photo] of (
    photos as Array<Record<string, unknown>>
  ).entries()) {
    const url = photo.image_url as string | null;
    if (!url) continue;
    const p = parseStoragePath(url, IMAGE_BUCKET);
    if (!p) continue;
    const ext = extFromStoragePath(p) || "jpg";
    files.push({
      pathInZip: `dso-photos/${String(i + 1).padStart(2, "0")}.${ext}`,
      bucket: IMAGE_BUCKET,
      storagePath: p,
    });
  }

  const payload = {
    exported_at: new Date().toISOString(),
    exported_by: ctx.user.email ?? ctx.user.id,
    format_version: 1,
    organization: dso,
    locations,
    photos,
    jobs,
    job_locations: jobLocations,
    job_screening_questions: jobScreeningQuestions,
    job_skills: jobSkills,
    team_members: teamMembers,
    invitations,
    team_member_locations: locationAssignments,
    applications,
    application_question_answers: applicationAnswers,
    application_comments: applicationComments,
    application_scorecards: applicationScorecards,
    application_status_events: applicationStatusEvents,
    application_messages: applicationMessages,
    email_templates: emailTemplates,
    subscriptions,
    invoices,
    slug_history: slugHistory,
    notes:
      "This export contains every row tied to your DSO Hire organization, " +
      "plus brand logos and DSO photos. Resume files belong to the candidates " +
      "who uploaded them — those are downloadable from each candidate's own " +
      "settings, not from the org-level export. Email cam@dsohire.com if you " +
      "need a more comprehensive export.",
  };

  const readme = [
    "DSO Hire — your organization data export",
    `Exported: ${payload.exported_at}`,
    `Organization: ${ctx.dsoName}`,
    `Exported by: ${payload.exported_by}`,
    "",
    "Contents:",
    "  data.json              — every row tied to your organization",
    "  dso-logo.<ext>         — your DSO brand logo (if set)",
    "  location-logos/        — per-location logo overrides (if any)",
    "  dso-photos/            — your public DSO profile photo gallery",
    "",
    "Excluded: candidate-uploaded resumes (those are owned by candidates;",
    "they have their own export at /candidate/settings/data).",
    "",
    "Questions? Email cam@dsohire.com.",
  ].join("\n");

  const { blob, fetchFailures } = await buildExportZip(supabase, {
    data: payload as unknown as Record<string, unknown>,
    files,
    readme,
  });

  const zipBytes = await blob.arrayBuffer();
  const filename = `dsohire-org-export-${exportTimestamp()}.zip`;
  return { ok: true, zipBytes, filename, fetchFailures };
}

/* ──────────────────────────────────────────────────────────────
 * Soft-delete the DSO + cancel Stripe
 * ─────────────────────────────────────────────────────────── */

export type DeleteOrgResult =
  | { ok: true; deletedAt: string; hardDeleteOn: string }
  | { ok: false; error: string };

export async function softDeleteOrg(input: {
  confirmation: string;
  dsoNameTyped: string;
}): Promise<DeleteOrgResult> {
  if (input.confirmation.trim().toUpperCase() !== "DELETE") {
    return { ok: false, error: "Type DELETE to confirm." };
  }

  const ctx = await getOwnerContext();
  if (!ctx.ok) return ctx;

  if (
    input.dsoNameTyped.trim().toLowerCase() !== ctx.dsoName.trim().toLowerCase()
  ) {
    return {
      ok: false,
      error: `Type the DSO name "${ctx.dsoName}" to confirm.`,
    };
  }

  const now = new Date();

  // Cancel the Stripe subscription FIRST so the customer isn't billed
  // for an org that's about to be deleted. We use the service-role
  // client to read the subscription row (RLS may block a direct
  // owner-side read of subscription detail) and the Stripe SDK to
  // cancel.
  const admin = createSupabaseServiceRoleClient();
  const { data: subRow } = await admin
    .from("subscriptions")
    .select("id, stripe_subscription_id, status")
    .eq("dso_id", ctx.dsoId)
    .maybeSingle();

  const stripeSubId = (subRow as Record<string, unknown> | null)
    ?.stripe_subscription_id as string | null;

  if (stripeSubId && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = getStripe();
      // Cancel at-period-end so the org keeps the rest of its paid
      // window if they restore. Hard-delete cron does the immediate
      // .cancel() at the 30-day mark.
      await stripe.subscriptions.update(stripeSubId, {
        cancel_at_period_end: true,
      });
    } catch (err) {
      console.error("[employer/data] Stripe cancel_at_period_end", err);
      // Don't fail the soft-delete on a Stripe error; the cron will
      // handle it at hard-delete time.
    }
  }

  const { error } = await ctx.supabase
    .from("dsos")
    .update({ deleted_at: now.toISOString() })
    .eq("id", ctx.dsoId);

  if (error) {
    console.error("[employer/data] softDeleteOrg", error);
    return {
      ok: false,
      error: "Couldn't schedule deletion. Email cam@dsohire.com if this persists.",
    };
  }

  await ctx.supabase.auth.signOut();

  const hardDeleteOn = new Date(
    now.getTime() + SOFT_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000
  );
  return {
    ok: true,
    deletedAt: now.toISOString(),
    hardDeleteOn: hardDeleteOn.toISOString(),
  };
}

/* ──────────────────────────────────────────────────────────────
 * Convenience: redirect-on-sign-out from the deleted state
 * ─────────────────────────────────────────────────────────── */

export async function signOutFromOrg(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/employer/sign-in");
}
