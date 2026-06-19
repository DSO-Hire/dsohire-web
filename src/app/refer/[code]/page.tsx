/**
 * /refer/<code> — public referral submission page (gap N15). No auth.
 * Resolves the DSO from its shareable referral code; anyone can pass along
 * a great name. Status-tracking only; no bonus/payout.
 */

import type { Metadata } from "next";
import { lookupDsoByReferralCode } from "@/lib/referrals/code";
import { ReferForm } from "./refer-form";

export const metadata: Metadata = { title: "Refer someone" };
export const dynamic = "force-dynamic";

export default async function ReferPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const dso = await lookupDsoByReferralCode(code);

  return (
    <main className="min-h-screen bg-ivory flex flex-col items-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-[640px]">
        {!dso ? (
          <div className="border border-[var(--rule)] bg-card p-8 text-center">
            <h1 className="text-2xl font-bold text-ink mb-2">
              This referral link isn&apos;t active
            </h1>
            <p className="text-[14px] text-slate-body leading-relaxed">
              The link may be mistyped or no longer in use. Check with the
              person who shared it for an updated link.
            </p>
          </div>
        ) : (
          <>
            <header className="mb-7 text-center">
              <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
                Refer a candidate
              </div>
              <h1 className="text-3xl font-extrabold tracking-[-1px] text-ink">
                Know someone great for {dso.dsoName}?
              </h1>
              <p className="mt-3 text-[15px] text-slate-body leading-relaxed">
                Pass along their name and the hiring team will reach out. It
                only takes a minute — no account needed.
              </p>
            </header>
            <div className="border border-[var(--rule)] bg-cream/40 p-6 sm:p-8">
              <ReferForm code={code} jobs={dso.jobs} />
            </div>
            <p className="mt-5 text-center text-[11px] text-slate-meta">
              Powered by DSO Hire
            </p>
          </>
        )}
      </div>
    </main>
  );
}
