"use server";

/**
 * /employer/settings/pipeline — server actions for the configurable
 * pipeline stages surface (Phase 5A Track B follow-on, 2026-05-12).
 *
 * Every mutation funnels through `getAdminScope()` which enforces three
 * gates in order:
 *
 *   1. Auth        — must be signed in.
 *   2. DSO + role  — must be owner or admin of a DSO (RLS already
 *                    enforces this; we surface a friendly error first).
 *   3. Tier        — must hold an active Growth or Enterprise
 *                    subscription. Defense-in-depth on top of the UI
 *                    disable so a crafted request from Starter can't
 *                    sneak past.
 *
 * RLS on `dso_pipeline_stages` ("Pipeline stages: DSO admin write")
 * already restricts INSERT/UPDATE/DELETE to owner/admin members of the
 * row's DSO — so we use the RLS-gated client, not the service role.
 *
 * "use server" rule: only async exports. Types + constants live in
 * `pipeline-data.ts`.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions/capabilities";
import { getActiveSubscription } from "@/lib/billing/subscription";
import { recordAuditEvent } from "@/lib/audit/record";
import {
  MAX_STAGES_PER_DSO,
  STAGE_COLOR_OPTIONS,
  STAGE_KINDS,
  type StageColorPaletteName,
  type StageKind,
} from "@/lib/applications/stages";
import { PIPELINE_CRUD_TIERS, type PipelineActionResult } from "./pipeline-data";

const TIER_GATE_ERROR =
  "Custom pipeline stages require a Growth or Enterprise subscription.";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

interface AdminScope {
  supabase: SupabaseClient;
  userId: string;
  dsoId: string;
  role: string;
}

type ScopeResult =
  | { ok: true; scope: AdminScope }
  | { ok: false; error: string };

/**
 * Resolve auth → DSO admin → active Growth/Enterprise subscription, in
 * that order. Each gate returns a tailored error so the editor can show
 * the right inline message.
 */
async function getAdminScope(): Promise<ScopeResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in." };
  }

  const { data: dsoUser, error: dsoUserErr } = await supabase
    .from("dso_users")
    .select("dso_id, role, permission_overrides")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (dsoUserErr) {
    console.warn("[settings/pipeline] dso_users lookup failed", dsoUserErr);
    return { ok: false, error: "Couldn't load your DSO context." };
  }
  if (!dsoUser) {
    return { ok: false, error: "No DSO membership found." };
  }
  // #83 Phase 2 — settings.manage capability (was hard owner/admin).
  const role = (dsoUser.role as string) ?? "";
  if (
    !can(
      role,
      (dsoUser as Record<string, unknown>).permission_overrides,
      "settings.manage"
    )
  ) {
    return {
      ok: false,
      error: "You don't have permission to edit pipeline settings.",
    };
  }
  const dsoId = dsoUser.dso_id as string;

  const sub = await getActiveSubscription(supabase, dsoId);
  if (!sub || !PIPELINE_CRUD_TIERS.has(sub.tier)) {
    return { ok: false, error: TIER_GATE_ERROR };
  }

  return {
    ok: true,
    scope: { supabase, userId: user.id, dsoId, role },
  };
}

function isValidColor(value: string | null | undefined): value is StageColorPaletteName | null {
  if (value === null || value === undefined) return true;
  return (STAGE_COLOR_OPTIONS as readonly string[]).includes(value);
}

function isValidKind(value: string): value is StageKind {
  return (STAGE_KINDS as readonly string[]).includes(value);
}

/**
 * Slugify a label: lowercase, replace non-alphanumeric runs with single
 * hyphens, trim leading/trailing hyphens. Resolve conflicts by appending
 * `-2`, `-3`, etc. up to a sane ceiling. Returns the first slug not in
 * `existingSlugs`.
 */
