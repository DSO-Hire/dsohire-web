/**
 * /for-[role] — dynamic role-specific landing pages.
 *
 * One file → six rendered pages: /for-dentists, /for-specialists,
 * /for-hygienists, /for-dental-assistants, /for-front-desk, and
 * /for-office-managers.
 *
 * Config lives in `./role-config.ts`. Adding a new role page is as simple
 * as appending an entry to the ROLE_CONFIGS array — no new file required.
 *
 * Page structure mirrors /for-candidates (the hub) but is fully role-
 * specific. Each role page links back to /for-candidates and sideways to
 * other related role pages, so the candidate-side mini-site is internally
 * navigable from any entry point.
 *
 * Static params are pre-generated at build time so all six pages are
 * statically rendered (good for SEO, no per-request DB hit).
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import {
  ROLE_BY_SLUG,
  ROLE_CONFIGS,
  ROLE_SLUGS,
  type RoleConfig,
} from "./role-config";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ role: string }>;
}

export function generateStaticParams() {
  return ROLE_SLUGS.map((role) => ({ role }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { role } = await params;
  const config = ROLE_BY_SLUG[role];
  if (!config) return { title: "Role not found" };
  return {
    title: `For ${config.label}`,
    description: config.metaDescription,
  };
}

export default async function RolePage({ params }: PageProps) {
  const { role } = await params;
  const config = ROLE_BY_SLUG[role];
  if (!config) notFound();

  return (
    <SiteShell>
      <Hero config={config} />
      <Advantages config={config} />
      <CareerPath config={config} />
      <Compensation config={config} />
      <RelatedRoles config={config} />
      <FinalCta config={config} />
    </SiteShell>
  );
}

/* ───────── Hero ───────── */

function Hero({ config }: { config: RoleConfig }) {
  const { hero, eyebrow, label, Icon, jobsFilterHref } = config;

  // Split the headline so we can wrap the accent phrase in styled span.
  const accentIndex = hero.headline
    .toLowerCase()
    .indexOf(hero.headlineAccent.toLowerCase());
  const before =
    accentIndex >= 0 ? hero.headline.slice(0, accentIndex) : hero.headline;
  const accent =
    accentIndex >= 0
      ? hero.headline.slice(accentIndex, accentIndex + hero.headlineAccent.length)
      : "";
  const after =
    accentIndex >= 0
      ? hero.headline.slice(accentIndex + hero.headlineAccent.length)
      : "";

  return (
    <section className="relative overflow-hidden pt-[140px] pb-20 px-6 sm:px-14">
      {/* Soft heritage glow */}
      <div
        aria-hidden
        className="absolute -top-[10%] -right-[15%] w-[60vw] h-[60vw] pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, var(--heritage-glow), transparent 60%)",
          filter: "blur(40px)",
        }}
      />

      <div className="relative z-10 max-w-[1100px] mx-auto">
        {/* Breadcrumb back to the hub */}
        <Link
          href="/for-candidates"
          className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-8"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Dental Careers
        </Link>

        {/* Role badge + eyebrow */}
        <div className="flex items-center gap-3.5 mb-6">
          <div className="h-11 w-11 rounded-full bg-heritage/15 flex items-center justify-center flex-shrink-0">
            <Icon className="h-5 w-5 text-heritage-deep" />
          </div>
          <div>
            <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep">
              For {label}
            </div>
            <div className="text-[12px] tracking-[0.4px] text-slate-meta">
              {eyebrow}
            </div>
          </div>
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-[-1.5px] leading-[1.04] text-ink mb-7 max-w-[920px]">
          {before}
          {accent && (
            <em className="not-italic relative whitespace-nowrap text-heritage-light">
              {accent}
              <span
                aria-hidden
                className="absolute left-0 right-0 bottom-1.5 h-2 -z-10"
                style={{ background: "var(--heritage-tint)" }}
              />
            </em>
          )}
          {after}
        </h1>

        <p className="text-lg sm:text-xl text-slate-body leading-[1.65] max-w-[640px] mb-10">
          {hero.sub}
        </p>

        <div className="flex flex-wrap items-center gap-3.5">
          <Link
            href={jobsFilterHref}
            className="inline-flex items-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
          >
            Browse {label} Roles
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/candidate/sign-up"
            className="inline-flex items-center px-9 py-[15px] border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[2px] uppercase hover:border-ink hover:bg-cream transition-colors"
          >
            Create a Free Profile
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ───────── Advantages ───────── */

