/**
 * CtaBand: the shared closing ask for buyer-facing pages.
 *
 * EDC pattern: every page ends the same way, so the last thing a visitor
 * sees is always a clear next step at three commitment levels:
 *   1. look (live demo, no sign-up)
 *   2. leave one field (LeadHandoff, we reach out)
 *   3. buy (start with a plan)
 * Its gradient ends on the footer's exact color so the two dark surfaces
 * read as one.
 */

import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Eyebrow } from "@/components/brand/eyebrow";
import { Button } from "@/components/ui/button";
import { LeadHandoff } from "./lead-handoff";
import { DEMO_URL } from "@/lib/marketing/demo";

export function CtaBand({
  eyebrow = "Ready when you are",
  title,
  sub,
  sourceContext,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  sub: React.ReactNode;
  /** Tag for the lead row, e.g. { page: "for-dental-groups" }. */
  sourceContext?: Record<string, string>;
}) {
  return (
    <section className="cta-band relative overflow-hidden text-hero-foreground px-6 sm:px-14 pt-24 sm:pt-28 pb-20 grain">
      <div className="relative max-w-[1040px] mx-auto">
        <Eyebrow className="text-heritage-bright mb-4 text-center">{eyebrow}</Eyebrow>
        <h2
          data-reveal
          className="text-center text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-[-0.04em] leading-[1.04] mb-5 text-balance"
        >
          {title}
        </h2>
        <p className="text-center text-base sm:text-lg text-hero-foreground/65 leading-[1.65] max-w-[620px] mx-auto mb-10 text-pretty">
          {sub}
        </p>

        <div className="flex flex-wrap justify-center gap-3.5 mb-12">
          <Button asChild variant="inverse" size="xl" className="btn-lift">
            <a href={DEMO_URL} target="_blank" rel="noopener">
              See it live, no sign-up
              <ArrowUpRight className="size-4" />
            </a>
          </Button>
          <Button
            asChild
            variant="outline"
            size="xl"
            className="btn-lift bg-transparent text-hero-foreground border-ivory/30 hover:border-ivory hover:bg-ivory/5"
          >
            <Link href="/employer/sign-up">
              Start posting jobs
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        <div className="max-w-[560px] mx-auto">
          <LeadHandoff
            kind="demo_request"
            audience="dso"
            tone="dark"
            label="Rather we walk you through it? Leave one way to reach you."
            cta="Reach out"
            fine="A person on our team replies within one business day. No sequence, no autodialer."
            success="Got it. Someone from our team will reach out within one business day."
            context={sourceContext}
          />
        </div>

        <div className="mt-14 text-center text-2xs font-bold uppercase tracking-[1.8px] text-hero-foreground/40">
          No placement fees · No per-listing fees · Cancel anytime
        </div>
      </div>
    </section>
  );
}
