"use client";

/**
 * LensToggle — the segmented "Dental Groups | Job Candidates" control in the
 * marketing nav. DSO Hire is a dual-lens site (employers vs. job candidates);
 * this control makes switching lenses an obvious, deliberate action rather
 * than two loose nav items.
 *
 * Each segment links to its lens overview and opens a menu on hover OR
 * keyboard focus (:focus-within). Menu motion and row states live in
 * globals.css under `.lens-*` (unslop pass 2026-11-20):
 *   - Panel settles in (fade + 4px rise, --ease-settle, 180ms), leaves fast.
 *   - Rows stagger in 18ms apart, capped, so the menu feels assembled.
 *   - Row hover: heritage hairline grows on the left, arrow nudges in.
 *   - Reduced motion: opacity only.
 *
 * Copy rules: one sanctioned Eyebrow per column header; row meta is sentence
 * case (Eyebrow doctrine: max one all-caps label per card). Tier prices come
 * from PRICING_TIERS so the menu can't drift from the pricing page.
 *
 * Role lists mirror src/lib/roles/role-config.ts and the mobile drawer
 * (mobile-menu.tsx). Update all when adding a role page.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

import { Eyebrow } from "@/components/brand/eyebrow";
import { DEMO_URL } from "@/lib/marketing/demo";
import { PRICING_TIERS, type PricingTier } from "@/lib/stripe/prices";

type MenuLink = { href: string; label: string; meta: string };

const CLINICAL_ROLES: MenuLink[] = [
  { href: "/for-dentists", label: "Dentists", meta: "DDS / DMD" },
  { href: "/for-specialists", label: "Specialists", meta: "Endo, perio, pedo, OS, ortho" },
  { href: "/for-hygienists", label: "Hygienists", meta: "RDH" },
  { href: "/for-dental-assistants", label: "Dental assistants", meta: "DA, EFDA" },
  { href: "/for-dental-therapists", label: "Dental therapists", meta: "Expanded-scope clinical" },
  { href: "/for-dental-lab-technicians", label: "Lab technicians", meta: "CDT, dental laboratory" },
  { href: "/for-sterilization-technicians", label: "Sterilization technicians", meta: "Instrument processing" },
];

const OFFICE_ROLES: MenuLink[] = [
  { href: "/for-front-desk", label: "Front desk & TCs", meta: "Treatment coordinators, patient-facing" },
  { href: "/for-office-managers", label: "Office managers", meta: "Operations leadership" },
  { href: "/for-practice-administrators", label: "Practice administrators", meta: "Non-clinical leadership" },
  // Corporate / non-clinical seekers: part of why the lens is "Job Candidates".
  { href: "/for-corporate", label: "Corporate & support center", meta: "DSO support center roles" },
];

const TIER_ROWS: { tier: PricingTier; meta: string }[] = [
  { tier: "solo", meta: "Privately-owned, 2 to 5 locations" },
  { tier: "growth", meta: "Growing groups and DSOs" },
  { tier: "scale", meta: "Multi-region groups" },
  { tier: "enterprise", meta: "35+ practices, account manager" },
];

function formatPrice(n: number) {
  return `$${n.toLocaleString("en-US")}`;
}

/**
 * Which lens does this path belong to?
 *   - "dso"       → /for-dental-groups, /employer/*, /pricing
 *   - "candidate" → /for-candidates, /for-* role pages, /jobs, /candidate/*,
 *                   /companies
 *   - "neutral"   → everything else (/, /about, /contact, /legal)
 */
function resolveLens(pathname: string): "dso" | "candidate" | "neutral" {
  if (
    pathname === "/for-dental-groups" ||
    pathname.startsWith("/for-dental-groups/") ||
    pathname === "/employer" ||
    pathname.startsWith("/employer/") ||
    pathname === "/pricing" ||
    pathname.startsWith("/pricing/")
  ) {
    return "dso";
  }

  if (
    pathname === "/for-candidates" ||
    pathname.startsWith("/for-candidates/") ||
    // /for-* role pages; /for-dental-groups already returned above.
    pathname.startsWith("/for-") ||
    pathname === "/jobs" ||
    pathname.startsWith("/jobs/") ||
    pathname === "/candidate" ||
    pathname.startsWith("/candidate/") ||
    pathname === "/companies" ||
    pathname.startsWith("/companies/")
  ) {
    return "candidate";
  }

  return "neutral";
}

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

function Chevron() {
  return (
    <svg
      aria-hidden
      className="lens-chevron h-2.5 w-2.5"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 4.5l3 3 3-3" />
    </svg>
  );
}

function Arrow({ className = "lens-arrow" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={`${className} h-3 w-3 shrink-0`}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 6h7M6.5 3l3 3-3 3" />
    </svg>
  );
}

function Row({ href, label, meta, aside, i }: MenuLink & { aside?: ReactNode; i: number }) {
  return (
    <li className="lens-item" style={stagger(i)}>
      <Link href={href} role="menuitem" className="lens-row">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-snug tracking-[-0.1px] text-ink">
            {label}
          </span>
          <span className="block text-2xs leading-snug text-slate-meta mt-0.5">{meta}</span>
        </span>
        {aside ?? <Arrow />}
      </Link>
    </li>
  );
}

function Lead({ href, label, meta }: MenuLink) {
  return (
    <Link href={href} role="menuitem" className="lens-lead lens-item" style={stagger(0)}>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold tracking-[-0.2px] text-ink">{label}</span>
        <span className="block text-xs text-slate-body mt-0.5">{meta}</span>
      </span>
      <Arrow />
    </Link>
  );
}