function buildSlug(label: string, existingSlugs: Set<string>): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "stage";
  if (!existingSlugs.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`;
    if (!existingSlugs.has(candidate)) return candidate;
  }
  // Fallback — extremely unlikely, but keeps us correct.
  return `${base}-${Date.now()}`;
}

function bustCaches(): void {
  revalidatePath("/employer/settings/pipeline");
  // Kanban + cross-job inbox + dashboard all pull stages live, so the
  // next render will pick up any rename/recolor/reorder.
  revalidatePath("/employer/jobs/[id]", "layout");
  revalidatePath("/employer/applications", "layout");
  revalidatePath("/employer/dashboard");
}

/* ─────────────────────────────────────────────────────────────
 * addStage
 * ────────────────────────────────────────────────────────── */

export async function addStage(input: {
  kind: string;
  label: string;
  color_class?: string | null;
}): Promise<PipelineActionResult> {
  const gate = await getAdminScope();
  if (!gate.ok) return gate;
  const { supabase, userId, dsoId } = gate.scope;

  if (!isValidKind(input.kind)) {
    return { ok: false, error: "Pick a valid stage kind." };
  }
  const label = input.label.trim();
  if (!label || label.length > 40) {
    return {
      ok: false,
      error: "Label must be between 1 and 40 characters.",
    };
  }
  if (!isValidColor(input.color_class ?? null)) {
    return { ok: false, error: "Pick a color from the palette." };
  }

  // Cap check + pull existing slugs + max sort_order in one round trip.
  const { data: existing, error: existingErr } = await supabase
    .from("dso_pipeline_stages")
    .select("slug, sort_order")
    .eq("dso_id", dsoId);
  if (existingErr) {
    console.warn("[settings/pipeline/addStage] existing lookup", existingErr);
    return { ok: false, error: "Couldn't load existing stages." };
  }
  const rows = (existing ?? []) as Array<{ slug: string; sort_order: number }>;
  if (rows.length >= MAX_STAGES_PER_DSO) {
    return {
      ok: false,
      error: `You've hit the ${MAX_STAGES_PER_DSO}-stage limit. Delete or hide a stage to add a new one.`,
    };
  }
  const slug = buildSlug(label, new Set(rows.map((r) => r.slug)));
  const nextSortOrder =
    rows.reduce((max, r) => Math.max(max, r.sort_order ?? 0), 0) + 10;

  const { data: inserted, error: insertErr } = await supabase
    .from("dso_pipeline_stages")
    .insert({
      dso_id: dsoId,
      kind: input.kind,
      label,
      slug,
      sort_order: nextSortOrder,
      is_hidden: false,
      is_default: false,
      color_class: input.color_class ?? null,
    })
    .select("id")
    .maybeSingle();
  if (insertErr) {
    console.warn("[settings/pipeline/addStage] insert", insertErr);
    return { ok: false, error: "Couldn't add the stage." };
  }

  void recordAuditEvent({
    dsoId,
    actorUserId: userId,
    eventKind: "settings.pipeline_stage_added",
    targetTable: "dso_pipeline_stages",
    targetId: (inserted?.id as string | undefined) ?? null,
    summary: `Added pipeline stage "${label}" (${input.kind})`,
    metadata: { kind: input.kind, label, slug, color: input.color_class ?? null },
  });

  bustCaches();
  return { ok: true };
}

/* ─────────────────────────────────────────────────────────────
 * renameStage
 * ────────────────────────────────────────────────────────── */

export async function renameStage(
  id: string,
  label: string
): Promise<PipelineActionResult> {
  const gate = await getAdminScope();
  if (!gate.ok) return gate;
  const { supabase, userId, dsoId } = gate.scope;

  if (!id) return { ok: false, error: "Missing stage id." };
  const trimmed = label.trim();
  if (!trimmed || trimmed.length > 40) {
    return {
      ok: false,
      error: "Label must be between 1 and 40 characters.",
    };
  }

  // Pull this row + sibling slugs for slug regeneration.
  const { data: row, error: rowErr } = await supabase
    .from("dso_pipeline_stages")
    .select("id, label, slug")
    .eq("id", id)
    .eq("dso_id", dsoId)
    .maybeSingle();
  if (rowErr) {
    console.warn("[settings/pipeline/renameStage] row lookup", rowErr);
    return { ok: false, error: "Couldn't load the stage." };
  }
  if (!row) {
    return { ok: false, error: "Stage not found." };
  }
  const priorLabel = row.label as string;
  if (priorLabel === trimmed) {
    return { ok: true };
  }

  const { data: siblings, error: sibErr } = await supabase
    .from("dso_pipeline_stages")
    .select("slug")
    .eq("dso_id", dsoId)
    .neq("id", id);
  if (sibErr) {
    console.warn("[settings/pipeline/renameStage] siblings lookup", sibErr);
    return { ok: false, error: "Couldn't validate the slug." };
  }
  const slug = buildSlug(
    trimmed,
    new Set(((siblings ?? []) as Array<{ slug: string }>).map((s) => s.slug))
  );

  const { error: updErr } = await supabase
    .from("dso_pipeline_stages")
    .update({ label: trimmed, slug })
    .eq("id", id)
    .eq("dso_id", dsoId);
  if (updErr) {
    console.warn("[settings/pipeline/renameStage] update", updErr);
    return { ok: false, error: "Couldn't rename the stage." };
  }

  void recordAuditEvent({
    dsoId,
    actorUserId: userId,
    eventKind: "settings.pipeline_stage_renamed",
    targetTable: "dso_pipeline_stages",
    targetId: id,
    summary: `Renamed pipeline stage "${priorLabel}" → "${trimmed}"`,
    metadata: { from: priorLabel, to: trimmed },
  });

  bustCaches();
  return { ok: true };
}

