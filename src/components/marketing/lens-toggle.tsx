"use client";

/**
 * LensToggle — the segmented "For DSOs | Job Candidates" control in the
 * marketing nav. DSO Hire is a dual-lens site (employers vs. job candidates);
 * this control makes switching lenses an obvious, deliberate action rather
 * than two loose nav items.
 *
 * Structure:
 *   - One bordered container holding two segments joined by a vertical divider.
 *   - Left segment "For DSOs" → /for-dental-groups, AND a hover trigger for the
 *     size→tier guidance dropdown (which tier fits a group of your size).
 *   - Right segment "Job Candidates" → /for-candidates, AND a hover trigger
 *     for the role-specific dropdown. (Renamed from "For Dental Pros" on
 *     2026-05-22 — "dental pros" excluded corporate/non-clinical seekers.)
 *
 * Both dropdowns are pure CSS group-hover. Active-lens state reads the current
 * path via usePathname() and highlights whichever lens the visitor is in.
 * Neutral paths (/, /about, /contact, /legal) highlight neither.
 *
 * This is a client island (needs usePathname) — rendered by the async server
 * component SiteNav, never the other way around.
 *
 * ROLE_LINKS mirrors src/app/for-[role]/role-config.ts and the mobile drawer's
 * copy (plus the corporate-roles entry). Update all when adding a role page.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

const ROLE_LINKS = [
  { href: "/for-candidates", label: "For Dental Professionals", eyebrow: "Overview" },
  { href: "/for-dentists", label: "For Dentists", eyebrow: "DDS / DMD" },
  { href: "/for-specialists", label: "For Specialists", eyebrow: "Endo · Perio · Pedo · OS · Ortho" },
  { href: "/for-hygienists", label: "For Hygienists", eyebrow: "RDH" },
  { href: "/for-dental-assistants", label: "For Dental Assistants", eyebrow: "DA · EFDA" },
  { href: "/for-dental-therapists", label: "For Dental Therapists", eyebrow: "Expanded-scope clinical" },
  { href: "/for-front-desk", label: "For Front Desk + Treatment Coordinators", eyebrow: "Patient-facing ops" },
  { href: "/for-office-managers", label: "For Office Managers", eyebrow: "OM · Operations Leadership" },
  { href: "/for-practice-administrators", label: "For Practice Administrators", eyebrow: "Non-clinical leadership" },
  { href: "/for-dental-lab-technicians", label: "For Dental Lab Technicians", eyebrow: "CDT · Dental laboratory" },
  { href: "/for-sterilization-technicians", label: "For Sterilization Technicians", eyebrow: "Instrument processing" },
  // Corporate / non-clinical seekers — the rename to "Job Candidates"
  // (2026-05-22) is partly to include these roles; give them a home here.
  { href: "/for-corporate", label: "Corporate & Administrative Roles", eyebrow: "Non-clinical · DSO support center" },
];

/**
 * Left-lens "For DSOs" menu — maps DSO size to the tier that fits. Open-ended
 * at the top (no practice-count ceiling, per the brand copy rule). Size rows
 * link to /pricing; the overview links to /for-dental-groups.
 */
const DSO_SIZE_LINKS = [
  { href: "/for-dental-groups", label: "Why DSO Hire", eyebrow: "Overview" },
  { href: "/pricing/solo", label: "Solo plan", eyebrow: "Solo practice · 2–5 locations" },
  { href: "/pricing/growth", label: "Growth plan", eyebrow: "Midsize group" },
  { href: "/pricing/scale", label: "Scale plan", eyebrow: "Larger · multi-region" },
  { href: "/pricing/enterprise", label: "Enterprise plan", eyebrow: "Largest · most complex" },
];

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
    // /for-* role pages (dentists, hygienists, etc.) — but NOT /for-dental-groups,
    // which is handled above and would have returned already.
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

const MENU_SHADOW =
  "shadow-[0_20px_40px_-20px_rgba(7,15,28,0.20),0_8px_20px_-12px_rgba(7,15,28,0.10)]";

