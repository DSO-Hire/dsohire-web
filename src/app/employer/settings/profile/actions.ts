"use server";

/**
 * /employer/settings/profile server actions (Phase 4.5.d).
 *
 * One server action per section card on the public profile editor.
 * Mirrors the candidate-profile (4.2.b) and job-edit (4.7.b) patterns:
 *
 *   - upsertSlug              — slug edit + redirect history (trigger-driven)
 *   - upsertAbout             — mission + description (Tiptap HTML)
 *   - setDsoBannerUrl         — auto-save when <ImageUpload> finishes
 *   - upsertPhoto / deletePhoto / reorderPhotos
 *   - upsertWhyJoinUs         — replace the JSONB array in one shot
 *   - upsertCulture           — chips[] + brand_color
 *   - upsertContactCta        — label + URL pair
 *
 * The slug-history insert is handled by the dsos_slug_history_trg trigger
 * shipped in 20260506000014 — actions just UPDATE dsos.slug after the
 * uniqueness check.
 *
 * RLS layer is the source of truth (only DSO admins can write); we still
 * gate on auth + DSO admin status in the action layer for clean error UX.
 *
 * "use server" rule: only async functions exported here. Constants live
 * in profile-data.ts. (See feedback_use_server_only_async.md.)
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions/capabilities";
import { recordAuditEvent } from "@/lib/audit/record";
import {
  ALL_CULTURE_CHIPS,
  MAX_CULTURE_CHIPS,
} from "@/lib/dso-profile/culture-chips";
import type { WhyJoinUsBlock } from "./profile-data";

type Result =
  | { ok: true }
  | { ok: false; error: string };

/* ──────────────────────────────────────────────────────────────
 * Auth + DSO admin context (used by every action)
 * ─────────────────────────────────────────────────────────── */

async function getDsoAdminContext() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, error: "Please sign in." };
  }

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role, permission_overrides")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!dsoUser) {
    return { ok: false as const, error: "No DSO membership found." };
  }

  // #83 Phase 2 — settings.manage capability (was hard owner/admin; RLS
  // is_dso_admin() stays as the coarse floor underneath).
  const role = dsoUser.role as string;
  if (
    !can(
      role,
      (dsoUser as Record<string, unknown>).permission_overrides,
      "settings.manage"
    )
  ) {
    return {
      ok: false as const,
      error: "You don't have permission to edit the public profile.",
    };
  }

  return {
    ok: true as const,
    supabase,
    user,
    dsoId: dsoUser.dso_id as string,
  };
}

/** Common revalidation set: editor surface + public profile + cards that show DSO chrome. */
async function revalidateProfileSurfaces(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  dsoId: string
) {
  revalidatePath("/employer/settings/profile");
  revalidatePath("/employer/dashboard");

  const { data: dso } = await supabase
    .from("dsos")
    .select("slug")
    .eq("id", dsoId)
    .maybeSingle();
  if (dso?.slug) {
    revalidatePath(`/companies/${dso.slug as string}`);
    revalidatePath("/companies");
  }
}

/* ──────────────────────────────────────────────────────────────
 * Slug
 * ─────────────────────────────────────────────────────────── */

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/;
const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "auth",
  "candidate",
  "candidates",
  "companies",
  "company",
  "employer",
  "employers",
  "jobs",
  "login",
  "signup",
  "signin",
  "settings",
  "support",
  "help",
  "about",
  "pricing",
  "blog",
  "legal",
  "for-employers",
  "for-candidates",
  "dashboard",
  "billing",
  "team",
  "locations",
  "applications",
]);

/* ──────────────────────────────────────────────────────────────
 * DSO name (owner/admin only — see getDsoAdminContext)
 * ─────────────────────────────────────────────────────────── */

const DSO_NAME_MAX = 100;

/**
 * Edit the DSO's display name. Previously fixed at sign-up, which stranded
 * any typo / wrong casing entered during onboarding (it renders live in
 * every candidate email, the public careers page, and company listings).
 * Owner/admin only (getDsoAdminContext); decoupled from the slug so a name
 * fix never breaks shared careers-page URLs. Audited.
 */