/* ─────────────────────────────────────────────────────────────
 * recolorStage
 * ────────────────────────────────────────────────────────── */

export async function recolorStage(
  id: string,
  color_class: string | null
): Promise<PipelineActionResult> {
  const gate = await getAdminScope();
  if (!gate.ok) return gate;
  const { supabase, userId, dsoId } = gate.scope;

  if (!id) return { ok: false, error: "Missing stage id." };
  if (!isValidColor(color_class)) {
    return { ok: false, error: "Pick a color from the palette." };
  }

  const { error: updErr } = await supabase
    .from("dso_pipeline_stages")
    .update({ color_class })
    .eq("id", id)
    .eq("dso_id", dsoId);
  if (updErr) {
    console.warn("[settings/pipeline/recolorStage] update", updErr);
    return { ok: false, error: "Couldn't update the stage color." };
  }

  void recordAuditEvent({
    dsoId,
    actorUserId: userId,
    eventKind: "settings.pipeline_stage_recolored",
    targetTable: "dso_pipeline_stages",
    targetId: id,
    summary: `Recolored pipeline stage (${color_class ?? "default"})`,
    metadata: { color: color_class },
  });

  bustCaches();
  return { ok: true };
}

/* ─────────────────────────────────────────────────────────────
 * setStageHidden
 * ────────────────────────────────────────────────────────── */

export async function setStageHidden(
  id: string,
  isHidden: boolean
): Promise<PipelineActionResult> {
  const gate = await getAdminScope();
  if (!gate.ok) return gate;
  const { supabase, userId, dsoId } = gate.scope;

  if (!id) return { ok: false, error: "Missing stage id." };

  // Pull row + label for audit + to guard against hiding the only
  // remaining stage of a kind that still has applications. We allow
  // hiding the default — applications stay routed by stage_id even if
  // the stage is hidden from kanban; this matches the migration
  // comment "preserves any applications currently in it."
  const { data: row, error: rowErr } = await supabase
    .from("dso_pipeline_stages")
    .select("id, label, kind, is_default")
    .eq("id", id)
    .eq("dso_id", dsoId)
    .maybeSingle();
  if (rowErr) {
    console.warn("[settings/pipeline/setStageHidden] row lookup", rowErr);
    return { ok: false, error: "Couldn't load the stage." };
  }
  if (!row) return { ok: false, error: "Stage not found." };

  // Refuse to hide the last visible stage of a system kind — the
  // kanban + status events still expect every kind to have at least
  // one visible representative.
  if (isHidden) {
    const { data: siblings, error: sibErr } = await supabase
      .from("dso_pipeline_stages")
      .select("id, is_hidden")
      .eq("dso_id", dsoId)
      .eq("kind", row.kind as string)
      .neq("id", id);
    if (sibErr) {
      console.warn("[settings/pipeline/setStageHidden] siblings", sibErr);
      return { ok: false, error: "Couldn't validate the change." };
    }
    const anyVisibleSibling = ((siblings ?? []) as Array<{ is_hidden: boolean }>)
      .some((s) => !s.is_hidden);
    if (!anyVisibleSibling) {
      return {
        ok: false,
        error:
          "Can't hide the only visible stage of this kind. Add another stage of this kind first.",
      };
    }
  }

  const { error: updErr } = await supabase
    .from("dso_pipeline_stages")
    .update({ is_hidden: isHidden })
    .eq("id", id)
    .eq("dso_id", dsoId);
  if (updErr) {
    console.warn("[settings/pipeline/setStageHidden] update", updErr);
    return { ok: false, error: "Couldn't update the stage." };
  }

  void recordAuditEvent({
    dsoId,
    actorUserId: userId,
    eventKind: isHidden
      ? "settings.pipeline_stage_hidden"
      : "settings.pipeline_stage_shown",
    targetTable: "dso_pipeline_stages",
    targetId: id,
    summary: `${isHidden ? "Hid" : "Showed"} pipeline stage "${row.label as string}"`,
    metadata: { is_hidden: isHidden },
  });

  bustCaches();
  return { ok: true };
}

