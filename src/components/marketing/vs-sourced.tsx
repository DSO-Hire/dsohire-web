/**
 * VsSourced: building blocks for the NAMED, sourced comparison pages
 * (/vs/dentalpost, /vs/cloud-dentistry, /vs/dental-hiring-software).
 *
 * The older /vs pages compare generic categories and use VsTable (string
 * cells, check/minus icons). Named-vendor pages need inline citations and
 * a neutral table, so they render cells through the research DataTable and
 * cite with <Cite />, numbered against a per-page SOURCES array shown by
 * <VsSources /> (the research SourcesList, with the access date).
 *
 * Rules for these pages: every competitor fact comes from the competitor's
 * own published page (docs/research/dso-hiring-software-landscape-2026.md),
 * DSO Hire prices come from prices.ts (monthly list), no em dashes in copy,
 * never disparage. Server components only.
 */

import { Eyebrow } from "@/components/brand/eyebrow";
import { SourcesList } from "@/components/research/sources-list";
import { PROSE } from "@/components/research/report-shell";
import { SALES_EMAIL, SALES_MAILTO } from "@/lib/contact";
import type { ResearchSource } from "@/lib/research/reports";
import { PRICING_TIERS } from "@/lib/stripe/prices";

/** The one date every competitor fact on these pages was checked. */
export const VS_ACCESSED = "October 19, 2026";

/** Source-kind labels, so readers can weigh who is speaking. */
export const KIND_VENDOR = "Vendor, describing itself";
export const KIND_DSOHIRE = "DSO Hire, describing itself";
export const KIND_OBSERVED =
  "DSO careers page; ATS vendor identified by DSO Hire from the page HTML";

/* ── DSO Hire facts shared by every page (prices.ts, monthly list) ── */

const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;
const T = PRICING_TIERS;

/** "$399 to $2,999/mo": monthly list prices, billed monthly. */
export const DSOHIRE_PRICE_RANGE = `${fmt(T.solo.monthlyPrice)} to ${fmt(T.enterprise.monthlyPrice)}/mo`;
/** Cheapest monthly list price, e.g. "$399/mo". */
export const DSOHIRE_FROM = `${fmt(T.solo.monthlyPrice)}/mo`;
export const DSOHIRE_SOLO_NAME = T.solo.name;

const cap = (n: number | null) => (n === null ? "unlimited" : String(n));
/** "5 / 20 / 100 / unlimited" active openings by tier. */
export const DSOHIRE_OPENINGS_LADDER = [T.solo, T.growth, T.scale, T.enterprise]
  .map((t) => cap(t.maxActiveJobs))
  .join(" / ");

/** The DSO Hire source entries, in the order each page lists them first. */
export const DSOHIRE_SOURCES = {
  pricing: { label: "DSO Hire, Pricing", url: "https://dsohire.com/pricing", kind: KIND_DSOHIRE },
  forGroups: {
    label: "DSO Hire, For dental groups",
    url: "https://dsohire.com/for-dental-groups",
    kind: KIND_DSOHIRE,
  },
  llms: { label: "DSO Hire, llms.txt (company summary)", url: "https://dsohire.com/llms.txt", kind: KIND_DSOHIRE },
  jobBoards: {
    label: "DSO Hire, DSO Hire vs per-listing job boards",
    url: "https://dsohire.com/vs/job-boards",
    kind: KIND_DSOHIRE,
  },
} satisfies Record<string, ResearchSource>;

/* ── Layout pieces ─────────────────────────────────────────────── */

export function VsSection({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="px-6 sm:px-14 pb-16 max-w-[1240px] mx-auto"
    >
      <div className="max-w-[860px]">
        {eyebrow && <Eyebrow className="text-heritage-deep mb-3">{eyebrow}</Eyebrow>}
        <h2
          id={`${id}-heading`}
          className="text-2xl sm:text-3xl font-extrabold tracking-[-0.03em] leading-[1.15] text-ink mb-5"
        >
          {title}
        </h2>
        <div className={PROSE}>{children}</div>
      </div>
    </section>
  );
}

/** Wraps a DataTable (or any block) at the page's content width. */
export function VsBlock({ children }: { children: React.ReactNode }) {
  return <div className="px-6 sm:px-14 pb-12 max-w-[1240px] mx-auto">{children}</div>;
}

/** Sources list plus the "as published on" note and correction address. */
export function VsSources({ sources }: { sources: readonly ResearchSource[] }) {
  return (
    <section
      id="sources"
      aria-labelledby="sources-heading"
      className="px-6 sm:px-14 pb-20 max-w-[1240px] mx-auto scroll-mt-28"
    >
      <div className="max-w-[860px] pt-10 border-t-2 border-ink">
        <Eyebrow className="text-heritage-deep mb-2">Sources</Eyebrow>
        <h2
          id="sources-heading"
          className="text-2xl sm:text-3xl font-extrabold tracking-[-0.03em] leading-[1.15] text-ink mb-4"
        >
          Where every fact comes from
        </h2>
        <p className="text-sm text-slate-body leading-[1.7] mb-6">
          Pricing and features as published by each company on {VS_ACCESSED}. Tell us if
          something changed:{" "}
          <a
            href={SALES_MAILTO}
            className="text-heritage-deep underline underline-offset-2 hover:text-ink"
          >
            {SALES_EMAIL}
          </a>
          . DSO Hire prices shown are monthly list prices, billed monthly; annual billing is
          about 10% less.
        </p>
        <SourcesList sources={sources} accessed={VS_ACCESSED} />
      </div>
    </section>
  );
}
