/**
 * /research: DSO Hire Research index.
 *
 * Lists every report in RESEARCH_REPORTS (src/lib/research/reports.ts).
 * Draft gate: robots come from researchRobots(); while RESEARCH_PUBLISHED
 * is false this page and every report are noindex,nofollow, and none of
 * them are linked from the sitemap, llms.txt, nav or footer (see the TODO
 * list in src/lib/research/config.ts).
 */

import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Eyebrow } from "@/components/brand/eyebrow";
import { SiteShell } from "@/components/marketing/site-shell";
import { EDITORIAL_POLICY } from "@/components/research/report-shell";
import { JsonLd } from "@/components/seo/json-ld";
import { absoluteUrl, breadcrumbJsonLd, ORG_ID } from "@/components/seo/schema";
import { researchRobots } from "@/lib/research/config";
import { RESEARCH_REPORTS, researchPath } from "@/lib/research/reports";

const DESCRIPTION =
  "Sourced research on what dental hiring costs: placement fees, temp platform pricing, job boards and vacancy costs. Every number cited, every calculation labeled.";

export const metadata: Metadata = {
  title: { absolute: "DSO Hire Research | Dental hiring costs, sourced" },
  description: DESCRIPTION,
  alternates: { canonical: "/research" },
  robots: researchRobots(),
  openGraph: {
    title: "DSO Hire Research",
    description: DESCRIPTION,
    url: "https://dsohire.com/research",
    type: "website",
  },
};

export default function ResearchIndexPage() {
  const reports = [...RESEARCH_REPORTS].sort((a, b) =>
    b.datePublished.localeCompare(a.datePublished),
  );
  return (
    <SiteShell ctaIntent="dso">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Research", path: "/research" },
        ])}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "DSO Hire Research",
          description: DESCRIPTION,
          url: absoluteUrl("/research"),
          publisher: { "@id": ORG_ID },
          hasPart: reports.map((r) => ({
            "@type": "Article",
            headline: r.title,
            url: absoluteUrl(researchPath(r.slug)),
            datePublished: r.datePublished,
          })),
        }}
      />

      <header className="bg-cream border-b border-[var(--rule)]">
        <div className="px-6 sm:px-14 pt-[120px] sm:pt-[140px] pb-12 sm:pb-16 max-w-[1040px] mx-auto">
          <Eyebrow className="text-heritage-deep mb-4">DSO Hire Research</Eyebrow>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-[-0.045em] leading-[1.03] text-ink max-w-[860px] text-balance">
            What dental hiring <span className="text-heritage">actually costs.</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-slate-body leading-[1.6] max-w-[680px] text-pretty">
            Reports for operators at multi-location dental groups, built from published rate
            cards, government data and association research. Every number is cited, and
            every calculation of ours is labeled. {EDITORIAL_POLICY}
          </p>
        </div>
      </header>

      <section className="px-6 sm:px-14 py-14 sm:py-20 max-w-[1040px] mx-auto">
        <h2 className="sr-only">Reports</h2>
        <ul className="list-none border-t border-[var(--rule-strong)]">
          {reports.map((r, i) => (
            <li key={r.slug} className="border-b border-[var(--rule-strong)]">
              <Link
                href={researchPath(r.slug)}
                className="group grid grid-cols-1 sm:grid-cols-[5rem_minmax(0,1fr)_auto] gap-x-8 gap-y-3 py-8 sm:py-10 hover:bg-card transition-colors"
              >
                <span className="text-3xl font-extrabold text-heritage tabular leading-none" aria-hidden>
                  {String(reports.length - i).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs text-slate-meta mb-2">
                    {r.topic} · {r.dateLabel} · {r.readMinutes} min read
                  </span>
                  <span className="block text-2xl sm:text-3xl font-extrabold tracking-[-0.03em] leading-[1.15] text-ink group-hover:text-heritage-deep transition-colors text-balance">
                    {r.title}
                  </span>
                  <span className="block mt-3 text-sm text-slate-body leading-[1.65] max-w-[640px]">
                    {r.description}
                  </span>
                  <span className="block mt-3 text-xs text-slate-meta">
                    By {r.author.name}, {r.author.role}
                  </span>
                </span>
                <span className="hidden sm:inline-flex items-center gap-2 self-center text-sm font-bold text-heritage-deep">
                  Read
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </SiteShell>
  );
}
