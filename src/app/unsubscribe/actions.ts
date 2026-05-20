"use server";

/**
 * Resubscribe server action for the public unsubscribe page (Phase E8.14).
 * Re-verifies the signed token (the page is session-less), flips the category's
 * email back on, and returns to the page in its "resubscribed" state.
 */

import { redirect } from "next/navigation";
import { verifyUnsubscribeToken } from "@/lib/notifications/unsubscribe-token";
import { applyCategoryResubscribe } from "@/lib/notifications/unsubscribe";

export async function resubscribeAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const decoded = verifyUnsubscribeToken(token);
  if (!decoded) redirect("/unsubscribe?status=invalid");
  await applyCategoryResubscribe(decoded.userId, decoded.categoryKey);
  redirect(`/unsubscribe?token=${encodeURIComponent(token)}&resubscribed=1`);
}
