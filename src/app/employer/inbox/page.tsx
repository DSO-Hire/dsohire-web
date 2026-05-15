/**
 * /employer/inbox — Phase 4.8 unified inbox v0.
 *
 * 2-pane layout: thread list (left) + active thread (right). Active
 * thread is selected via `?app=<application_id>` so URLs are
 * shareable. Filter tabs (All / Unread / Archived) + dropdown filters
 * (Job / Location / Stage) live in the client component.
 *
 * RLS:
 *   • Threads come from getEmployerInboxThreads scoped to the caller's
 *     DSO + auth_user_id (for archive flags).
 *   • The active thread's messages come from the existing RLS-aware
 *     read on application_messages.
 *   • Mark-as-read happens in the client when the thread mounts.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmployerShell } from "@/components/employer/employer-shell";
import {
  getEmployerInboxThreads,
  APPLICATION_MESSAGE_SELECT,
  projectApplicationMessageRow,
} from "@/lib/inbox/queries";
import type { ApplicationMessageRow } from "@/lib/messages/actions";
import { InboxView } from "@/components/inbox/inbox-view";

export const metadata: Metadata = { title: "Inbox · DSO Hire" };

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ app?: string }>;
}

export default async function EmployerInboxPage({ searchParams }: PageProps) {
  const { app: appQuery } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  const dsoId = (dsoUser as Record<string, unknown>).dso_id as string;
  const userName =
    ((dsoUser as Record<string, unknown>).full_name as string | null) ??
    user.email ??
    "You";

  const threads = await getEmployerInboxThreads(supabase, user.id, dsoId);

  // If the URL points at an application id, prefetch the messages for
  // the right pane. Otherwise the right pane shows an empty state.
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
        console.error("[inbox] employer active-thread messages", msgErr);
      }
      activeMessages = ((msgRows ?? []) as Array<Record<string, unknown>>).map(
        (row) =>
          projectApplicationMessageRow(row) as unknown as ApplicationMessageRow
      );
    }
  }

  return (
    <EmployerShell active="inbox">
      <InboxView
        audience="employer"
        threads={threads}
        currentUserId={user.id}
        currentUserName={userName}
        initialActiveApplicationId={activeApplicationId}
        initialActiveMessages={activeMessages}
      />
    </EmployerShell>
  );
}
