/**
 * Shelled candidate app layout — the auth gate + persistent nav for every
 * authed candidate surface (/candidate/dashboard, /jobs, /applications,
 * /profile, /resume, /settings, the fit hubs, …).
 *
 * `(app)` is a route GROUP — it does not change URLs, so this still serves
 * /candidate/dashboard etc. Because a layout persists across navigation, the
 * CandidateShell rail no longer unmounts/remounts when moving between pages
 * (the old "blink"), and the content-area BrandLoader (./loading.tsx) shows
 * with the nav still in place while a page's server data loads.
 *
 * The auth gate + identity/inbox/fit-product resolution used to live inside
 * CandidateShell (rendered per page). It moved up here so it runs once and the
 * shell can be purely presentational. Redirects are byte-identical to the old
 * shell. Shell-less candidate routes (sign-in, sign-up, sign-out, restore,
 * claim, track-chooser, resume/build, resume/pdf) deliberately live OUTSIDE
 * this group.
 */

import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUnreadCount } from "@/lib/inbox/queries";
import { CandidateShell } from "@/components/candidate/candidate-shell";

export default async function CandidateAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/sign-in");

  const { data: candidate } = await supabase
    .from("candidates")
    .select(
      "id, full_name, headline, current_title, is_searchable, avatar_url, deleted_at, primary_fit_product, privacy_choices_reviewed_at"
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!candidate) redirect("/candidate/sign-up");

  // Soft-deleted accounts can't reach any candidate-area page — they
  // hit the restore landing page until they restore or the 30-day
  // grace period expires (after which the cron hard-deletes the row).
  if ((candidate as Record<string, unknown>).deleted_at) {
    redirect("/candidate/restore");
  }

  // Consent-based privacy first-run gate — a candidate who hasn't made a
  // deliberate visibility choice (privacy_choices_reviewed_at is null) is
  // private by default and must pass the prominent "choose who can find you"
  // step before reaching any shelled surface. This catches candidates
  // backfilled to private when we flipped to private-by-default, plus anyone
  // who signed up via an intentful destination (e.g. ?next=/jobs/[id]/apply)
  // and so skipped the post-verify redirect. The step lives OUTSIDE this route
  // group, so redirecting to it doesn't re-trigger this layout (no loop).
  if (!(candidate as Record<string, unknown>).privacy_choices_reviewed_at) {
    redirect("/candidate/welcome/visibility");
  }

  const candidateName =
    (candidate.full_name as string | null) ?? user.email ?? "Candidate";
  const candidateAvatar = (candidate.avatar_url as string | null) ?? null;
  const candidateSubtitle =
    (candidate.current_title as string | null) ??
    (candidate.headline as string | null) ??
    "Profile incomplete";

  // Inbox unread badge — counts messages from the OTHER side that
  // haven't been marked read. RLS scopes the query automatically.
  const inboxUnread = await getUnreadCount(supabase, "candidate");

  // #54 — the fit nav slot swaps PracticeFit↔DSOFit by the candidate's chosen
  // track (null → PracticeFit default).
  const fitProduct =
    ((candidate as Record<string, unknown>).primary_fit_product as
      | string
      | null) ?? "practicefit";
  const isDso = fitProduct === "dsofit";

  return (
    <CandidateShell
      candidateName={candidateName}
      candidateAvatar={candidateAvatar}
      candidateSubtitle={candidateSubtitle}
      inboxUnread={inboxUnread}
      isDso={isDso}
      authUserId={user.id}
    >
      {children}
    </CandidateShell>
  );
}
