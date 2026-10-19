/**
 * /vs/job-boards — #115 FOH-6: category comparison (generic, per the
 * locked de-naming rule — no competitor is named).
 */

import { SiteShell } from "@/components/marketing/site-shell";
import {
  VsCta,
  VsFaq,
  VsHero,
  VsHonestNote,
  VsTable,
  type VsRow,
} from "@/components/marketing/vs-layout";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd } from "@/components/seo/schema";
import { PRICING_TIERS } from "@/lib/stripe/prices";
import type { FaqItem } from "@/components/marketing/faq-accordion";
import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/vs/job-boards" },
  title: "DSO Hire vs Per-Listing Job Boards: Dental Hiring Compared",
  description:
    "Per-listing dental job boards charge per posting and hand you an inbox. DSO Hire is a flat-fee dental hiring platform: every location, a real applicant pipeline, fit-ranked candidates, and team tooling. An honest comparison.",
};

const ROWS: VsRow[] = [
  {
    dimension: "How you pay",
    them: "Per listing, per month: a 30-location group posting one role at three offices pays three times. Costs scale with your footprint.",
    us: "One flat monthly fee covers every location you operate and every role you post. Your 30th location costs the same as your 3rd: nothing extra.",
  },
  {
    dimension: "What you get",
    them: "An inbox of applicants. Pipeline tracking, team review, and offers happen somewhere else, usually a spreadsheet and email.",
    us: "A full ATS: realtime kanban pipeline, team comments and scorecards, automations and drip sequences, offer letters with approval chains.",
  },
  {
    dimension: "Multi-location posting",
    them: "Typically one practice at a time, so recruiters re-enter the same role over and over for each office.",
    us: "Write the role once, assign it to as many practices as you need. Location-specific listings render automatically.",
  },
  {
    dimension: "Your team",
    them: "Usually one login. Office managers and regional directors share credentials or stay out of the loop.",
    us: "Real seats with real roles: owners, admins, recruiters, and location-scoped hiring managers, each with tunable permissions.",
  },
  {
    dimension: "Finding the right applicant",
    them: "Most-recent-first, keyword search if you're lucky. You read every resume to find the fit.",
    us: "Every applicant arrives scored by PracticeFit: schedule overlap, PMS fluency, clinical mix, commute. Strongest fits surface first.",
  },
  {
    dimension: "Corporate / HQ roles",
    them: "Built around clinical postings; a CFO or ops-director search sits awkwardly next to hygienist listings.",
    us: "DSOFit scores corporate candidates on seniority, multi-site scale, and dental-domain depth, and confidential searches keep executive replacements quiet.",
  },
  {
    dimension: "The candidate's experience",
    them: "Re-upload the resume, re-type the work history, apply into a void.",
    us: "One profile, free resume builder, fit scores on every opening, real status tracking. Candidates see where they stand.",
  },
];

const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;
const solo = PRICING_TIERS.solo;

// Every answer restates a fact already on this page (table rows, honest
// note) or in prices.ts. Rendered visibly AND as FAQPage JSON-LD.
const FAQ_ITEMS: FaqItem[] = [
  {
    q: "How is DSO Hire priced compared with a per-listing job board?",
    a: `Job boards charge per listing, per month, so costs scale with your footprint. DSO Hire is one flat monthly fee that covers every location you operate, starting at ${fmt(solo.monthlyPrice)}/mo on the ${solo.name} plan (up to ${solo.maxActiveJobs} active openings). Your 30th location costs the same as your 3rd.`,
  },
  {
    q: "Can I post one role to several locations at once?",
    a: "Yes. Write the role once and assign it to as many practices as you need. Location-specific listings render automatically, so nobody re-enters the same job for each office.",
  },
  {
    q: "What do I get beyond an inbox of applicants?",
    a: "A full applicant tracking system: a realtime kanban pipeline, team comments and scorecards, automations and drip sequences, and offer letters with approval chains. Every applicant also arrives with a PracticeFit score, so the strongest fits surface first.",
  },
  {
    q: "Can my whole hiring team use it?",
    a: "Yes. Owners, admins, recruiters, and location-scoped hiring managers each get a real seat with tunable permissions, instead of sharing one login.",
  },
  {
    q: "When is a job board still the better choice?",
    a: "If you run a single practice and hire once a year, a one-off listing is cheaper than any subscription, ours included. DSO Hire earns its fee when you operate multiple locations or hire continuously.",
  },
];

export default function VsJobBoardsPage() {
  return (
    <SiteShell ctaIntent="dso">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "DSO Hire vs. job boards", path: "/vs/job-boards" },
        ])}
      />
      <VsHero
        eyebrow="Compared · Per-Listing Job Boards"
        title={
          <>
            A job board hands you an inbox.{" "}
            <em className="not-italic text-heritage-light">
              You needed a pipeline.
            </em>
          </>
        }
        intro="Per-listing dental job boards were built for single-practice owners posting one role at a time. If you operate multiple locations, the model itself works against you: you pay per posting, re-enter every role, and still run your actual hiring in spreadsheets. Here's the honest comparison."
      />
      <VsTable themLabel="Per-listing job boards" rows={ROWS} />
      <VsHonestNote
        title="Where a job board is still the right call"
        body="If you run a single practice and hire once a year, a one-off listing is cheaper than any subscription, ours included. DSO Hire earns its fee when you operate multiple locations or hire continuously; that's exactly who it's built for. (Solo tier starts at 2 locations on purpose.)"
      />
      <VsFaq items={FAQ_ITEMS} />
      <VsCta
        headline="Stop renting listings. Own a pipeline."
        sub="One flat fee, every location, applicants ranked by fit. And we'll migrate your current postings for free."
      />
    </SiteShell>
  );
}