export async function updateDsoName(input: { name: string }): Promise<Result> {
  const ctx = await getDsoAdminContext();
  if (!ctx.ok) return ctx;

  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) {
    return { ok: false, error: "Enter your DSO's name (at least 2 characters)." };
  }
  if (name.length > DSO_NAME_MAX) {
    return {
      ok: false,
      error: `Name is too long (${DSO_NAME_MAX} character max).`,
    };
  }

  // Snapshot the prior name for the audit trail + no-op short-circuit.
  const { data: prior } = await ctx.supabase
    .from("dsos")
    .select("name")
    .eq("id", ctx.dsoId)
    .maybeSingle();
  const priorName = (prior?.name as string | null) ?? null;
  if (priorName === name) return { ok: true };

  const { error } = await ctx.supabase
    .from("dsos")
    .update({ name })
    .eq("id", ctx.dsoId);
  if (error) {
    console.error("[profile/updateDsoName]", error);
    return { ok: false, error: "Couldn't save the name." };
  }

  // Awaited (not void) so the audit reliably lands on Vercel.
  await recordAuditEvent({
    dsoId: ctx.dsoId,
    actorUserId: ctx.user.id,
    eventKind: "dso.name_changed",
    targetTable: "dsos",
    targetId: ctx.dsoId,
    summary: priorName
      ? `Renamed DSO from "${priorName}" to "${name}"`
      : `Set DSO name to "${name}"`,
    metadata: { from: priorName, to: name },
  });

  await revalidateProfileSurfaces(ctx.supabase, ctx.dsoId);
  return { ok: true };
}

export async function upsertSlug(input: { slug: string }): Promise<Result> {
  const ctx = await getDsoAdminContext();
  if (!ctx.ok) return ctx;

  const slug = input.slug.trim().toLowerCase();
  if (!SLUG_REGEX.test(slug)) {
    return {
      ok: false,
      error:
        "Slugs use lowercase letters, numbers, and hyphens (3–60 chars, no leading/trailing hyphen).",
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: "That slug is reserved. Try another." };
  }

  // Uniqueness check against active dsos (other rows). Conflict path returns
  // a friendlier error than a raw 23505.
  const { data: existing } = await ctx.supabase
    .from("dsos")
    .select("id")
    .eq("slug", slug)
    .neq("id", ctx.dsoId)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error: "That slug is already in use by another DSO.",
    };
  }

  // Trigger dsos_slug_history_trg captures the OLD slug into dso_slug_history.
  const { error } = await ctx.supabase
    .from("dsos")
    .update({ slug })
    .eq("id", ctx.dsoId);

  if (error) {
    console.error("[profile/upsertSlug]", error);
    return { ok: false, error: "Couldn't save the slug." };
  }

  await revalidateProfileSurfaces(ctx.supabase, ctx.dsoId);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────
 * About — mission + description (Tiptap HTML)
 * ─────────────────────────────────────────────────────────── */