/* ─────────────────────────────────────────────────────────────
 * setStageDefault
 *
 * Promote a row to is_default=true for its (dso_id, kind) — and demote
 * the prior default of the same kind. Two sequential updates is fine:
 * RLS scopes by DSO, and the unique partial index
 * `dso_pipeline_stages_default_idx (dso_id, kind) where is_default`
 * would conflict if we set the new default before clearing the old, so
 * order matters — demote first, then promote.
 * ────────────────────────────────────────────────────────── */

export async function setStageDefault(
  id: string
): Promise<PipelineActionResult> {
  const gate = await getAdminScope();
  if (!gate.ok) return gate;
  const { supabase, userId, dsoId } = gate.scope;

  if (!id) return { ok: false, error: "Missing stage id." };

  const { data: row, error: rowErr } = await supabase
    .from("dso_pipeline_stages")
    .select("id, label, kind, is_default, is_hidden")
    .eq("id", id)
    .eq("dso_id", dsoId)
    .maybeSingle();
  if (rowErr) {
    console.warn("[settings/pipeline/setStageDefault] row lookup", rowErr);
    return { ok: false, error: "Couldn't load the stage." };
  }
  if (!row) return { ok: false, error: "Stage not found." };
  if (row.is_default) return { ok: true };
  if (row.is_hidden) {
    return {
      ok: false,
      error: "Show this stage before promoting it to default.",
    };
  }

  // Demote any existing default for the same kind first.
  const { error: demoteErr } = await supabase
    .from("dso_pipeline_stages")
    .update({ is_default: false })
    .eq("dso_id", dsoId)
    .eq("kind", row.kind as string)
    .eq("is_default", true);
  if (demoteErr) {
    console.warn("[settings/pipeline/setStageDefault] demote", demoteErr);
    return { ok: false, error: "Couldn't update defaults." };
  }

  const { error: promoteErr } = await supabase
    .from("dso_pipeline_stages")
    .update({ is_default: true })
    .eq("id", id)
    .eq("dso_id", dsoId);
  if (promoteErr) {
    console.warn("[settings/pipeline/setStageDefault] promote", promoteErr);
    // Best-effort: try to restore the old default. If even this fails
    // we leave a kind with zero defaults — the BEFORE INSERT trigger
    // on applications will then raise, which is loud and visible.
    return { ok: false, error: "Couldn't promote the stage." };
  }

  void recordAuditEvent({
    dsoId,
    actorUserId: userId,
    eventKind: "settings.pipeline_stage_set_default",
    targetTable: "dso_pipeline_stages",
    targetId: id,
    summary: `Set "${row.label as string}" as default for ${row.kind as string}`,
    metadata: { kind: row.kind, label: row.label },
  });

  bustCaches();
  return { ok: true };
}

/* ─────────────────────────────────────────────────────────────
 * deleteStage
 *
 * Only allowed when:
 *   - The row is not is_default (default rows must be demoted first).
 *   - There is at least one other stage of the same kind on the DSO.
 *   - No applications currently have stage_id = id (the FK is RESTRICT
 *     so the DB would refuse anyway — we pre-check to surface a
 *     friendlier error).
 * ────────────────────────────────────────────────────────── */

