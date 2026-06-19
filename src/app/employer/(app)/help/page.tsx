/**
 * /employer/help — support + FAQ surface.
 *
 * Substantive enough to act as a real Help page today (FAQ + contact +
 * documentation links), but tagged as expanding in later phases (in-app
 * support tickets, knowledge base search, etc.).
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Mail, MessageSquare, BookOpen } from "lucide-react";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/contact";
import { HELP_CONTENT } from "@/lib/help/help-content";
import { OpenSupportButton } from "./open-support-button";

export const metadata: Metadata = { title: "Help & Support" };

interface FaqEntry {
  q: string;
  // ReactNode so answers can embed clickable <Link> chips — most are
  // plain strings, the tier-difference entry links /pricing inline.
  a: ReactNode;
}

const FAQS: FaqEntry[] = [
  {
    q: "How do I post a job?",
    a: "From the Dashboard or the Jobs page, click 'Post a job'. The wizard walks you through Basics, Description (with the AI JD generator on Growth+), Compensation, Screening Questions, and Status. You can save as Draft and finish later.",
  },
  {
    q: "What does the kanban view do?",
    a: "Open any job, then 'View Pipeline' to see applications grouped by stage (New / Reviewed / Interviewed / Offered / Hired / Rejected). Drag candidates between columns or use the Stage selector on each card. Bulk-select to move multiple at once.",
  },
  {
    q: "Can I customize the emails candidates receive?",
    a: (
      <>
        Two tiers of customization, both at{" "}
        <Link
          href="/employer/settings/templates"
          className="text-heritage-deep font-semibold underline underline-offset-2 hover:text-ink"
        >
          Settings → Email templates
        </Link>
        . The 3 <strong>automatic emails</strong> (apply confirmation,
        message-received, stage-moved) are editable on every paid tier
        including Solo — change the subject and body, use mergefields
        like {"{{candidate.first_name}}"} and {"{{job.title}}"}. On
        Growth+, you also get <strong>unlimited custom templates</strong>{" "}
        you author yourself (interview prep, offer follow-ups, no-show
        outreach) and send on demand from any candidate&apos;s profile.
      </>
    ),
  },
  {
    q: "How do I send a one-off email to a specific candidate?",
    a: "Growth+ feature. Open the candidate's application detail page → click 'Send email' next to the Pipeline stage → pick one of your custom templates → preview the rendered version with merge fields filled in → send. The send writes to the audit log and the email log so you have a record.",
  },
  {
    q: "Can I add a bunch of locations at once from a spreadsheet?",
    a: (
      <>
        Yes —{" "}
        <Link
          href="/employer/locations/bulk"
          className="text-heritage-deep font-semibold underline underline-offset-2 hover:text-ink"
        >
          Locations → Bulk Import
        </Link>
        . Upload a CSV or Excel file with one row per practice. Required
        columns: name, city, state (2-letter code). Optional: street
        address, suite/unit, ZIP, practice website. Download the sample
        CSV from the page if you want a template to start from. Caps:
        1,000 rows / 5 MB per upload, split larger batches.
      </>
    ),
  },
  {
    q: "How do I set up two-factor authentication?",
    a: (
      <>
        Optional security upgrade —{" "}
        <Link
          href="/employer/settings/account"
          className="text-heritage-deep font-semibold underline underline-offset-2 hover:text-ink"
        >
          Settings → Account → Two-factor authentication
        </Link>
        . Scan the QR code with 1Password, Authy, Apple Passwords, or
        Google Authenticator, enter a 6-digit code to verify, and save
        the 10 recovery codes somewhere safe. On future sign-ins, leave
        &quot;Trust this device for 30 days&quot; checked and you won&apos;t
        be prompted again on that browser until the cookie expires.
        Owners can also flip &quot;Require 2FA for the whole DSO&quot;
        on the same page to mandate it across your team.
      </>
    ),
  },
  {
    q: "How do I add team members?",
    a: "Team page → Invite teammate. Choose a role (Owner / Admin / Recruiter / Hiring Manager) and, for Hiring Managers, scope to specific locations. They get an invite email; their access starts the moment they accept.",
  },
  {
    q: "What's the difference between Solo, Growth, Scale, and Enterprise?",
    a: (
      <>
        See the full feature matrix on the{" "}
        <Link
          href="/pricing"
          className="text-heritage-deep font-semibold underline underline-offset-2 hover:text-ink"
        >
          pricing page
        </Link>
        . Quick version: Solo is for smaller groups getting started; Growth adds
        the tools multi-location dental groups lean on day to day; Scale fits larger,
        multi-region operations; and Enterprise layers on dedicated support,
        SSO, audit log, and API access for the largest, most complex groups.
        Every paying tier gets every feature in its plan — there&apos;s no
        feature gating beyond the tier you&apos;re on.
      </>
    ),
  },
];

export default function HelpPage() {
  return (
    <>
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
            className="group border border-[var(--rule)] bg-card p-6 hover:border-heritage-deep transition-colors"
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

          <div className="border border-[var(--rule)] bg-card p-6">
            <MessageSquare className="size-5 text-heritage-deep mb-3" />
            <h2 className="font-display text-lg font-bold text-ink mb-1">
              In-app support
            </h2>
            <p className="text-[13px] text-slate-body leading-relaxed mb-3">
              Open the support drawer right here. We auto-attach the page
              you&apos;re on, your role + plan, and your last 5 actions
              so triage is fast.
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

        {/* Quick reference — pulled straight from the contextual-help registry
            so this page and the inline ⓘ tips never drift (Note 5). */}
        <section>
          <h2 className="font-display text-xl font-bold text-ink mb-2 inline-flex items-center gap-2">
            <BookOpen className="size-4 text-heritage-deep" />
            Quick reference
          </h2>
          <p className="text-[13px] text-slate-body leading-relaxed mb-4">
            Short explanations for the features you&apos;ll touch most. You&apos;ll
            also see the ⓘ icon next to these throughout the app.
          </p>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            {Object.entries(HELP_CONTENT)
              .filter(([, e]) => e.lens === "employer" || e.lens === "both")
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
      </div>
    </>
  );
}
