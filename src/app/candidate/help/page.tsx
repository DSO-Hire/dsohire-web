/**
 * /candidate/help — candidate-side support + FAQ surface.
 *
 * Mirrors /employer/help in structure but speaks to candidate concerns:
 * applying, profile visibility, working-hygienist privacy, CE tracking.
 *
 * Was previously linked from CandidateShell as "/help" which 404'd.
 * Updating both this route and the shell href to /candidate/help to
 * match the symmetric /employer/help pattern.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail, MessageSquare, BookOpen } from "lucide-react";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/contact";
import { HELP_CONTENT } from "@/lib/help/help-content";
import { OpenSupportButton } from "@/app/employer/help/open-support-button";

export const metadata: Metadata = { title: "Help & Support" };

interface FaqEntry {
  q: string;
  a: string;
}

const FAQS: FaqEntry[] = [
  {
    q: "How do I apply to a job?",
    a: "Browse the jobs board, open any role you're interested in, and click Apply. The wizard walks you through the basics, an optional resume upload (PDF or DOCX), screening questions if the employer set them, and a quick review. We auto-fill what we already know about you so applying takes a minute, not ten.",
  },
  {
    q: "Can I import my profile from my resume?",
    a: "Yes — open Profile, click 'Import from your resume' at the top, and drop in a PDF or DOCX. We extract your work history, education, licenses, certifications, skills, and contact info into the right sections. You review every field before anything saves; nothing gets persisted from the file you don't approve.",
  },
  {
    q: "Who can see my profile?",
    a: "By default your profile is set to 'Recruiters only' — visible to DSO Hire employer members but not indexed by Google or visible to unauthenticated visitors. You can change this any time on Settings → Privacy & visibility. We never sell candidate data; we never share with staffing agencies or data brokers.",
  },
  {
    q: "How do I hide my profile from my current employer?",
    a: "Settings → Privacy & visibility → 'Hide from current employer'. We auto-detect any DSO listed as a current employer on your work history and block them. The toggle is off by default; flip it on if you want privacy from your current workplace. You can also manually block any DSO from the same screen — up to 100.",
  },
  {
    q: "What's the CE tracking tab for?",
    a: "Settings → Credentials lets you log every CE course you've completed — hours, provider, category, completion date — and attach the certificate PDF or photo. We store it privately in your account so you have a year-by-year record for license renewal. State-by-state CE-requirement matching is on the roadmap.",
  },
  {
    q: "How do I change the email I sign in with?",
    a: "Settings → Account → Email. Enter the new address; we send a 6-digit code to it. Type the code in to finalize the swap. We also email a heads-up to your old address with a 'this wasn't me' link in case someone tried to take over your account.",
  },
  {
    q: "How do I delete my account?",
    a: "Settings → Data & account → Delete my account. There's a 30-day soft-delete grace period — sign back in within that window and your account restores. After 30 days, your data is permanently removed. You can also export a ZIP of everything we have on you from the same screen.",
  },
];

export default function CandidateHelpPage() {
  return (
    <CandidateShell active="help">
      <div className="space-y-10 max-w-[820px]">
        <header>
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
            Help &amp; Support
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.8px] text-ink leading-tight">
            We&apos;re a real human email away.
          </h1>
        </header>

        {/* Contact */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href={SUPPORT_MAILTO}
            className="group border border-[var(--rule)] bg-white p-6 hover:border-heritage-deep transition-colors"
          >
            <Mail className="size-5 text-heritage-deep mb-3" />
            <h2 className="font-display text-lg font-bold text-ink mb-1">
              Email support
            </h2>
            <p className="text-[13px] text-slate-body leading-relaxed mb-3">
              The fastest path to support. Every message gets a real reply,
              typically within one business day.
            </p>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-heritage-deep">
              {SUPPORT_EMAIL}
              <ArrowRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </Link>

          <div className="border border-[var(--rule)] bg-white p-6">
            <MessageSquare className="size-5 text-heritage-deep mb-3" />
            <h2 className="font-display text-lg font-bold text-ink mb-1">
              In-app support
            </h2>
            <p className="text-[13px] text-slate-body leading-relaxed mb-3">
              Open the support drawer right here. We auto-attach the page
              you&apos;re on and a short snapshot of your recent activity
              so we can help fast.
            </p>
            <OpenSupportButton />
            <p className="mt-2 text-[11px] text-slate-meta">
              Tip: press <kbd className="px-1 py-0.5 rounded border border-[var(--rule)] bg-cream/60 font-mono text-[10px]">?</kbd> anywhere to open it.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="font-display text-xl font-bold text-ink mb-4 inline-flex items-center gap-2">
            <BookOpen className="size-4 text-heritage-deep" />
            Frequently asked
          </h2>
          <ul className="list-none divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
            {FAQS.map((f, i) => (
              <li key={i}>
                <details className="group">
                  <summary className="cursor-pointer flex items-start justify-between gap-4 py-4 list-none">
                    <span className="font-semibold text-ink text-[14px] leading-snug">
                      {f.q}
                    </span>
                    <span className="text-slate-meta group-open:rotate-90 transition-transform shrink-0">
                      ›
                    </span>
                  </summary>
                  <p className="text-[13px] text-slate-body leading-relaxed pb-4 pr-8">
                    {f.a}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </section>

        {/* Quick reference — pulled from the contextual-help registry so this
            page and the inline ⓘ tips stay in sync (Note 5). */}
        <section>
          <h2 className="font-display text-xl font-bold text-ink mb-2 inline-flex items-center gap-2">
            <BookOpen className="size-4 text-heritage-deep" />
            Quick reference
          </h2>
          <p className="text-[13px] text-slate-body leading-relaxed mb-4">
            Short explanations for the things you&apos;ll run into most. You&apos;ll
            also see the ⓘ icon next to these as you go.
          </p>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            {Object.entries(HELP_CONTENT)
              .filter(([, e]) => e.lens === "candidate" || e.lens === "both")
              .map(([key, e]) => (
                <div key={key}>
                  <dt className="text-[13px] font-bold text-ink">{e.title}</dt>
                  <dd className="mt-0.5 text-[12.5px] text-slate-body leading-relaxed">
                    {e.tip}
                  </dd>
                </div>
              ))}
          </dl>
        </section>

        <section className="border border-[var(--rule)] bg-cream/60 p-6">
          <h2 className="font-display text-base font-bold text-ink mb-2">
            Privacy + your data
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-slate-body leading-relaxed">
            <li>
              We never sell candidate data — not to data brokers, not to
              staffing agencies, not to anyone outside the dental groups you choose
              to interact with.
            </li>
            <li>
              We never collect Social Security numbers, dates of birth, or
              DEA registration. Even if your resume contains them, our parser
              ignores them.
            </li>
            <li>
              You can download a copy of your data or delete your account
              from{" "}
              <Link
                href="/candidate/settings/data"
                className="font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
              >
                Settings → Data &amp; account
              </Link>{" "}
              at any time.
            </li>
          </ul>
        </section>
      </div>
    </CandidateShell>
  );
}
