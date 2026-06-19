/**
 * /employer/referrals (gap N15) — capture word-of-mouth/employee referrals.
 *
 * Teammates refer from here; anyone can submit via the shareable
 * /refer/<code> link. Status-tracking only (submitted → hired) — no bonus
 * or payout, by deliberate scope.
 */

import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import type { Metadata } from "next";
import { HelpDisclosure } from "@/components/help/help-disclosure";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureReferralCode } from "@/lib/referrals/code";
import { ShareLinkBox, ReferralComposer, StatusSelect } from "./referrals-client";

export const metadata: Metadata = { title: "Referrals" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  contacted: "Contacted",
  interviewing: "Interviewing",
  hired: "Hired",
  closed: "Closed",
};
const STATUS_TONE: Record<string, string> = {
  submitted: "bg-cream text-ink border-[var(--rule-strong)]",
  contacted: "bg-blue-50 text-blue-700 border-blue-200",
  interviewing: "bg-warning-bg text-warning border-warning",
  hired: "bg-heritage/15 text-heritage-deep border-heritage/30",
  closed: "bg-muted text-muted-foreground border-border",
};

interface ReferralRow {
  id: string;
  source: string;
  referrer_name: string | null;
  candidate_name: string;
  candidate_email: string | null;
  candidate_phone: string | null;
  note: string | null;
  status: string;
  created_at: string;
  job: { title: string | null } | Array<{ title: string | null }> | null;
}

export default async function ReferralsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");
  const dsoId = dsoUser.dso_id as string;

  const [code, { data: jobRows }, { data: refRows }] = await Promise.all([
    ensureReferralCode(dsoId),
    supabase
      .from("jobs")
      .select("id, title")
      .eq("dso_id", dsoId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("posted_at", { ascending: false })
      .limit(50),
    supabase
      .from("referrals")
      .select(
        "id, source, referrer_name, candidate_name, candidate_email, candidate_phone, note, status, created_at, job:jobs(title)"
      )
      .eq("dso_id", dsoId)
      .order("created_at", { ascending: false }),
  ]);

  const jobs = ((jobRows ?? []) as Array<{ id: string; title: string }>).map(
    (j) => ({ id: j.id, title: j.title })
  );
  const referrals = (refRows ?? []) as ReferralRow[];
  const openCount = referrals.filter(
    (r) => r.status !== "hired" && r.status !== "closed"
  ).length;
  const hiredCount = referrals.filter((r) => r.status === "hired").length;

  return (
    <>
      <header className="mb-8 max-w-[820px]">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Referrals
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-[-1.2px] leading-tight text-ink">
          Turn word-of-mouth into hires
        </h1>
        <p className="mt-3 text-[14px] text-slate-body leading-relaxed">
          Your team and their network are your best sourcing channel. Refer
          someone directly, or share your link so anyone can pass along a great
          name — every referral lands here and you can track it through to hire.
        </p>
      </header>

      <div className="mb-7">
        <HelpDisclosure helpKey="referrals.overview" />
      </div>

      {/* Share link */}
      <section className="mb-8 max-w-[680px]">
        <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
          Your shareable referral link
        </h2>
        <ShareLinkBox code={code} />
        <p className="mt-2 text-[12px] text-slate-meta leading-snug">
          Anyone with this link can submit a referral — no account needed. Great
          for current staff, dental-school contacts, and past colleagues.
        </p>
      </section>

      {/* Teammate composer */}
      <section className="mb-10">
        <ReferralComposer jobs={jobs} />
      </section>

      {/* List */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
          <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
            Referrals ({referrals.length})
          </h2>
          {referrals.length > 0 && (
            <div className="text-[12px] text-slate-meta">
              {openCount} open · {hiredCount} hired
            </div>
          )}
        </div>

        {referrals.length === 0 ? (
          <div className="border border-[var(--rule)] bg-cream/30 p-8 text-center max-w-[680px]">
            <UserPlus className="h-10 w-10 text-slate-meta mx-auto mb-3" aria-hidden />
            <p className="text-[14px] text-slate-body leading-relaxed max-w-[480px] mx-auto">
              No referrals yet. Use{" "}
              <span className="font-semibold text-ink">Refer someone</span> above
              or share your link to start collecting names.
            </p>
          </div>
        ) : (
          <ul className="list-none border-t border-[var(--rule)] max-w-[920px]">
            {referrals.map((r) => {
              const job = Array.isArray(r.job) ? r.job[0] : r.job;
              return (
                <li
                  key={r.id}
                  className="border-b border-[var(--rule)] py-4 px-2 flex flex-wrap items-start justify-between gap-4 hover:bg-cream/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[15px] font-semibold text-ink">
                        {r.candidate_name}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-[9px] font-bold tracking-[1px] uppercase border ${
                          STATUS_TONE[r.status] ?? STATUS_TONE.submitted
                        }`}
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-slate-meta">
                      {[r.candidate_email, r.candidate_phone]
                        .filter(Boolean)
                        .join(" · ") || "No contact info"}
                      {job?.title ? ` · for ${job.title}` : ""}
                    </div>
                    <div className="mt-1 text-[12px] text-slate-body">
                      Referred by{" "}
                      <span className="font-medium text-ink">
                        {r.referrer_name || "Someone"}
                      </span>{" "}
                      <span className="text-slate-meta">
                        ({r.source === "link" ? "via link" : "teammate"})
                      </span>
                    </div>
                    {r.note && (
                      <p className="mt-1.5 text-[12px] text-slate-body italic leading-snug max-w-[560px]">
                        &ldquo;{r.note}&rdquo;
                      </p>
                    )}
                  </div>
                  <StatusSelect referralId={r.id} current={r.status} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
