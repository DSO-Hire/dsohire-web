/**
 * ReportShell: the frame every DSO Hire Research report shares.
 *
 * Modeled on the EDC "Multiples Watch" editorial pattern: kicker, big
 * headline with a heritage accent, dek, byline + date + read time; then
 * the body; then "Methodology and sources" with the editorial policy line
 * and the numbered bibliography; then the CTA band.
 *
 * Emits Article + BreadcrumbList JSON-LD (FAQPage is added by the page
 * via <ReportFaq />, from the same array it renders). Robots for the
 * draft gate are set in each page's metadata via researchRobots().
 */

import Link from "next/link";
import { Eyebrow } from "@/components/brand/eyebrow";
import { CtaBand } from "@/components/marketing/cta-band";
import { SiteShell } from "@/components/marketing/site-shell";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd, faqPageJsonLd, type FaqEntry } from "@/components/seo/schema";
import { INFO_EMAIL, INFO_MAILTO } from "@/lib/contact";
import {
  researchPath,
  type ResearchReportMeta,
  type ResearchSource,
} from "@/lib/research/reports";
import { researchArticleJsonLd } from "@/lib/research/schema";
import { SourcesList } from "./sources-list";

export const EDITORIAL_POLICY =
  "Where a number comes from a firm with something to sell, including us, we say so.";

/** Shared prose rhythm for report body copy (rem type, no px sizes). */
export const PROSE =
  "max-w-[720px] text-base leading-[1.75] text-slate-body [&_p+p]:mt-5 [&_strong]:text-ink [&_strong]:font-bold [&_a]:text-heritage-deep [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-ink [&_ul]:mt-5 [&_ul]:space-y-3 [&_ul]:list-none [&_li]:relative [&_li]:pl-5 [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-[0.85em] [&_li]:before:h-px [&_li]:before:w-2.5 [&_li]:before:bg-heritage";

export function ReportShell({
  report,
  kicker,
  title,
  dek,
  sources,
  accessed,
  methodology,
  cta,
  children,
}: {
  report: ResearchReportMeta;
  kicker: string;
  /** Headline; wrap the accent phrase in <Accent>. */
  title: React.ReactNode;
  dek: React.ReactNode;
  sources: readonly ResearchSource[];
  accessed?: string;
  methodology: React.ReactNode;
  cta: { title: React.ReactNode; sub: React.ReactNode };
  children: React.ReactNode;
}) {
  const path = researchPath(report.slug);
  return (
    <SiteShell ctaIntent="dso">
      <JsonLd data={researchArticleJsonLd(report, sources)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Research", path: "/research" },
          { name: report.shortTitle, path },
        ])}
      />

      <article>
        <header className="relative border-b border-[var(--rule)] bg-cream">
          <div className="px-6 sm:px-14 pt-[120px] sm:pt-[140px] pb-12 sm:pb-16 max-w-[1040px] mx-auto">
            <nav aria-label="Breadcrumb" className="mb-8">
              <ol className="list-none flex flex-wrap items-center gap-2 text-xs text-slate-meta">
                <li>
                  <Link href="/research" className="font-semibold text-heritage-deep hover:text-ink">
                    Research
                  </Link>
                </li>
                <li aria-hidden>/</li>
                <li aria-current="page" className="truncate max-w-[60vw]">
                  {report.shortTitle}
                </li>
              </ol>
            </nav>
            <Eyebrow className="text-heritage-deep mb-4">{kicker}</Eyebrow>
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-[-0.045em] leading-[1.03] text-ink max-w-[900px] text-balance">
              {title}
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-slate-body leading-[1.6] max-w-[700px] text-pretty">
              {dek}
            </p>
            <dl className="mt-9 pt-5 border-t border-[var(--rule-strong)] flex flex-wrap gap-x-8 gap-y-3 text-xs">
              <div>
                <dt className="sr-only">Author</dt>
                <dd>
                  <span className="font-bold text-ink">By {report.author.name}</span>
                  <span className="text-slate-meta">, {report.author.role}</span>
                </dd>
              </div>
              <div>
                <dt className="sr-only">Published</dt>
                <dd className="text-slate-body">
                  <time dateTime={report.datePublished}>{report.dateLabel}</time>
                </dd>
              </div>
              <div>
                <dt className="sr-only">Reading time</dt>
                <dd className="text-slate-body">{report.readMinutes} min read</dd>
              </div>
            </dl>
          </div>
        </header>

        <div className="px-6 sm:px-14 pt-12 sm:pt-16 pb-20 max-w-[1040px] mx-auto">
          {children}

          <section
            id="methodology"
            aria-labelledby="methodology-heading"
            className="mt-20 pt-10 border-t-2 border-ink scroll-mt-28"
          >
            <Eyebrow className="text-heritage-deep mb-2">Methodology and sources</Eyebrow>
            <h2
              id="methodology-heading"
              className="text-2xl sm:text-3xl font-extrabold tracking-[-0.03em] leading-[1.15] text-ink mb-6"
            >
              How we built this report
            </h2>
            <div className={PROSE}>
              {methodology}
              <p>
                <strong>Editorial policy.</strong> {EDITORIAL_POLICY} Corrections and
                newer rate cards are welcome at{" "}
                <a href={INFO_MAILTO}>{INFO_EMAIL}</a>.
              </p>
            </div>
            <h3 className="mt-10 mb-4 text-lg font-extrabold tracking-[-0.02em] text-ink">
              Sources
            </h3>
            <SourcesList sources={sources} accessed={accessed} />
          </section>
        </div>
      </article>

      <CtaBand
        eyebrow="DSO Hire"
        title={cta.title}
        sub={cta.sub}
        sourceContext={{ page: "research", report: report.slug }}
      />
    </SiteShell>
  );
}

/** Heritage-colored accent phrase inside a report headline. */
export function Accent({ children }: { children: React.ReactNode }) {
  return <span className="text-heritage">{children}</span>;
}

/** A numbered report section: kicker + h2 + body. */
export function ReportSection({
  id,
  kicker,
  title,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="mt-16 sm:mt-20 scroll-mt-28">
      <Eyebrow className="text-heritage-deep mb-2">{kicker}</Eyebrow>
      <h2
        id={`${id}-heading`}
        className="text-3xl sm:text-4xl font-extrabold tracking-[-0.035em] leading-[1.1] text-ink mb-6 max-w-[820px] text-balance"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Body copy block with the shared prose rhythm. */
export function Prose({ children }: { children: React.ReactNode }) {
  return <div className={PROSE}>{children}</div>;
}

/**
 * Visible FAQ + FAQPage JSON-LD from the same array. Answers are plain
 * strings (JSON-LD needs text) and must restate facts cited in the body.
 */
export function ReportFaq({ items }: { items: readonly FaqEntry[] }) {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="mt-16 sm:mt-20 scroll-mt-28">
      <JsonLd data={faqPageJsonLd(items)} />
      <Eyebrow className="text-heritage-deep mb-2">FAQ</Eyebrow>
      <h2
        id="faq-heading"
        className="text-3xl sm:text-4xl font-extrabold tracking-[-0.035em] leading-[1.1] text-ink mb-6"
      >
        Common questions
      </h2>
      <dl className="max-w-[760px] border-t border-[var(--rule)]">
        {items.map((f) => (
          <div key={f.q} className="py-5 border-b border-[var(--rule)]">
            <dt className="text-base font-extrabold tracking-[-0.01em] text-ink leading-snug">
              {f.q}
            </dt>
            <dd className="mt-2 text-sm text-slate-body leading-[1.7]">{f.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
