/**
 * /candidate/prospects — employer interest inbox (Sourcing CRM Phase 2).
 *
 * Where a candidate reads + replies to DSOs that reached out while they were
 * sourced (pre-application). Separate from the application inbox; the nudge
 * email deep-links straight to a thread. The candidate stays anonymous to the
 * DSO until they reply-with-reveal or apply.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Employer interest · DSO Hire" };
export const dynamic = "force-dynamic";

export default async function CandidateProspectsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/sign-in?next=/candidate/prospects");

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) redirect("/candidate/sign-up");

  const { data: threadRows } = await supabase
    .from("prospect_threads")
    .select("id, status, last_message_at, candidate_revealed, dsos(name, logo_url)")
    .eq("candidate_id", candidate.id as string)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  const threads = (threadRows ?? []) as unknown as Array<{
    id: string;
    status: string;
    last_message_at: string | null;
    candidate_revealed: boolean;
    dsos: { name: string | null; logo_url: string | null } | null;
  }>;

  return (
    <div className="mx-auto max-w-[760px] px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-[-0.6px] text-ink">
          Employer interest
        </h1>
        <p className="mt-2 text-[14px] text-slate-body">
          Dental groups that reached out to you. You&apos;re anonymous until you
          reply and choose to share your profile — or apply.
        </p>
      </header>

      {threads.length === 0 ? (
        <div className="rounded-lg border border-[var(--rule)] bg-cream/30 px-6 py-10 text-center text-[14px] text-slate-body">
          No employer messages yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {threads.map((t) => (
            <li key={t.id}>
              <Link
                href={`/candidate/prospects/${t.id}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-[var(--rule)] bg-card px-4 py-3 hover:border-heritage-deep transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-ink truncate">
                    {t.dsos?.name ?? "A dental group"}
                  </p>
                  <p className="text-[12px] text-slate-meta">
                    {t.status === "blocked"
                      ? "Blocked"
                      : t.status === "muted"
                        ? "Muted"
                        : t.candidate_revealed
                          ? "Profile shared"
                          : "Anonymous"}
                  </p>
                </div>
                <span className="text-[12px] text-heritage-deep font-semibold shrink-0">
                  View →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
