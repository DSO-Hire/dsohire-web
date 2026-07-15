/**
 * /guides — lightweight index for the pillar hiring guides (launch SEO spec,
 * Phase 3). Lists the guides from src/content/guides/ via the shared loader;
 * copy comes from each draft's own frontmatter, so nothing here can drift
 * from the guide content.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import { loadAllGuides } from "@/lib/guides/loader";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dental Hiring Guides",
  description:
    "Practical guides to dental hiring from DSO Hire: multi-location hiring for DSOs, cutting time-to-hire at a dental practice, and screening candidates for culture fit.",
  alternates: { canonical: "https://dsohire.com/guides" },
  openGraph: {
    title: "Dental Hiring Guides · DSO Hire",
    description:
      "Practical guides to dental hiring: multi-location hiring, time-to-hire, and culture-fit screening.",
    url: "https://dsohire.com/guides",
    type: "website",
  },
};

export default function GuidesIndexPage() {
  const guides = loadAllGuides();
  return (
    <SiteShell ctaIntent="dso">
      <section className="pt-[140px] pb-20 px-6 sm:px-14">
        <div className="max-w-[860px] mx-auto">
          <div className="flex items-center gap-3.5 mb-8">
            <span className="block w-7 h-px bg-heritage" />
            <span className="text-2xs font-bold tracking-[3.5px] uppercase text-heritage-deep">
              Hiring Guides
            </span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-[-2px] leading-[1.05] text-ink mb-7 max-w-[720px]">
            How dental groups actually{" "}
            <em className="not-italic text-heritage-light">hire.</em>
          </h1>
          <p className="text-lg sm:text-xl text-slate-body leading-relaxed max-w-[620px] mb-14">
            Practical, no-fluff guides to the hardest parts of dental hiring —
            written for the people doing the hiring, not for the algorithm.
          </p>

          <ul className="grid grid-cols-1 gap-4">
            {guides.map((guide) => (
              <li key={guide.slug}>
                <Link
                  href={`/guides/${guide.slug}`}
                  className="block border border-[var(--rule)] bg-card p-6 sm:p-8 hover:bg-cream/40 transition-colors"
                >
                  <div className="text-2xs font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
                    Guide
                  </div>
                  <div className="text-xl sm:text-2xl font-extrabold tracking-[-0.5px] text-ink mb-2">
                    {guide.heading}
                  </div>
                  <p className="text-sm text-slate-body leading-relaxed mb-3 max-w-[640px]">
                    {guide.metaDescription}
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-2xs font-bold tracking-[1.5px] uppercase text-heritage-deep">
                    Read the guide <ArrowRight className="h-3 w-3" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </SiteShell>
  );
}
