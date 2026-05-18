/**
 * /employer/help — support + FAQ surface.
 *
 * Substantive enough to act as a real Help page today (FAQ + contact +
 * documentation links), but tagged as expanding in later phases (in-app
 * support tickets, knowledge base search, etc.).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail, MessageSquare, BookOpen } from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/contact";

export const metadata: Metadata = { title: "Help & Support" };

interface FaqEntry {
  q: string;
  a: string;
}

const FAQS: FaqEntry[] = [
  {
    q: "How do I post a job?",
    a: "From the Dashboard or the Jobs page, click 'Post a job'. The wizard walks you through Basics, Description (with the AI JD generator on Founding+), Compensation, Screening Questions, and Status. You can save as Draft and finish later.",
  },
  {
    q: "What does the kanban view do?",
    a: "Open any job, then 'View Pipeline' to see applications grouped by stage (New / Reviewed / Interviewed / Offered / Hired / Rejected). Drag candidates between columns or use the Stage selector on each card. Bulk-select to move multiple at once.",
  },
  {
    q: "Can I customize the emails candidates receive?",
    a: "Yes — Settings → Email templates. Growth+ tier unlocks subject + body customization for the apply confirmation, message-received, and stage-moved emails with mergefields like {{candidate.first_name}} and {{job.title}}.",
  },
  {
    q: "How do I add team members?",
    a: "Team page → Invite teammate. Choose a role (Owner / Admin / Recruiter / Hiring Manager) and, for Hiring Managers, scope to specific locations. They get an invite email; their access starts the moment they accept.",
  },
  {
    q: "What's the difference between Starter, Growth, and Enterprise?",
    a: "See the full feature matrix at /pricing. Quick version: Starter (10+ practices) is the job-board basics. Growth (multi-location DSOs) adds the kanban, scorecards, AI matching, and per-location analytics. Enterprise (35+ practices) layers on dedicated CSM, SSO, audit log, and API access.",
  },
];

export default function HelpPage() {
  return (
    <EmployerShell active="help">
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

          <div className="border border-[var(--rule)] bg-cream/40 p-6">
            <MessageSquare className="size-5 text-slate-meta mb-3" />
            <h2 className="font-display text-lg font-bold text-ink mb-1">
              In-app support
            </h2>
            <p className="text-[13px] text-slate-body leading-relaxed">
              Coming with the broader Help &amp; Support refresh. For now,
              email is the fastest path.
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
      </div>
    </EmployerShell>
  );
}