function Chevron({ group }: { group: string }) {
  return (
    <svg
      aria-hidden
      className={`h-2.5 w-2.5 transition-transform ${group}`}
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

function MenuList({
  links,
}: {
  links: ReadonlyArray<{ href: string; label: string; eyebrow: string }>;
}) {
  return (
    <ul className="list-none p-2">
      {links.map((link, i) => (
        <li key={`${link.href}-${link.label}`}>
          <Link
            href={link.href}
            role="menuitem"
            className="block px-4 py-2.5 hover:bg-cream/60 transition-colors"
            style={{
              // Subtle separator between the overview and the rest of the list.
              borderTop: i === 1 ? "1px solid var(--rule)" : undefined,
              marginTop: i === 1 ? "4px" : undefined,
              paddingTop: i === 1 ? "10px" : undefined,
            }}
          >
            <div className="text-[9px] font-bold tracking-[1.5px] uppercase text-heritage-deep mb-0.5">
              {link.eyebrow}
            </div>
            <div className="text-[13px] font-semibold tracking-[-0.1px] text-ink">
              {link.label}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function LensToggle() {
  const pathname = usePathname() ?? "/";
  const lens = resolveLens(pathname);

  const baseSegment =
    "inline-flex items-center gap-1.5 px-3.5 h-9 text-[12px] font-semibold tracking-[1.8px] uppercase transition-colors";
  const activeSegment = "bg-ink text-ivory";
  const idleSegment = "text-slate-body hover:text-ink hover:bg-cream/60";

  return (
    <li>
      <div className="flex items-stretch border border-[var(--rule-strong)]">
        {/* Left lens — For DSOs. Owns its own hover group (group/dsos) so the
            size→tier dropdown fires only from here. */}
        <div className="relative group/dsos flex">
          <Link
            href="/for-dental-groups"
            aria-current={lens === "dso" ? "true" : undefined}
            aria-haspopup="menu"
            className={`${baseSegment} ${lens === "dso" ? activeSegment : idleSegment}`}
          >
            Dental Groups
            <Chevron group="group-hover/dsos:rotate-180" />
          </Link>

          {/* Hover bridge so moving the cursor to the menu doesn't drop it. */}
          <span aria-hidden className="absolute left-0 right-0 top-full h-3" />

          <div
            role="menu"
            className={`invisible opacity-0 absolute top-full left-0 mt-3 min-w-[320px] max-w-[calc(100vw-2rem)] bg-white border border-[var(--rule-strong)] ${MENU_SHADOW} group-hover/dsos:visible group-hover/dsos:opacity-100 transition-all duration-150 z-50`}
          >
            <MenuList links={DSO_SIZE_LINKS} />
          </div>
        </div>

        {/* Divider joining the two segments */}
        <span aria-hidden className="w-px self-stretch bg-[var(--rule-strong)]" />

        {/* Right lens — Job Candidates. Owns its own hover group (group/pros)
            so the role dropdown fires only from here. */}
        <div className="relative group/pros flex">
          <Link
            href="/for-candidates"
            aria-current={lens === "candidate" ? "true" : undefined}
            aria-haspopup="menu"
            className={`${baseSegment} ${lens === "candidate" ? activeSegment : idleSegment}`}
          >
            Job Candidates
            <Chevron group="group-hover/pros:rotate-180" />
          </Link>

          <span aria-hidden className="absolute left-0 right-0 top-full h-3" />

          <div
            role="menu"
            className={`invisible opacity-0 absolute top-full right-0 mt-3 min-w-[360px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-7rem)] overflow-y-auto bg-white border border-[var(--rule-strong)] ${MENU_SHADOW} group-hover/pros:visible group-hover/pros:opacity-100 transition-all duration-150 z-50`}
          >
            <MenuList links={ROLE_LINKS} />
          </div>
        </div>
      </div>
    </li>
  );
}
