"use server";

/**
 * Inbox actions (Phase 4.8 — Inbox v0).
 *
 * Three actions, all RLS-aware:
 *   • archiveThread       — soft-hide the thread from the default list.
 *   • unarchiveThread     — drop the archive flag.
 *   • markThreadRead      — bulk flips read_at for every unread message
 *                           from the OTHER side on this application.
 *
 * Per the existing messaging RLS, only application participants can
 * operate on application_messages — the same SELECT policy gates
 * these calls. Archive flag table has its own user-only RLS.
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import type { ThreadNote, ThreadStageStep } from "./types";

type Result =
  | { ok: true }
  | { ok: false; error: string };

async function getUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Please sign in." };
  return { ok: true as const, supabase, user };
}

/* ──────────────────────────────────────────────────────────────
 * Archive
 * ─────────────────────────────────────────────────────────── */

export async function archiveThread(applicationId: string): Promise<Result> {
  if (!applicationId) return { ok: false, error: "Missing application id." };
  const ctx = await getUser();
  if (!ctx.ok) return ctx;

  const { error } = await ctx.supabase
    .from("inbox_archived_threads")
    .upsert(
      {
        auth_user_id: ctx.user.id,
        application_id: applicationId,
      },
      { onConflict: "auth_user_id,application_id" }
    );

  if (error) {
    console.error("[inbox] archiveThread", error);
    return { ok: false, error: "Couldn't archive that thread." };
  }
  revalidatePath("/employer/inbox");
  revalidatePath("/candidate/inbox");
  return { ok: true };
}

