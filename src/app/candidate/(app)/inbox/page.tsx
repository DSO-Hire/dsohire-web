/**
 * /candidate/inbox — Phase 4.8 unified inbox v0 (candidate side).
 *
 * Symmetric to /employer/inbox: 2-pane layout, All/Unread/Archived
 * tabs, per-job filter (no Location/Stage on the candidate side —
 * those are employer-internal), realtime subscription, mark-as-read
 * on thread open.
 *
 * Reuses <InboxView> with audience="candidate" so the rendering
 * components stay in one place.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCandidateInboxThreads,
  APPLICATION_MESSAGE_SELECT,
  projectApplicationMessageRow,
} from "@/lib/inbox/queries";
import { InboxView } from "@/components/inbox/inbox-view";
import type { ApplicationMessageRow } from "@/lib/messages/actions";

export const metadata: Metadata = { title: "Inbox · DSO Hire" };

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ app?: string }>;
}

export default async function CandidateInboxPage({ searchParams }: PageProps) {
  const { app: appQuery } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/sign-in?next=/candidate/inbox");

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) redirect("/candidate/sign-up");

  const candidateId = (candidate as Record<string, unknown>).id as string;
  const userName =
    ((candidate as Record<string, unknown>).full_name as string | null) ??
    user.email ??
    "You";

  const threads = await getCandidateInboxThreads(supabase, user.id, candidateId);

  let activeMessages: ApplicationMessageRow[] = [];
  let activeApplicationId: string | null = null;
  if (appQuery) {
    const matchingThread = threads.find(
      (t) => t.application_id === appQuery
    );
    if (matchingThread) {
      activeApplicationId = appQuery;
      const { data: msgRows, error: msgErr } = await supabase
        .from("application_messages")
        .select(APPLICATION_MESSAGE_SELECT)
        .eq("application_id", appQuery)
        .order("created_at", { ascending: true });
      if (msgErr) {
        console.error("[inbox] candidate active-thread messages", msgErr);
      }
      activeMessages = ((msgRows ?? []) as Array<Record<string, unknown>>).map(
        (row) =>
          projectApplicationMessageRow(row) as unknown as ApplicationMessageRow
      );
    }
  }

  // Surface prospect threads (employer interest, pre-application) when any exist
  // — they live on a dedicated surface to avoid coupling into the application
  // inbox, with a link here for discoverability.
  const { count: prospectCount } = await supabase
    .from("prospect_threads")
    .select("id", { count: "exact", head: true })
    .eq("candidate_id", candidateId);

  return (
    <>
      {(prospectCount ?? 0) > 0 && (
        <Link
          href="/candidate/prospects"
          className="flex items-center justify-between gap-3 border-b border-[var(--rule)] bg-cream/40 px-4 py-2.5 text-[13px] text-ink hover:bg-cream/70 transition-colors"
        >
          <span>
            <strong className="font-semibold">Employer interest</strong> —{" "}
            {prospectCount} {prospectCount === 1 ? "group has" : "groups have"}{" "}
            reached out
          </span>
          <span className="text-heritage-deep font-semibold">View →</span>
        </Link>
      )}
      <InboxView
        audience="candidate"
        threads={threads}
        currentUserId={user.id}
        currentUserName={userName}
        initialActiveApplicationId={activeApplicationId}
        initialActiveMessages={activeMessages}
      />
    </>
  );
}