export async function deleteStage(
  id: string
): Promise<PipelineActionResult> {
  const gate = await getAdminScope();
  if (!gate.ok) return gate;
  const { supabase, userId, dsoId } = gate.scope;

  if (!id) return { ok: false, error: "Missing stage id." };

  const { data: row, error: rowErr } = await supabase
    .from("dso_pipeline_stages")
    .select("id, label, kind, is_default")
    .eq("id", id)
    .eq("dso_id", dsoId)
    .maybeSingle();
  if (rowErr) {
    console.warn("[settings/pipeline/deleteStage] row lookup", rowErr);
    return { ok: false, error: "Couldn't load the stage." };
  }
  if (!row) return { ok: false, error: "Stage not found." };

  if (row.is_default) {
    return {
      ok: false,
      error:
        "Can't delete the default stage for this kind — promote another stage to default first.",
    };
  }

  // Need at least one other stage of the same kind to remain.
  const { data: siblings, error: sibErr } = await supabase
    .from("dso_pipeline_stages")
    .select("id")
    .eq("dso_id", dsoId)
    .eq("kind", row.kind as string)
    .neq("id", id);
  if (sibErr) {
    console.warn("[settings/pipeline/deleteStage] siblings", sibErr);
    return { ok: false, error: "Couldn't validate the delete." };
  }
  if (((siblings ?? []) as Array<{ id: string }>).length === 0) {
    return {
      ok: false,
      error:
        "Can't delete the only stage of this kind. Add another stage of this kind first.",
    };
  }

  // Pre-check application count for a friendlier error than the FK
  // RESTRICT violation.
  const { count: appCount, error: appErr } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", id);
  if (appErr) {
    console.warn("[settings/pipeline/deleteStage] application count", appErr);
    return { ok: false, error: "Couldn't check applications in this stage." };
  }
  if ((appCount ?? 0) > 0) {
    return {
      ok: false,
      error: `${appCount} application${
        (appCount ?? 0) === 1 ? " is" : "s are"
      } still in this stage — move them or hide the stage instead.`,
    };
  }

  const { error: delErr } = await supabase
    .from("dso_pipeline_stages")
    .delete()
    .eq("id", id)
    .eq("dso_id", dsoId);
  if (delErr) {
    console.warn("[settings/pipeline/deleteStage] delete", delErr);
    return { ok: false, error: "Couldn't delete the stage." };
  }

  void recordAuditEvent({
    dsoId,
    actorUserId: userId,
    eventKind: "settings.pipeline_stage_deleted",
    targetTable: "dso_pipeline_stages",
    targetId: id,
    summary: `Deleted pipeline stage "${row.label as string}" (${row.kind as string})`,
    metadata: { kind: row.kind, label: row.label },
  });

  bustCaches();
  return { ok: true };
}

/* ─────────────────────────────────────────────────────────────
 * reorderStages
 *
 * Bulk sort_order update. Steps of 10 so future inserts can slip
 * between rows without renumbering everything. RLS scopes mutations
 * to this DSO; we also `.eq("dso_id", dsoId)` defensively so a
 * malformed payload can't touch another DSO's rows.
 * ────────────────────────────────────────────────────────── */

export async function reorderStages(
  orderedIds: string[]
): Promise<PipelineActionResult> {
  const gate = await getAdminScope();
  if (!gate.ok) return gate;
  const { supabase, userId, dsoId } = gate.scope;

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: "Nothing to reorder." };
  }
  // Defensive cap so a bogus client can't smash 10k rows.
  if (orderedIds.length > MAX_STAGES_PER_DSO * 2) {
    return { ok: false, error: "Too many stages in the reorder payload." };
  }

  // Sanity: every id should belong to this DSO. One round-trip filter
  // pulls the canonical set; anything in `orderedIds` that's missing
  // gets skipped.
  const { data: rows, error: rowsErr } = await supabase
    .from("dso_pipeline_stages")
    .select("id")
    .eq("dso_id", dsoId);
  if (rowsErr) {
    console.warn("[settings/pipeline/reorderStages] rows lookup", rowsErr);
    return { ok: false, error: "Couldn't load stages to reorder." };
  }
  const valid = new Set(((rows ?? []) as Array<{ id: string }>).map((r) => r.id));
  const filtered = orderedIds.filter((id) => valid.has(id));
  if (filtered.length === 0) {
    return { ok: false, error: "None of those stages are on your DSO." };
  }

  // Two-phase write to dodge any possible unique-index races on
  // sort_order (we don't have one today, but cheap insurance). Phase 1
  // pushes into a high range; phase 2 collapses to clean 0-10-20 steps.
  // Actually unnecessary — sort_order has no unique constraint — so
  // one pass is fine. Fire all updates in parallel via Promise.all.
  const updates = filtered.map((id, idx) =>
    supabase
      .from("dso_pipeline_stages")
      .update({ sort_order: idx * 10 })
      .eq("id", id)
      .eq("dso_id", dsoId)
  );

  const results = await Promise.all(updates);
  const firstError = results.find((r) => r.error)?.error;
  if (firstError) {
    console.warn("[settings/pipeline/reorderStages] update", firstError);
    return { ok: false, error: "Couldn't reorder all stages." };
  }

  void recordAuditEvent({
    dsoId,
    actorUserId: userId,
    eventKind: "settings.pipeline_stages_reordered",
    targetTable: "dso_pipeline_stages",
    summary: `Reordered ${filtered.length} pipeline stage${
      filtered.length === 1 ? "" : "s"
    }`,
    metadata: { ordered_ids: filtered },
  });

  bustCaches();
  return { ok: true };
}
