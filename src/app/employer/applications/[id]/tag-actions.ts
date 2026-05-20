"use server";

/**
 * Candidate tag actions (E3.22).
 *
 * Add / remove team-level tags on an application. Authorization is enforced
 * by RLS on application_tags (membership via applications -> jobs -> dso_users),
 * so these actions just authenticate the caller and let the policy gate the row.
 * We revalidate both the application detail page and the per-job kanban board so
 * chips stay in sync across surfaces.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isTagColor,
  MAX_TAG_LABEL_LENGTH,
  MAX_TAGS_PER_APPLICATION,
  type ApplicationTag,
  type TagColor,
} from "@/lib/applications/tags";

export type AddTagResult =
  | { ok: true; tag: ApplicationTag }
  | { ok: false; error: string };

export type RemoveTagResult = { ok: true } | { ok: false; error: string };

async function revalidateForApplication(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  applicationId: string
) {
  const { data: app } = await supabase
    .from("applications")
    .select("job_id")
    .eq("id", applicationId)
    .maybeSingle();
  revalidatePath(`/employer/applications/${applicationId}`);
  if (app?.job_id) revalidatePath(`/employer/jobs/${app.job_id as string}`);
}

export async function addApplicationTag(
  applicationId: string,
  rawLabel: string,
  rawColor: string
): Promise<AddTagResult> {
  const label = rawLabel.trim();
  if (!applicationId) return { ok: false, error: "Missing application." };
  if (label.length < 1) return { ok: false, error: "Enter a tag label." };
  if (label.length > MAX_TAG_LABEL_LENGTH) {
    return {
      ok: false,
      error: `Tags are limited to ${MAX_TAG_LABEL_LENGTH} characters.`,
    };
  }
  const color: TagColor = isTagColor(rawColor) ? rawColor : "slate";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Enforce a soft cap per application (RLS still gates membership).
  const { count } = await supabase
    .from("application_tags")
    .select("id", { count: "exact", head: true })
    .eq("application_id", applicationId);
  if ((count ?? 0) >= MAX_TAGS_PER_APPLICATION) {
    return {
      ok: false,
      error: `That's the max of ${MAX_TAGS_PER_APPLICATION} tags on one candidate.`,
    };
  }

  const { data, error } = await supabase
    .from("application_tags")
    .insert({
      application_id: applicationId,
      label,
      color,
      created_by: user.id,
    })
    .select("id, label, color")
    .single();

  if (error) {
    // 23505 = unique_violation (application_id, label)
    if (error.code === "23505") {
      return { ok: false, error: "That tag is already on this candidate." };
    }
    return { ok: false, error: "Couldn't add the tag. Try again." };
  }

  await revalidateForApplication(supabase, applicationId);
  return {
    ok: true,
    tag: {
      id: data.id as string,
      label: data.label as string,
      color: (isTagColor(data.color as string) ? data.color : "slate") as TagColor,
    },
  };
}

export async function removeApplicationTag(
  tagId: string,
  applicationId: string
): Promise<RemoveTagResult> {
  if (!tagId) return { ok: false, error: "Missing tag." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("application_tags")
    .delete()
    .eq("id", tagId);

  if (error) return { ok: false, error: "Couldn't remove the tag. Try again." };

  await revalidateForApplication(supabase, applicationId);
  return { ok: true };
}
