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
    .select("dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!dsoUser) {
    return { ok: false as const, error: "No DSO membership found." };
  }

  // Mirror the is_dso_admin() helper used by RLS — owner + admin can edit
  // public profile content. Recruiter / hiring manager cannot.
  const role = dsoUser.role as string;
  if (role !== "owner" && role !== "admin") {
    return {
      ok: false as const,
      error: "Only owners or admins can edit the public profile.",
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