export async function unarchiveThread(
  applicationId: string
): Promise<Result> {
  if (!applicationId) return { ok: false, error: "Missing application id." };
  const ctx = await getUser();
  if (!ctx.ok) return ctx;

  const { error } = await ctx.supabase
    .from("inbox_archived_threads")
    .delete()
    .eq("auth_user_id", ctx.user.id)
    .eq("application_id", applicationId);

  if (error) {
    console.error("[inbox] unarchiveThread", error);
    return { ok: false, error: "Couldn't unarchive that thread." };
  }
  revalidatePath("/employer/inbox");
  revalidatePath("/candidate/inbox");
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────
 * Bulk mark-as-read
 *
 * The single-message markMessageAsRead action in src/lib/messages/
 * uses the service-role client to bypass RLS for read_at flips. We
 * follow the same pattern here for the bulk equivalent.
 *
 * Audience determines which sender_role to flip (candidate flips
 * employer-sent rows; employer flips candidate-sent rows). We re-
 * derive the audience from auth context rather than trusting input.
 * ─────────────────────────────────────────────────────────── */

export async function markThreadRead(
  applicationId: string
): Promise<Result> {
  if (!applicationId) return { ok: false, error: "Missing application id." };
  const ctx = await getUser();
  if (!ctx.ok) return ctx;

  // Determine audience from the user's profile state. Candidates have
  // a row in `candidates`; everyone else with a dso_users row is on
  // the employer side. If neither, no-op success.
  const { data: candidate } = await ctx.supabase
    .from("candidates")
    .select("id")
    .eq("auth_user_id", ctx.user.id)
    .maybeSingle();

  let audience: "candidate" | "employer" | null = null;
  if (candidate) {
    audience = "candidate";
  } else {
    const { data: dsoUser } = await ctx.supabase
      .from("dso_users")
      .select("id")
      .eq("auth_user_id", ctx.user.id)
      .maybeSingle();
    if (dsoUser) audience = "employer";
  }
  if (!audience) {
    return { ok: false, error: "Account context missing." };
  }

  // Verify the caller is a participant on this application via RLS-
  // scoped read. If the SELECT returns 0 rows, they can't access this
  // application, so we refuse the bulk flip.
  const { data: appRow } = await ctx.supabase
    .from("applications")
    .select("id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!appRow) {
    return { ok: false, error: "Application not found." };
  }

  const otherSide = audience === "candidate" ? "employer" : "candidate";

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("application_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("application_id", applicationId)
    .eq("sender_role", otherSide)
    .is("read_at", null)
    .is("deleted_at", null);

  if (error) {
    console.error("[inbox] markThreadRead", error);
    return { ok: false, error: "Couldn't mark thread as read." };
  }
  revalidatePath("/employer/inbox");
  revalidatePath("/candidate/inbox");
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────
 * Thread notes (Lane 4 — Conversations 2.0 unified timeline)
 *
 * Internal team notes for the open thread, sourced from the existing
 * `application_comments` table — zero schema change. The request-
 * scoped client enforces RLS (SELECT = DSO members on their own
 * applications), so a candidate calling this gets [] structurally,
 * not by trust. Author names resolve through a second RLS-scoped
 * read on dso_users (same two-step the application detail page uses).
 * ─────────────────────────────────────────────────────────── */

export async function getThreadNotes(
  applicationId: string
): Promise<ThreadNote[]> {
  if (!applicationId) return [];
  const ctx = await getUser();
  if (!ctx.ok) return [];

  // Loader SELECT includes every column the mapper reads (hard rule —
  // untyped client returns null, not an error, on a mismatch).
  const { data: rows, error } = await ctx.supabase
    .from("application_comments")
    .select("id, body, author_dso_user_id, created_at, edited_at")
    .eq("application_id", applicationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[inbox] getThreadNotes", error);
    return [];
  }
  const noteRows = (rows ?? []) as Array<{
    id: string;
    body: string;
    author_dso_user_id: string;
    created_at: string;
    edited_at: string | null;
  }>;
  if (noteRows.length === 0) return [];

  const authorIds = [...new Set(noteRows.map((r) => r.author_dso_user_id))];
  const { data: authors } = await ctx.supabase
    .from("dso_users")
    .select("id, full_name")
    .in("id", authorIds);
  const nameById = new Map(
    ((authors ?? []) as Array<{ id: string; full_name: string | null }>).map(
      (a) => [a.id, a.full_name ?? "Teammate"]
    )
  );

  return noteRows.map((r) => ({
    id: r.id,
    body: r.body,
    created_at: r.created_at,
    edited_at: r.edited_at,
    author_name: nameById.get(r.author_dso_user_id) ?? "Teammate",
  }));
}

/* ──────────────────────────────────────────────────────────────
 * Stage journey (Lane 4 — context rail stepper)
 *
 * Chronological list of pipeline stages this application has ENTERED,
 * from application_status_events (RLS: DSO members only — the rail is
 * employer-side). First-entry-per-kind wins so a bounce back into a
 * stage doesn't duplicate the step. If the trigger never seeded an
 * "open" event (older rows), we synthesize Applied from the
 * application's real created_at — a true date, not an invention.
 * ─────────────────────────────────────────────────────────── */

export async function getThreadStageJourney(
  applicationId: string
): Promise<ThreadStageStep[]> {
  if (!applicationId) return [];
  const ctx = await getUser();
  if (!ctx.ok) return [];

  const [eventsResult, appResult] = await Promise.all([
    ctx.supabase
      .from("application_status_events")
      .select("to_stage_kind, created_at")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: true }),
    ctx.supabase
      .from("applications")
      .select("id, created_at")
      .eq("id", applicationId)
      .maybeSingle(),
  ]);
  if (eventsResult.error) {
    console.error("[inbox] getThreadStageJourney", eventsResult.error);
    return [];
  }

  const steps: ThreadStageStep[] = [];
  const seen = new Set<string>();
  for (const r of (eventsResult.data ?? []) as Array<{
    to_stage_kind: string;
    created_at: string;
  }>) {
    if (seen.has(r.to_stage_kind)) continue;
    seen.add(r.to_stage_kind);
    steps.push({ kind: r.to_stage_kind, at: r.created_at });
  }

  const appCreatedAt =
    ((appResult.data as { created_at?: string } | null)?.created_at as
      | string
      | undefined) ?? null;
  if (!seen.has("open") && appCreatedAt) {
    steps.unshift({ kind: "open", at: appCreatedAt });
  }
  return steps;
}