function Foot({ children }: { children: ReactNode }) {
  return (
    <div className="lens-item lens-foot" style={stagger(6)}>
      {children}
    </div>
  );
}

function DsoMenu() {
  return (
    <>
      <Lead
        href="/for-dental-groups"
        label="Why DSO Hire"
        meta="One flat fee for every location. No placement fees."
      />
      <div className="px-2 pb-2">
        <Eyebrow as="p" className="px-3 pt-3 pb-1.5">
          Plans by group size
        </Eyebrow>
        <ul className="list-none">
          {TIER_ROWS.map(({ tier, meta }, idx) => {
            const t = PRICING_TIERS[tier];
            return (
              <Row
                key={tier}
                i={idx + 1}
                href={`/pricing/${tier}`}
                label={t.name}
                meta={meta}
                aside={
                  <span className="text-xs font-semibold text-ink tabular shrink-0">
                    {formatPrice(t.monthlyPrice)}
                    <span className="font-normal text-slate-meta">/mo</span>
                  </span>
                }
              />
            );
          })}
        </ul>
      </div>
      <Foot>
        <span>Click through a real hiring workspace.</span>
        <a href={DEMO_URL} role="menuitem" className="lens-foot-link">
          Live demo
          <svg
            aria-hidden
            className="h-3 w-3"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 8l4-4M4.5 4H8v3.5" />
          </svg>
        </a>
      </Foot>
    </>
  );
}

function CandidateMenu() {
  return (
    <>
      <Lead
        href="/for-candidates"
        label="For dental professionals"
        meta="Free forever. Apply straight to the group, never through an agency."
      />
      <div className="grid grid-cols-2 gap-x-2 px-2 pb-2">
        <div>
          <Eyebrow as="p" className="px-3 pt-3 pb-1.5">
            Clinical
          </Eyebrow>
          <ul className="list-none">
            {CLINICAL_ROLES.map((r, idx) => (
              <Row key={r.href} i={idx + 1} {...r} />
            ))}
          </ul>
        </div>
        <div>
          <Eyebrow as="p" className="px-3 pt-3 pb-1.5">
            Office &amp; leadership
          </Eyebrow>
          <ul className="list-none">
            {OFFICE_ROLES.map((r, idx) => (
              <Row key={r.href} i={idx + 1} {...r} />
            ))}
          </ul>
          {/* The menu's one product moment: fills the short column with the
              PracticeFit promise. The ring draws in as the menu opens. */}
          <Link href="/jobs" role="menuitem" className="lens-fit lens-item" style={stagger(6)}>
            <svg aria-hidden viewBox="0 0 40 40" className="h-10 w-10 shrink-0 -rotate-90">
              <circle cx="20" cy="20" r="16" fill="none" stroke="var(--rule-strong)" strokeWidth="3" />
              <circle className="lens-fit-ring" cx="20" cy="20" r="16" fill="none" stroke="var(--heritage)" strokeWidth="3" pathLength="100" />
            </svg>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">See how you fit</span>
              <span className="block text-2xs leading-snug text-slate-body mt-0.5">
                PracticeFit™ scores every opening to how you like to work.
              </span>
              <span className="lens-foot-link mt-2 text-xs">
                Browse jobs
                <Arrow className="" />
              </span>
            </span>
          </Link>
        </div>
      </div>
    </>
  );
}

export function LensToggle() {
  const pathname = usePathname() ?? "/";
  const lens = resolveLens(pathname);

  const baseSegment =
    "inline-flex items-center gap-1.5 px-3.5 h-9 text-xs font-semibold whitespace-nowrap transition-colors duration-150";
  const activeSegment = "text-ink font-bold shadow-[inset_0_-2px_0_0_var(--heritage)]";
  const idleSegment = "text-slate-body hover:text-ink hover:bg-cream/60";

  return (
    <li>
      <div className="flex items-stretch border border-[var(--rule-strong)]">
        <div className="lens-group relative flex">
          <Link
            href="/for-dental-groups"
            aria-current={lens === "dso" ? "true" : undefined}
            aria-haspopup="menu"
            className={`${baseSegment} ${lens === "dso" ? activeSegment : idleSegment}`}
          >
            Dental Groups
            <Chevron />
          </Link>
          {/* Hover bridge so moving the cursor to the menu doesn't drop it. */}
          <span aria-hidden className="absolute left-0 right-0 top-full h-3" />
          <div role="menu" className="lens-menu left-0 w-[420px]">
            <DsoMenu />
          </div>
        </div>

        <span aria-hidden className="w-px self-stretch bg-[var(--rule-strong)]" />

        <div className="lens-group relative flex">
          <Link
            href="/for-candidates"
            aria-current={lens === "candidate" ? "true" : undefined}
            aria-haspopup="menu"
            className={`${baseSegment} ${lens === "candidate" ? activeSegment : idleSegment}`}
          >
            Job Candidates
            <Chevron />
          </Link>
          <span aria-hidden className="absolute left-0 right-0 top-full h-3" />
          {/* Anchored under the whole toggle (shifted left) so the wide
              two-column panel stays centered on the control. */}
          <div role="menu" className="lens-menu -left-[200px] w-[600px]">
            <CandidateMenu />
          </div>
        </div>
      </div>
    </li>
  );
}
