/**
 * /security — #115 FOH-6: the trust page for the IT-veto stakeholder.
 *
 * CLAIMS POLICY: everything on this page states the REAL shipped posture
 * (row-level security on every table, the EEO firewall, the anonymity
 * architecture, opt-in MFA, audit logging, granular permissions) and is
 * EXPLICITLY honest about the roadmap items (SOC 2, pen test, BAA) — the
 * honesty IS the trust play. Never claim a certification we don't hold.
 */

import Link from "next/link";
import {
  ArrowRight,
  Database,
  EyeOff,
  FileCheck,
  KeyRound,
  Lock,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import { INFO_EMAIL, INFO_MAILTO } from "@/lib/contact";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security & Trust — DSO Hire",
  description:
    "How DSO Hire protects candidate and practice data: row-level security on every table, encryption in transit and at rest, an EEO data firewall, candidate anonymity architecture, audit logging, per-teammate permissions, and an honest compliance roadmap.",
};

const PILLARS = [
  {
    icon: Database,
    title: "Row-level security on every table",
    body: "Access control is enforced in the database itself, not just the application. Every query a user runs is filtered by Postgres row-level security policies — a recruiter physically cannot read another organization's data, even if application code had a bug. Server-side permission checks sit on top as a second layer.",
  },
  {
    icon: Lock,
    title: "Encrypted in transit and at rest",
    body: "All traffic is TLS-encrypted. Data is encrypted at rest on our database infrastructure (Supabase / AWS). Payments are processed entirely by Stripe — card numbers never touch our servers.",
  },
  {
    icon: EyeOff,
    title: "Candidate anonymity, architecturally",
    body: "Anonymous mode masks a candidate's name and photo from every employer they haven't applied to — enforced by shared masking helpers on every discovery surface, not page-by-page goodwill. Private-practice affiliations are masked in every candidate-facing email and page by the same rule.",
  },
  {
    icon: ShieldCheck,
    title: "The EEO firewall",
    body: "Voluntary EEO self-identification data is stored in a separate table with NO employer read path — not a hidden one, a nonexistent one. Hiring decision-makers cannot see individual demographic data on this platform, by construction. This mirrors EEOC/OFCCP guidance.",
  },
  {
    icon: UserCheck,
    title: "Per-teammate permissions + audit log",
    body: "Owners and admins tune exactly what each teammate can see and do — down to hiding compensation fields — and can restrict sensitive searches to named people. Role changes, permission grants, offers, and exports are recorded in an audit log.",
  },
  {
    icon: KeyRound,
    title: "MFA + session controls",
    body: "Two-factor authentication is available to every account and can be required organization-wide by the owner. Sensitive surfaces re-verify; trusted devices are scoped and expire.",
  },
];

const ROADMAP = [
  {
    item: "SOC 2 Type II",
    status: "Planned — engagement begins alongside our first Enterprise deployments.",
  },
  {
    item: "Third-party penetration test",
    status: "Scheduled within 60 days of public launch; summary available to customers under NDA.",
  },
  {
    item: "BAA / HIPAA-aware posture",
    status: "On the Enterprise roadmap. Note: DSO Hire processes hiring data, not patient PHI.",
  },
];

