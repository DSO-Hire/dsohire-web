import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * candidate-cta — make marketing "sign-up" CTAs auth-aware.
 *
 * A signed-in candidate should NEVER be sent to account creation from a
 * marketing surface (Cam, Day 37: tapped "Take Your PracticeFit" while signed
 * in as a candidate and hit /candidate/sign-up). Resolve the CTA destination by
 * the viewer's auth state + the CTA's INTENT: a signed-in candidate goes to the
 * real product surface; everyone else (signed-out, or an employer with no
 * candidate row) still goes to sign-up.
 *
 * Server-only (reads the auth cookie). Call from a server component and pass the
 * resolved href down to the CTA. Marketing pages under SiteShell already render
 * per-request (the shell reads auth), so this adds no caching cost.
 *
 * For a page with ONE such CTA, use `candidateCtaHref(intent)`. For a page with
 * SEVERAL (different intents), use `candidateCtaResolver()` once — it does a
 * single auth lookup and returns a sync `(intent) => href` you can call per CTA.
 */

export type CandidateCtaIntent = "assessment" | "resume" | "jobs" | "dashboard";

const SIGNED_IN_TARGET: Record<CandidateCtaIntent, string> = {
  assessment: "/candidate/assessment",
  resume: "/candidate/resume",
  jobs: "/candidate/jobs",
  dashboard: "/candidate/dashboard",
};

/** One auth lookup → a sync resolver. Use on pages with multiple CTAs. */
export async function candidateCtaResolver(): Promise<
  (intent?: CandidateCtaIntent) => string
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isCandidate = false;
  if (user) {
    const { data: candidate } = await supabase
      .from("candidates")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    isCandidate = Boolean(candidate);
  }

  return (intent: CandidateCtaIntent = "assessment") =>
    isCandidate ? SIGNED_IN_TARGET[intent] : "/candidate/sign-up";
}

/** Convenience for a single-CTA page. */
export async function candidateCtaHref(
  intent: CandidateCtaIntent = "assessment"
): Promise<string> {
  const resolve = await candidateCtaResolver();
  return resolve(intent);
}
