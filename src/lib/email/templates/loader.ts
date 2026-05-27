/**
 * Custom template loader (Phase 4.5.f).
 *
 * Used by the email dispatch path. Returns the DSO's custom subject +
 * body_html for a given event kind, OR null when:
 *   - The DSO has no row in `email_templates` for this kind, or
 *   - The DSO isn't on Growth+ (tier gate), or
 *   - The query fails (we log and fall back rather than block sends)
 *
 * Caller should fall back to the existing React Email component when
 * this returns null.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { PredefinedTemplateKind } from "./manifest";
import { dsoCanUseCustomTemplates } from "./tier";

export interface LoadedTemplate {
  subject: string;
  body_html: string;
}

export async function loadCustomTemplate(
  dsoId: string,
  kind: PredefinedTemplateKind
): Promise<LoadedTemplate | null> {
  const supabase = createSupabaseServiceRoleClient();

  // Tier gate FIRST so we don't hit the templates table for Starter DSOs.
  const canUse = await dsoCanUseCustomTemplates(supabase, dsoId);
  if (!canUse) return null;

  const { data, error } = await supabase
    .from("email_templates")
    .select("subject, body_html")
    .eq("dso_id", dsoId)
    .eq("kind", kind)
    .maybeSingle();

  if (error) {
    console.error(
      "[email/templates/loader] custom template lookup failed",
      { dsoId, kind, error }
    );
    return null;
  }

  if (!data) return null;

  return {
    subject: data.subject as string,
    body_html: data.body_html as string,
  };
}