export default function SecurityPage() {
  return (
    <SiteShell>
      {/* Hero */}
      <section className="pt-[140px] pb-14 px-6 sm:px-14 max-w-[1240px] mx-auto">
        <div data-reveal className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
          Security &amp; Trust
        </div>
        <h1
          data-reveal
          style={{ "--mk-delay": "70ms" } as React.CSSProperties}
          className="text-4xl sm:text-6xl font-extrabold tracking-[-2px] leading-[1.05] text-ink mb-5 max-w-[820px]"
        >
          Your candidates&apos; data is the product we protect hardest.
        </h1>
        <p
          data-reveal
          style={{ "--mk-delay": "140ms" } as React.CSSProperties}
          className="text-lg text-slate-body leading-[1.7] max-w-[680px]"
        >
          A hiring platform holds compensation data, employment histories, and
          people quietly looking for their next role. Here&apos;s exactly how
          DSO Hire is built to protect all three — and an honest account of
          what&apos;s still on the roadmap.
        </p>
      </section>

      {/* Pillars */}
      <section className="px-6 sm:px-14 pb-20 max-w-[1240px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-[var(--rule)] border border-[var(--rule)]">
          {PILLARS.map((p, i) => (
            <div
              key={p.title}
              data-reveal
              style={{ "--mk-delay": `${(i % 3) * 80}ms` } as React.CSSProperties}
              className="bg-card p-8"
            >
              <span
                className="inline-flex items-center justify-center w-10 h-10 mb-5 text-heritage-deep"
                style={{ background: "var(--heritage-tint)" }}
                aria-hidden
              >
                <p.icon className="h-5 w-5" />
              </span>
              <h2 className="text-[17px] font-extrabold tracking-[-0.4px] leading-tight text-ink mb-2.5">
                {p.title}
              </h2>
              <p className="text-[14px] text-slate-body leading-[1.65]">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Infrastructure + subprocessors */}
      <section className="bg-cream border-y border-[var(--rule)] px-6 sm:px-14 py-20">
        <div className="max-w-[1240px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div data-reveal>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.8px] text-ink mb-4">
              Infrastructure
            </h2>
            <p className="text-[15px] text-slate-body leading-[1.7]">
              DSO Hire runs on Vercel (application) and Supabase on AWS
              (Postgres database, authentication, file storage) with automated
              backups. Email is delivered through Resend with per-category
              one-click unsubscribe. Our AI features run on Anthropic&apos;s
              Claude models with spend circuit-breakers; AI features read
              your data to answer questions — your data is not used to train
              models.
            </p>
          </div>
          <div data-reveal style={{ "--mk-delay": "90ms" } as React.CSSProperties}>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.8px] text-ink mb-4">
              Your data, your call
            </h2>
            <p className="text-[15px] text-slate-body leading-[1.7]">
              Owners can export their organization&apos;s complete data or
              delete the organization outright from Settings — no support
              ticket required. We don&apos;t sell candidate data, we
              don&apos;t broker résumés, and candidates can delete their
              accounts and data themselves.
            </p>
          </div>
        </div>
      </section>

      {/* Honest roadmap */}
      <section className="px-6 sm:px-14 py-20 max-w-[1240px] mx-auto">
        <div data-reveal className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
          The Honest Part
        </div>
        <h2
          data-reveal
          style={{ "--mk-delay": "70ms" } as React.CSSProperties}
          className="text-2xl sm:text-4xl font-extrabold tracking-[-1.2px] text-ink mb-8 max-w-[680px]"
        >
          What we don&apos;t have yet — and when we will.
        </h2>
        <ul className="list-none border-t border-[var(--rule)] max-w-[820px]">
          {ROADMAP.map((r) => (
            <li
              key={r.item}
              data-reveal
              className="py-5 border-b border-[var(--rule)] flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-8"
            >
              <span className="sm:w-[260px] shrink-0 inline-flex items-center gap-2 text-[15px] font-extrabold text-ink">
                <FileCheck className="h-4 w-4 text-heritage-deep shrink-0" />
                {r.item}
              </span>
              <span className="text-[14px] text-slate-body leading-relaxed">{r.status}</span>
            </li>
          ))}
        </ul>
        <p data-reveal className="mt-8 text-[14px] text-slate-body leading-relaxed max-w-[680px]">
          Security questions, disclosure reports, or due-diligence requests:{" "}
          <Link href={INFO_MAILTO} className="font-semibold text-heritage-deep underline underline-offset-2 hover:text-ink transition-colors">
            {INFO_EMAIL}
          </Link>
          . We answer fast and we don&apos;t bluff.
        </p>
      </section>

      {/* CTA */}
      <section className="bg-hero text-hero-foreground px-6 sm:px-14 py-20">
        <div className="max-w-[820px] mx-auto text-center">
          <h2 data-reveal className="text-3xl sm:text-4xl font-extrabold tracking-[-1.2px] leading-[1.1] mb-4">
            Bring your compliance team.
          </h2>
          <p
            data-reveal
            style={{ "--mk-delay": "70ms" } as React.CSSProperties}
            className="text-base text-hero-foreground/65 leading-[1.7] max-w-[520px] mx-auto mb-9"
          >
            We&apos;d rather answer the hard questions before you buy than
            after. Walk the platform with whoever signs off on vendors.
          </p>
          <Link
            data-reveal
            style={{ "--mk-delay": "140ms" } as React.CSSProperties}
            href="/contact"
            className="inline-flex items-center gap-2.5 px-9 py-4 bg-ivory text-ink text-[12px] font-bold tracking-[2px] uppercase hover:bg-ivory-deep transition-colors"
          >
            Talk To Us
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}
