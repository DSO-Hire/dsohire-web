"use server";

/**
 * Founder-gated "Reset demo data" server action.
 *
 * Calls the SAME shared runDemoSeed() the committed scripts/seed-demo.ts uses,
 * so a reset and a re-run are one code path. Scoped hard:
 *   • Founder-only — re-checks isSuperadminEmail (defense in depth on top of the
 *     /admin layout's admin_users gate). A non-founder admin can't reach it.
 *   • cleanupLegacy: false — the action can ONLY touch seed_batch='demo_v1'
 *     rows (wipeDemoSeed asserts the scope), never the one-time legacy purge.
 *   • Assets (headshots/logos) and auth logins persist across resets, so the
 *     environment returns to pristine without re-uploading anything.
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { isSuperadminEmail } from "@/lib/admin/gate";
import { recordAdminAudit } from "@/lib/admin/audit";
import { runDemoSeed } from "@/lib/demo-seed";

export interface ResetDemoState {
  ok: boolean;
  message: string;
}

export async function resetDemoData(
  _prev: ResetDemoState,
  _formData: FormData
): Promise<ResetDemoState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };
  if (!isSuperadminEmail(user.email)) {
    return { ok: false, message: "Reset demo data is founder-only." };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return { ok: false, message: "Server is missing NEXT_PUBLIC_SUPABASE_URL." };

  try {
    const admin = createSupabaseServiceRoleClient();
    const result = await runDemoSeed(admin, {
      supabaseUrl,
      cleanupLegacy: false, // demo_v1 only — never the legacy purge from the app
    });

    await recordAdminAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: "admin.quick_action.demo_reset",
      targetType: null,
      targetId: null,
      summary: "Reset demo data (wipe + reseed demo_v1)",
      metadata: { counts: result.counts },
    });

    revalidatePath("/admin");
    const c = result.counts;
    return {
      ok: true,
      message: `Demo reset to pristine — ${c.dsos ?? 0} DSOs, ${c.candidates ?? 0} candidates, ${c.applications ?? 0} applications, ${c.practice_fit_scores ?? 0} fit scores.`,
    };
  } catch (e) {
    return { ok: false, message: `Reset failed: ${(e as Error).message}` };
  }
}
