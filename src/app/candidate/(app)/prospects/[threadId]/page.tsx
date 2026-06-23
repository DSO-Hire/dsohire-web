/**
 * /candidate/prospects/[threadId] — a single employer-interest conversation.
 *
 * Candidate reads the DSO's messages and replies in-app (never via email). The
 * reply affordance defaults to anonymous; "reply & share my profile" is the
 * explicit reveal. Mute / block are always available.
 */

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProspectThreadPanel } from "./thread-panel";

export const metadata: Metadata = { title: "Conversation · DSO Hire" };
export const dynamic = "force-dynamic";

export default async function CandidateProspectThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/candidate/sign-in?next=/candidate/prospects/${threadId}`);

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) redirect("/candidate/sign-up");

  const { data: thread } = await supabase
    .from("prospect_threads")
    .select("id, status, candidate_revealed, dsos(name, slug)")
    .eq("id", threadId)
    .eq("candidate_id", candidate.id as string)
    .maybeSingle();
  if (!thread) notFound();

  const { data: msgRows } = await supabase
    .from("prospect_messages")
    .select("id, sender_role, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  const messages = (msgRows ?? []) as Array<{
    id: string;
    sender_role: string;
    body: string;
    created_at: string;
  }>;
  const dsoRel = (thread as unknown as {
    dsos: { name: string | null; slug: string | null } | null;
  }).dsos;
  const dsoName = dsoRel?.name ?? "A dental group";
  const dsoSlug = dsoRel?.slug ?? null;

  return (
    <div className="mx-auto max-w-[680px] px-4 py-8">
      <Link
        href="/candidate/prospects"
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-heritage-deep hover:text-ink mb-5"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Employer interest
      </Link>
      <h1 className="text-xl font-extrabold tracking-[-0.4px] text-ink mb-1">
        {dsoName}
      </h1>
      <p className="text-[12px] text-slate-meta mb-5">
        {thread.candidate_revealed
          ? "You've shared your profile with this employer."
          : "You're anonymous to this employer."}
      </p>

      <ProspectThreadPanel
        threadId={threadId}
        status={thread.status as string}
        revealed={Boolean(thread.candidate_revealed)}
        messages={messages}
      />

      {/* Applying is the clearest reveal. ?source=sourcing credits the channel
          in Vantage's closed-loop attribution. */}
      <div className="mt-5 text-center">
        <Link
          href={
            dsoSlug
              ? `/companies/${dsoSlug}?source=sourcing`
              : `/jobs?source=sourcing`
          }
          className="text-[13px] font-semibold text-heritage-deep hover:text-ink"
        >
          Explore open roles at {dsoName} →
        </Link>
      </div>
    </div>
  );
}