function Advantages({ config }: { config: RoleConfig }) {
  return (
    <section className="bg-cream/60 border-y border-[var(--rule)] px-6 sm:px-14 py-24">
      <div className="max-w-[1100px] mx-auto">
        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
          Why a DSO
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink mb-12 max-w-[760px]">
          What&apos;s in it for you, specifically.
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-[var(--rule)] border border-[var(--rule)]">
          {config.advantages.map((adv, i) => (
            <div
              key={i}
              className="bg-white p-7 sm:p-8 hover:bg-cream/30 transition-colors"
            >
              <div className="flex items-start gap-3.5">
                <div className="h-7 w-7 rounded-full bg-heritage/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[11px] font-extrabold text-heritage-deep">
                    {i + 1}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[16px] font-extrabold tracking-[-0.3px] text-ink mb-2 leading-tight">
                    {adv.title}
                  </h3>
                  <p className="text-[14px] text-slate-body leading-[1.7]">
                    {adv.body}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────── Career path ───────── */

function CareerPath({ config }: { config: RoleConfig }) {
  return (
    <section className="px-6 sm:px-14 py-24 max-w-[820px] mx-auto">
      <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
        Where it leads
      </div>
      <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink mb-10">
        {config.careerPath.title}
      </h2>
      <div className="space-y-6 text-[16px] sm:text-[17px] text-ink leading-[1.75]">
        {config.careerPath.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  );
}

/* ───────── Compensation ───────── */

function Compensation({ config }: { config: RoleConfig }) {
  return (
    <section
      className="px-6 sm:px-14 py-20 relative overflow-hidden"
      style={{ background: "var(--heritage-tint)" }}
    >
      <div
        aria-hidden
        className="absolute -bottom-[20%] -left-[15%] w-[50vw] h-[50vw] pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(77,122,96,0.18), transparent 60%)",
          filter: "blur(40px)",
        }}
      />
      <div className="relative max-w-[820px] mx-auto">
        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
          Compensation context
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-[-1.2px] leading-[1.1] text-ink mb-6">
          {config.compensation.title}
        </h2>
        <div className="text-[20px] sm:text-[24px] font-extrabold tracking-[-0.4px] text-heritage-deep mb-5">
          {config.compensation.range}
        </div>
        <p className="text-[15px] text-ink leading-[1.75] max-w-[680px]">
          {config.compensation.notes}
        </p>
        <p className="mt-5 text-[13px] text-slate-meta italic leading-[1.6]">
          Directional ranges based on industry observation as of 2026. Not a
          guarantee. Every job listing on DSO Hire surfaces the DSO&apos;s
          specific comp where they share it.
        </p>
      </div>
    </section>
  );
}

/* ───────── Related roles cross-link ───────── */

function RelatedRoles({ config }: { config: RoleConfig }) {
  if (config.relatedRoles.length === 0) return null;

  // Pull the related role configs so we can render their icons + eyebrows too.
  const related = config.relatedRoles
    .map((r) => ROLE_BY_SLUG[r.slug])
    .filter((r): r is RoleConfig => r !== undefined);

  return (
    <section className="px-6 sm:px-14 py-24 max-w-[1100px] mx-auto">
      <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
        Looking for a different role?
      </div>
      <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.8px] leading-tight text-ink mb-10 max-w-[640px]">
        Other roles that often pair with this one.
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[var(--rule)] border border-[var(--rule)]">
        {related.map((r) => (
          <Link
            key={r.slug}
            href={`/for-${r.slug}`}
            className="group bg-white p-6 hover:bg-cream/40 transition-colors flex items-center gap-4"
          >
            <div className="h-10 w-10 rounded-full bg-heritage/15 flex items-center justify-center flex-shrink-0 group-hover:bg-heritage/25 transition-colors">
              <r.Icon className="h-4 w-4 text-heritage-deep" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[9px] font-bold tracking-[1.5px] uppercase text-heritage-deep mb-0.5">
                {r.eyebrow}
              </div>
              <div className="text-[15px] font-extrabold tracking-[-0.2px] text-ink leading-tight">
                For {r.label}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-meta group-hover:text-heritage transition-colors flex-shrink-0" />
          </Link>
        ))}
      </div>

      <div className="mt-8">
        <Link
          href="/for-candidates"
          className="inline-flex items-center gap-2 text-[12px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink transition-colors"
        >
          See all dental careers on DSO Hire
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

/* ───────── Final CTA ───────── */

function FinalCta({ config }: { config: RoleConfig }) {
  return (
    <section
      className="relative overflow-hidden px-6 sm:px-14 py-24 text-center"
      style={{ background: "var(--heritage-tint)" }}
    >
      <div
        aria-hidden
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[60vw] pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(77,122,96,0.22), transparent 60%)",
          filter: "blur(50px)",
        }}
      />
      <div className="relative max-w-[760px] mx-auto">
        <div className="flex items-center justify-center gap-3.5 mb-6">
          <Sparkles className="h-4 w-4 text-heritage-deep" />
          <span className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep">
            Find your next {config.label.toLowerCase().replace(/s$/, "")} role
          </span>
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink mb-5">
          Ready to see what&apos;s open?
        </h2>
        <p className="text-[15px] sm:text-[16px] text-slate-body leading-[1.7] mb-9 max-w-[560px] mx-auto">
          Browse current {config.label.toLowerCase()} roles at verified DSOs,
          or create a free profile so the right openings find you.
        </p>
        <div className="flex flex-wrap gap-3.5 justify-center">
          <Link
            href={config.jobsFilterHref}
            className="inline-flex items-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
          >
            Browse {config.label} Roles
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/candidate/sign-up"
            className="inline-flex items-center px-9 py-[15px] bg-heritage text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-heritage-deep transition-colors"
          >
            Create a Free Profile
          </Link>
        </div>
      </div>
    </section>
  );
}