export async function upsertAbout(input: {
  mission: string | null;
  description: string | null;
}): Promise<Result> {
  const ctx = await getDsoAdminContext();
  if (!ctx.ok) return ctx;

  const mission = input.mission?.trim() ? input.mission.trim() : null;
  const description = input.description?.trim() ? input.description.trim() : null;

  if (mission && mission.length > 400) {
    return { ok: false, error: "Mission must be 400 characters or fewer." };
  }
  if (description && description.length > 20000) {
    return {
      ok: false,
      error: "Description is unusually long — keep it under ~20K characters.",
    };
  }

  const { error } = await ctx.supabase
    .from("dsos")
    .update({ mission, description })
    .eq("id", ctx.dsoId);

  if (error) {
    console.error("[profile/upsertAbout]", error);
    return { ok: false, error: "Couldn't save the About section." };
  }

  await revalidateProfileSurfaces(ctx.supabase, ctx.dsoId);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────
 * Visuals — banner (logo persists via existing setDsoLogoUrl)
 * ─────────────────────────────────────────────────────────── */

export async function setDsoBannerUrl(
  url: string | null
): Promise<Result> {
  const ctx = await getDsoAdminContext();
  if (!ctx.ok) return ctx;

  const { error } = await ctx.supabase
    .from("dsos")
    .update({ banner_url: url })
    .eq("id", ctx.dsoId);

  if (error) {
    console.error("[profile/setDsoBannerUrl]", error);
    return { ok: false, error: "Couldn't save the banner." };
  }

  await revalidateProfileSurfaces(ctx.supabase, ctx.dsoId);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────
 * Photos
 * ─────────────────────────────────────────────────────────── */

const MAX_PHOTOS = 6;

export async function addPhoto(input: {
  storage_url: string;
  caption: string | null;
}): Promise<Result> {
  const ctx = await getDsoAdminContext();
  if (!ctx.ok) return ctx;

  const { count } = await ctx.supabase
    .from("dso_photos")
    .select("id", { count: "exact", head: true })
    .eq("dso_id", ctx.dsoId);

  if ((count ?? 0) >= MAX_PHOTOS) {
    return {
      ok: false,
      error: `You've hit the ${MAX_PHOTOS}-photo cap. Remove one first.`,
    };
  }

  const { error } = await ctx.supabase.from("dso_photos").insert({
    dso_id: ctx.dsoId,
    storage_url: input.storage_url,
    caption: input.caption?.trim() || null,
    sort_order: count ?? 0,
  });

  if (error) {
    console.error("[profile/addPhoto]", error);
    return { ok: false, error: "Couldn't add the photo." };
  }

  await revalidateProfileSurfaces(ctx.supabase, ctx.dsoId);
  return { ok: true };
}

export async function updatePhotoCaption(input: {
  photo_id: string;
  caption: string | null;
}): Promise<Result> {
  const ctx = await getDsoAdminContext();
  if (!ctx.ok) return ctx;

  const { error } = await ctx.supabase
    .from("dso_photos")
    .update({ caption: input.caption?.trim() || null })
    .eq("id", input.photo_id)
    .eq("dso_id", ctx.dsoId);

  if (error) {
    console.error("[profile/updatePhotoCaption]", error);
    return { ok: false, error: "Couldn't save the caption." };
  }

  await revalidateProfileSurfaces(ctx.supabase, ctx.dsoId);
  return { ok: true };
}

export async function deletePhoto(input: {
  photo_id: string;
}): Promise<Result> {
  const ctx = await getDsoAdminContext();
  if (!ctx.ok) return ctx;

  const { error } = await ctx.supabase
    .from("dso_photos")
    .delete()
    .eq("id", input.photo_id)
    .eq("dso_id", ctx.dsoId);

  if (error) {
    console.error("[profile/deletePhoto]", error);
    return { ok: false, error: "Couldn't remove the photo." };
  }

  await revalidateProfileSurfaces(ctx.supabase, ctx.dsoId);
  return { ok: true };
}

export async function reorderPhotos(input: {
  photo_ids: string[];
}): Promise<Result> {
  const ctx = await getDsoAdminContext();
  if (!ctx.ok) return ctx;

  // Sequential UPDATEs is fine for max-6 rows. Locked pattern for bulk
  // ordering — see project_bulk_actions_shipped_2026_05_04.md.
  for (let i = 0; i < input.photo_ids.length; i++) {
    const { error } = await ctx.supabase
      .from("dso_photos")
      .update({ sort_order: i })
      .eq("id", input.photo_ids[i])
      .eq("dso_id", ctx.dsoId);
    if (error) {
      console.error("[profile/reorderPhotos]", error);
      return { ok: false, error: "Couldn't save photo order." };
    }
  }

  await revalidateProfileSurfaces(ctx.supabase, ctx.dsoId);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────
 * Why Join Us blocks (replace the whole array atomically)
 * ─────────────────────────────────────────────────────────── */

const MAX_WHY_BLOCKS = 6;
const MAX_BLOCK_TITLE = 80;
const MAX_BLOCK_BODY = 600;

export async function upsertWhyJoinUs(input: {
  blocks: WhyJoinUsBlock[];
}): Promise<Result> {
  const ctx = await getDsoAdminContext();
  if (!ctx.ok) return ctx;

  if (input.blocks.length > MAX_WHY_BLOCKS) {
    return {
      ok: false,
      error: `Up to ${MAX_WHY_BLOCKS} "Why join us" blocks.`,
    };
  }

  // Trim + drop empties; reject if any remaining row has only one of the two
  // fields (forces a complete row or no row).
  const cleaned: WhyJoinUsBlock[] = [];
  for (const b of input.blocks) {
    const title = b.title.trim();
    const body = b.body.trim();
    if (!title && !body) continue;
    if (!title || !body) {
      return {
        ok: false,
        error: "Each block needs both a title and a body.",
      };
    }
    if (title.length > MAX_BLOCK_TITLE) {
      return {
        ok: false,
        error: `Block titles stay under ${MAX_BLOCK_TITLE} characters.`,
      };
    }
    if (body.length > MAX_BLOCK_BODY) {
      return {
        ok: false,
        error: `Block bodies stay under ${MAX_BLOCK_BODY} characters.`,
      };
    }
    cleaned.push({ title, body });
  }

  const { error } = await ctx.supabase
    .from("dsos")
    .update({ why_join_us: cleaned })
    .eq("id", ctx.dsoId);

  if (error) {
    console.error("[profile/upsertWhyJoinUs]", error);
    return { ok: false, error: "Couldn't save the Why-join-us section." };
  }

  await revalidateProfileSurfaces(ctx.supabase, ctx.dsoId);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────
 * Brand & Culture (chips + accent color)
 * ─────────────────────────────────────────────────────────── */

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

export async function upsertBrandAndCulture(input: {
  culture_chips: string[];
  brand_color: string | null;
}): Promise<Result> {
  const ctx = await getDsoAdminContext();
  if (!ctx.ok) return ctx;

  if (input.culture_chips.length > MAX_CULTURE_CHIPS) {
    return {
      ok: false,
      error: `Up to ${MAX_CULTURE_CHIPS} culture chips.`,
    };
  }

  const validChipSet = new Set(ALL_CULTURE_CHIPS);
  for (const chip of input.culture_chips) {
    if (!validChipSet.has(chip)) {
      return {
        ok: false,
        error: `"${chip}" isn't a recognized culture chip.`,
      };
    }
  }

  const color =
    input.brand_color === null || input.brand_color.trim() === ""
      ? null
      : input.brand_color.trim().toLowerCase();
  if (color !== null && !HEX_REGEX.test(color)) {
    return {
      ok: false,
      error: "Brand color must be a 6-digit hex like #14233F.",
    };
  }

  const { error } = await ctx.supabase
    .from("dsos")
    .update({
      culture_chips: input.culture_chips,
      brand_color: color,
    })
    .eq("id", ctx.dsoId);

  if (error) {
    console.error("[profile/upsertBrandAndCulture]", error);
    return { ok: false, error: "Couldn't save brand + culture." };
  }

  await revalidateProfileSurfaces(ctx.supabase, ctx.dsoId);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────
 * Company details — website + headquarters + practice count
 *
 * Dave call Note 7 (2026-05-22): DSOs needed a place to add their
 * website + basic info. These columns already existed on `dsos` and
 * already render on /companies/[slug]; this action just lets the
 * owner/admin populate them from the profile editor. No migration.
 * ─────────────────────────────────────────────────────────── */

const MAX_WEBSITE = 200;
const MAX_HQ_CITY = 80;
const MAX_HQ_STATE = 60;
const MAX_PRACTICE_COUNT = 100000;

export async function upsertCompanyDetails(input: {
  website: string | null;
  headquarters_city: string | null;
  headquarters_state: string | null;
  candidate_reply_to_email: string | null;
  practice_count: number | null;
}): Promise<Result> {
  const ctx = await getDsoAdminContext();
  if (!ctx.ok) return ctx;

  // Website — optional. Normalize a bare domain to https:// so DSOs can
  // type "yourdso.com" without thinking about the scheme.
  let website = input.website?.trim() || null;
  if (website) {
    if (!/^https?:\/\//i.test(website)) {
      website = `https://${website}`;
    }
    if (website.length > MAX_WEBSITE) {
      return {
        ok: false,
        error: `Website URL must be ${MAX_WEBSITE} characters or fewer.`,
      };
    }
    // Loose shape check — a scheme plus a dotted host. We're lenient on
    // purpose; this is a display link, not an auth-critical field.
    if (!/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(website)) {
      return {
        ok: false,
        error: "Enter a valid website like https://yourdso.com.",
      };
    }
  }

  const headquarters_city = input.headquarters_city?.trim() || null;
  const headquarters_state = input.headquarters_state?.trim() || null;
  if (headquarters_city && headquarters_city.length > MAX_HQ_CITY) {
    return { ok: false, error: `City must be ${MAX_HQ_CITY} characters or fewer.` };
  }
  if (headquarters_state && headquarters_state.length > MAX_HQ_STATE) {
    return {
      ok: false,
      error: `State must be ${MAX_HQ_STATE} characters or fewer.`,
    };
  }

  // Practice count — optional non-negative integer.
  let practice_count = input.practice_count;
  if (practice_count !== null && practice_count !== undefined) {
    if (!Number.isFinite(practice_count) || !Number.isInteger(practice_count)) {
      return { ok: false, error: "Number of practices must be a whole number." };
    }
    if (practice_count < 0) {
      return { ok: false, error: "Number of practices can't be negative." };
    }
    if (practice_count > MAX_PRACTICE_COUNT) {
      return { ok: false, error: "That number of practices looks too high." };
    }
    if (practice_count === 0) {
      // Treat 0 as "unset" so the public-page stat strip (which hides on
      // null/0) stays clean rather than rendering "0 practices".
      practice_count = null;
    }
  } else {
    practice_count = null;
  }

  // Candidate reply-to — optional. Where candidate replies (application
  // confirmations, stage updates, nurtures) land. Empty → null (falls back to
  // the owner's email at send time). Loose validation; a routing hint, not
  // auth-critical.
  let candidate_reply_to_email = input.candidate_reply_to_email?.trim() || null;
  if (candidate_reply_to_email) {
    if (
      candidate_reply_to_email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate_reply_to_email)
    ) {
      return {
        ok: false,
        error: "Enter a valid reply-to email like careers@yourpractice.com.",
      };
    }
    candidate_reply_to_email = candidate_reply_to_email.toLowerCase();
  }

  const { error } = await ctx.supabase
    .from("dsos")
    .update({
      website,
      headquarters_city,
      headquarters_state,
      candidate_reply_to_email,
      practice_count,
    })
    .eq("id", ctx.dsoId);

  if (error) {
    console.error("[profile/upsertCompanyDetails]", error);
    return { ok: false, error: "Couldn't save company details." };
  }

  await revalidateProfileSurfaces(ctx.supabase, ctx.dsoId);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────
 * Practice profile — the PracticeFit v3 culture mirror (Phase B.1).
 *
 * The employer side of the candidate assessment's work-style signals. Every
 * field is optional; the matching engine leaves any blank dimension UNSCORED
 * (never a penalty). Vocab matches the candidate columns so the engine
 * compares directly. practice_feel can be left blank — the engine derives it
 * from practice count — but setting it explicitly is more accurate.
 *
 * Module-local value sets (not exported — "use server" allows only async
 * exports; see feedback_use_server_only_async_exports).
 * ─────────────────────────────────────────────────────────── */

const PRACTICE_PACE_VALUES = new Set(["high_volume", "steady", "thorough"]);
const AUTONOMY_LEVEL_VALUES = new Set(["autonomy", "balance", "structure"]);
const MENTORSHIP_VALUES = new Set(["strong", "occasional", "independent"]);
const PRACTICE_FEEL_VALUES = new Set(["private", "midsize", "large"]);
// v3.1 — canonical patient populations (mirrors PATIENT_POPULATIONS). Kept as a
// module-local literal set since "use server" allows only async exports.
const PATIENT_POPULATION_VALUES = new Set([
  "pediatric",
  "geriatric",
  "special_needs",
  "anxious",
  "cosmetic",
  "underserved",
]);

function cleanEnum(v: string | null | undefined, allowed: Set<string>): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t && allowed.has(t) ? t : null;
}
function cleanScale(v: number | null | undefined): number | null {
  if (v == null) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}

export async function upsertPracticeProfile(input: {
  practice_pace: string | null;
  autonomy_level: string | null;
  mentorship_offered: string | null;
  practice_feel: string | null;
  ce_support: number | null;
  work_life_balance: number | null;
  patient_populations?: string[] | null;
}): Promise<Result> {
  const ctx = await getDsoAdminContext();
  if (!ctx.ok) return ctx;

  const practice_pace = cleanEnum(input.practice_pace, PRACTICE_PACE_VALUES);
  const autonomy_level = cleanEnum(input.autonomy_level, AUTONOMY_LEVEL_VALUES);
  const mentorship_offered = cleanEnum(input.mentorship_offered, MENTORSHIP_VALUES);
  const practice_feel = cleanEnum(input.practice_feel, PRACTICE_FEEL_VALUES);
  const ce_support = cleanScale(input.ce_support);
  const work_life_balance = cleanScale(input.work_life_balance);
  // De-dupe + allowlist-filter the multi-select (drops anything unrecognized).
  const patient_populations = Array.from(
    new Set(
      (input.patient_populations ?? []).filter((p) =>
        PATIENT_POPULATION_VALUES.has(p)
      )
    )
  );

  const anySet =
    practice_pace !== null ||
    autonomy_level !== null ||
    mentorship_offered !== null ||
    practice_feel !== null ||
    ce_support !== null ||
    work_life_balance !== null ||
    patient_populations.length > 0;

  const { error } = await ctx.supabase
    .from("dsos")
    .update({
      practice_pace,
      autonomy_level,
      mentorship_offered,
      practice_feel,
      ce_support,
      work_life_balance,
      patient_populations,
      practice_profile_completed_at: anySet ? new Date().toISOString() : null,
    })
    .eq("id", ctx.dsoId);

  if (error) {
    console.error("[profile/upsertPracticeProfile]", error);
    return { ok: false, error: "Couldn't save your practice profile." };
  }

  await revalidateProfileSurfaces(ctx.supabase, ctx.dsoId);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────
 * Contact CTA — label + URL pair
 * ─────────────────────────────────────────────────────────── */

export async function upsertContactCta(input: {
  label: string | null;
  url: string | null;
}): Promise<Result> {
  const ctx = await getDsoAdminContext();
  if (!ctx.ok) return ctx;

  const label = input.label?.trim() || null;
  const url = input.url?.trim() || null;

  // Either both filled or both empty — never one without the other.
  if ((label && !url) || (!label && url)) {
    return {
      ok: false,
      error: "Set both a label and a destination, or clear both.",
    };
  }

  if (label && label.length > 80) {
    return { ok: false, error: "CTA label must be 80 characters or fewer." };
  }
  if (url && !/^(https?:\/\/|mailto:|tel:)/i.test(url)) {
    return {
      ok: false,
      error: "Destination must start with https://, mailto:, or tel:.",
    };
  }

  const { error } = await ctx.supabase
    .from("dsos")
    .update({
      contact_cta_label: label,
      contact_cta_url: url,
    })
    .eq("id", ctx.dsoId);

  if (error) {
    console.error("[profile/upsertContactCta]", error);
    return { ok: false, error: "Couldn't save the contact CTA." };
  }

  await revalidateProfileSurfaces(ctx.supabase, ctx.dsoId);
  return { ok: true };
}
