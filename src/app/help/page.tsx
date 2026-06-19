/**
 * /help — public help center landing.
 *
 * Reads from the same HELP_CONTENT registry that powers the in-app
 * contextual help drawers + the signed-in /employer/help and
 * /candidate/help pages. Single source of truth: edit copy in
 * src/lib/help/help-content.ts and it propagates to every surface.
 *
 * Public (no auth required) so prospects can find help docs via search
 * + Cam can link this from external comms without forcing a sign-in.
 * SEO-friendly h1/h2 hierarchy + meta description for each entry.
 *
 * Tab split is by audience lens (employer / candidate) with default
 * "all"; entries tagged lens=both appear in both tabs.
 *
 * Lockdown note: /help lives inside the coming-soon proxy gate until
 * the launch sweep lifts the gate. No special exemption — when launch
 * lifts the gate, /help becomes accessible alongside everything else.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail, ShieldCheck, UserRound, Users } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import {
  HELP_CONTENT,
  type HelpEntry,
} from "@/lib/help/help-content";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/contact";
import { HelpSearchClient } from "./help-search-client";

export const metadata: Metadata = {
  title: "Help center · DSO Hire",
  description:
    "How to post jobs, manage candidates, customize emails, bulk-add locations, and more. Searchable help docs for DSO Hire's dental hiring platform.",
};

/** Convert a registry key like "jd.overview" → URL-safe "jd-overview". */
function entryKeyToSlug(key: string): string {
  return key.replace(/\./g, "-");
}

interface CategorizedEntries {
  employer: Array<[string, HelpEntry]>;
  candidate: Array<[string, HelpEntry]>;
}

function categorize(): CategorizedEntries {
  const employer: Array<[string, HelpEntry]> = [];
  const candidate: Array<[string, HelpEntry]> = [];
  for (const [key, entry] of Object.entries(HELP_CONTENT)) {
    if (entry.lens === "employer" || entry.lens === "both") {
      employer.push([key, entry]);
    }
    if (entry.lens === "candidate" || entry.lens === "both") {
      candidate.push([key, entry]);
    }
  }
  employer.sort((a, b) => a[1].title.localeCompare(b[1].title));
  candidate.sort((a, b) => a[1].title.localeCompare(b[1].title));
  return { employer, candidate };
}

export default function HelpCenterPage() {
  const { employer, candidate } = categorize();

  // Flatten for the client-side search — keep both lenses together so a
  // single search box covers both audiences. The lens chip on each result
  // disambiguates.
  const searchEntries = Object.entries(HELP_CONTENT).map(([key, e]) => ({
    key,
    slug: entryKeyToSlug(key),
    title: e.title,
    tip: e.tip,
    lens: e.lens,
  }));

  return (
    <SiteShell>
      <div className="bg-cream/40 border-b border-[var(--rule)]">
        <div className="mx-auto max-w-[1100px] px-6 py-14 sm:py-20">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3 inline-flex items-center gap-2">
            <ShieldCheck className="size-3" />
            Help center
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-[-1.2px] text-ink leading-tight max-w-[680px]">
            How DSO Hire works, in plain language.
          </h1>
          <p className="mt-4 text-[15px] text-slate-body leading-relaxed max-w-[640px]">
            Quick answers and walkthroughs for both employers and candidates.
            Can&apos;t find what you need?{" "}
            <a
              href={SUPPORT_MAILTO}
              className="text-heritage-deep font-semibold underline underline-offset-2 hover:text-ink"
            >
              Email {SUPPORT_EMAIL}
            </a>{" "}
            — a real human replies, usually within one business day.
          </p>

          <div className="mt-7 max-w-[560px]">
            <HelpSearchClient entries={searchEntries} />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-6 py-14">
        <div className="grid gap-12 md:grid-cols-2">
          <HelpCategoryColumn
            label="For employers"
            icon={Users}
            entries={employer}
            description="Posting jobs, managing applicants, billing, security, team controls."
          />
          <HelpCategoryColumn
            label="For candidates"
            icon={UserRound}
            entries={candidate}
            description="Building your profile, applying to roles, privacy controls, credentials."
          />
        </div>

        <SupportCTA />
      </div>
    </SiteShell>
  );
}

/* ──────────────────────────────────────────────────────── */

function HelpCategoryColumn({
  label,
  icon: Icon,
  entries,
  description,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  entries: Array<[string, HelpEntry]>;
  description: string;
}) {
  return (
    <section>
      <div className="flex items-start gap-3 mb-5 pb-4 border-b border-[var(--rule)]">
        <Icon className="size-5 text-heritage-deep mt-0.5 shrink-0" />
        <div>
          <h2 className="font-display text-2xl font-bold tracking-[-0.4px] text-ink leading-tight">
            {label}
          </h2>
          <p className="mt-1 text-[13px] text-slate-meta leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      <ul className="space-y-1">
        {entries.map(([key, e]) => (
          <li key={key}>
            <Link
              href={`/help/${entryKeyToSlug(key)}`}
              className="group flex items-start gap-3 px-3 py-2.5 -mx-3 rounded hover:bg-cream/60 transition-colors"
            >
              <ArrowRight className="size-3.5 text-slate-meta mt-1 shrink-0 group-hover:text-heritage-deep group-hover:translate-x-0.5 transition-all" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-ink text-[14px] leading-tight">
                  {e.title}
                </div>
                <p className="mt-0.5 text-[12.5px] text-slate-meta leading-snug line-clamp-2">
                  {e.tip}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SupportCTA() {
  return (
    <div className="mt-16 border border-[var(--rule)] bg-card p-7 sm:p-8">
      <div className="flex items-start gap-4">
        <Mail className="size-5 text-heritage-deep mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-lg font-bold text-ink mb-1">
            Still stuck?
          </h3>
          <p className="text-[13px] text-slate-body leading-relaxed mb-3">
            Email is the fastest path. Every message gets a real reply —
            typically within one business day.
          </p>
          <a
            href={SUPPORT_MAILTO}
            className="inline-flex items-center gap-1.5 text-[12px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink"
          >
            {SUPPORT_EMAIL}
            <ArrowRight className="size-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

