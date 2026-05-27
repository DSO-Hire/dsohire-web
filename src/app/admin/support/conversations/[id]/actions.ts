"use server";

/**
 * Server actions for /admin/support/conversations/[id].
 *
 * Single action: reviewConversation — flips support_requests.review_status
 * + captures reviewer_notes + reviewed_by + reviewed_at.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

const ADMIN_EMAILS = new Set(["cam@dsohire.com", "cameron@eslingerdental.com"]);

export async function reviewConversation(formData: FormData): Promise<void> {
  const requestId = String(formData.get("request_id") ?? "").trim();
  const nextStatus = String(formData.get("next_status") ?? "").trim();
  const reviewerNotes = String(formData.get("reviewer_notes") ?? "").trim();

  if (!requestId) return;
  if (!["unreviewed", "reviewed", "flagged_bad"].includes(nextStatus)) return;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email || !ADMIN_EMAILS.has(user.email.toLowerCase())) {
    return;
  }

  const admin = createSupabaseServiceRoleClient();
  await admin
    .from("support_requests")
    .update({
      review_status: nextStatus as "unreviewed" | "reviewed" | "flagged_bad",
      reviewer_notes: reviewerNotes || null,
      reviewed_at:
        nextStatus === "unreviewed" ? null : new Date().toISOString(),
      reviewed_by: nextStatus === "unreviewed" ? null : user.id,
    })
    .eq("id", requestId);

  revalidatePath("/admin/support/conversations");
  revalidatePath(`/admin/support/conversations/${requestId}`);
  redirect("/admin/support/conversations");
}
