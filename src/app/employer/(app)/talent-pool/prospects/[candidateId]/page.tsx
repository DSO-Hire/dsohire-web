/**
 * /employer/talent-pool/prospects/[candidateId] — DSO side of a prospect thread.
 *
 * The DSO composes and reads here. The candidate is shown MASKED
 * (anonymousDisplayLabel) until they apply or reveal — the DSO never sees the
 * real name/avatar/email. The thread is created lazily on first send.
 */

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  anonymousDisplayLabel,
  getDsoAppliedCandidateIds,
} from "@/lib/candidate/anonymity";
import { ProspectComposer } from "./composer";

export const metadata: Metadata = { title: "Prospect · Talent Pool" };
export const dynamic = "force-dynamic";

export default async function DsoProspectThreadPage({
  params,
}: {
  params: Promise<{ candidateId: string }>;
}) {
  const { candidateId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");
  const dsoId = dsoUser.dso_id as string;

  const { data: candidate } = await supabase
    .from("candidates")
    .select(
      "id, full_name, headline, current_title, anonymous_mode, desired_roles, current_location_city, current_location_state, cv_visibility, is_guest, deleted_at",
    )
    .eq("id", candidateId)
    .maybeSingle();
  if (!candidate) notFound();

  // Thread (may not exist yet) — created on first send.
  const { data: thread } = await supabase
    .from("prospect_threads")
    .select("id, status, candidate_revealed")
    .eq("dso_id", dsoId)
    .eq("candidate_id", candidateId)
    .maybeSingle();

  let messages: Array<{
    id: string;
    sender_role: string;
    body: string;
    created_at: string;
  }> = [];
  if (thread) {
    const { data: msgRows } = await supabase
      .from("prospect_messages")
      .select("id, sender_role, body, created_at")
      .eq("thread_id", thread.id as string)
      .order("created_at", { ascending: true });
    messages = (msgRows ?? []) as typeof messages;
  }

  const applied = await getDsoAppliedCandidateIds(supabase, dsoId, [candidateId]);
  const revealed = Boolean(thread?.candidate_revealed);
  const masked =
    Boolean(candidate.anonymous_mode) && !applied.has(candidateId) && !revealed;
  const displayName = masked
    ? anonymousDisplayLabel(candidate)
    : (candidate.full_name as string | null) ?? "Candidate";
  const blocked = (thread?.status as string | undefined) === "blocked";

  return (
    <div className="mx-auto max-w-[680px] px-4 py-8">
      <Link
        href="/employer/talent-pool?tab=pipeline"
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-heritage-deep hover:text-ink mb-5"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Pipeline
      </Link>

      <div className="flex items-center gap-2 mb-1">
        <h1 className="text-xl font-extrabold tracking-[-0.4px] text-ink">
          {displayName}
        </h1>
        {masked && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-meta">
            <Lock className="h-3 w-3" /> Anonymous
          </span>
        )}
      </div>
      <p className="text-[12px] text-slate-meta mb-5">
        {[candidate.current_title, candidate.current_location_state]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <div className="space-y-3 mb-6">
        {messages.length === 0 && (
          <p className="text-[13px] text-slate-meta">
            No messages yet. Your first message reveals your DSO to the candidate;
            they stay anonymous to you until they reply &amp; share or apply.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_role === "dso";
          const system = m.sender_role === "system";
          return (
            <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  "max-w-[85%] rounded-lg px-3.5 py-2.5 text-[14px] whitespace-pre-wrap " +
                  (system
                    ? "bg-cream text-slate-body text-[12px] italic"
                    : mine
                      ? "bg-heritage text-primary-foreground"
                      : "bg-card border border-[var(--rule)] text-ink")
                }
              >
                {m.body}
              </div>
            </div>
          );
        })}
      </div>

      {blocked ? (
        <div className="rounded-lg border border-[var(--rule)] bg-cream/40 px-4 py-3 text-[13px] text-slate-body">
          This candidate has blocked your group. You can no longer message them.
        </div>
      ) : (
        <ProspectComposer candidateId={candidateId} />
      )}
    </div>
  );
}
