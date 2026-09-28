/**
 * ReportSignup: the middle rung for visitors who aren't ready to buy.
 *
 * EDC's "Multiples Watch" pattern: publish what competitors gate, then
 * offer the next edition by email. Placed on guides and hiring-data pages,
 * where readers are learning, not shopping. Saves kind="newsletter" rows
 * (deduped per address) in marketing_leads; no notification per signup.
 *
 * The cadence promise is deliberately a ceiling ("never more than
 * monthly"), not a schedule we'd have to keep.
 */

import { Eyebrow } from "@/components/brand/eyebrow";
import { LeadHandoff } from "./lead-handoff";

export function ReportSignup({ page }: { page: string }) {
  return (
    <section className="px-6 sm:px-14 py-16">
      <div
        data-reveal
        className="relative max-w-[1040px] mx-auto overflow-hidden border border-heritage/30 grid grid-cols-1 md:grid-cols-[1.1fr_1fr] gap-8 md:gap-12 p-8 sm:p-10"
        style={{ background: "var(--heritage-tint)" }}
      >
        <span aria-hidden className="absolute top-0 left-0 h-full w-[3px] bg-heritage" />
        <div>
          <Eyebrow className="text-heritage-deep mb-3">The Dental Hiring Report</Eyebrow>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.03em] leading-[1.1] text-ink mb-3 text-balance">
            Pay bands, time to fill, and what&apos;s moving in dental hiring.
          </h2>
          <p className="text-sm text-slate-body leading-[1.65] text-pretty">
            Written for the people who staff dental groups. Sent when we
            publish new data, never more than monthly.
          </p>
        </div>
        <div className="self-center">
          <LeadHandoff
            kind="newsletter"
            audience="dso"
            label="Where should we send it?"
            placeholder="Work email"
            cta="Subscribe"
            fine="One click unsubscribes. We never share your address."
            success="You're on the list. The next edition lands in your inbox."
            context={{ page }}
          />
        </div>
      </div>
    </section>
  );
}
