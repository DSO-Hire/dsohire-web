"use client";

/**
 * LensToggle — the segmented "For DSOs | For Dental Pros" control in the
 * marketing nav. DSO Hire is a dual-lens site (employers vs. dental
 * professionals); this control makes switching lenses an obvious, deliberate
 * action rather than two loose nav items.
 *
 * Structure:
 *   - One bordered container holding two segments joined by a vertical divider.
 *   - Left segment "For DSOs" → /for-dsos (plain link).
 *   - Right segment "For Dental Pros" → /for-candidates, AND acts as the
 *     hover trigger for the role-specific dropdown (pure CSS group-hover,
 *     same mechanism as the old ForDentalProsDropdown).
 *
 * Active-lens state: reads the current path via usePathname() and highlights
 * whichever lens the visitor is currently in. Neutral paths (/, /about,
 * /contact, /legal) highlight neither.
 *
 * This is a client island (needs usePathname) — it's rendered by the async
 * server component SiteNav, never the other way around.
 *
 * The ROLE_LINKS list mirrors src/app/for-[role]/role-config.ts and the
 * mobile drawer's copy. Update all when adding a role page.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

const ROLE_LINKS = [
  { href: "/for-candidates", label: "For Dental Professionals", eyebrow: "Overview" },
  { href: "/for-dentists", label: "For Dentists", eyebrow: "DDS / DMD" },
  { href: "/for-specialists", label: "For Specialists", eyebrow: "Endo · Perio · Pedo · OS · Ortho" },
  { href: "/for-hygienists", label: "For Hygienists", eyebrow: "RDH" },
  { href: "/for-dental-assistants", label: "For Dental Assistants", eyebrow: "DA · EFDA" },
  { href: "/for-front-desk", label: "For Front Desk + Treatment Coordinators", eyebrow: "Patient-facing ops" },
  { href: "/for-office-managers", label: "For Office Managers", eyebrow: "OM · Operations Leadership" },
];

/**
 * Which lens does this path belong to?
 *   - "dso"       → /for-dsos, /employer/*, /pricing
 *   - "candidate" → /for-candidates, /for-* role pages, /jobs, /candidate/*,
 *                   /companies
 *   - "neutral"   → everything else (/, /about, /contact, /legal)
 */
function resolveLens(pathname: string): "dso" | "candidate" | "neutral" {
  if (
    pathname === "/for-dsos" ||
    pathname.startsWith("/for-dsos/") ||
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
    // /for-* role pages (dentists, hygienists, etc.) — but NOT /for-dsos,
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
        {/* Left lens — For DSOs. Plain link, NO dropdown. */}
        <Link
          href="/for-dsos"
          aria-current={lens === "dso" ? "true" : undefined}
          className={`${baseSegment} ${lens === "dso" ? activeSegment : idleSegment}`}
        >
          For DSOs
        </Link>

        {/* Divider joining the two segments */}
        <span aria-hidden className="w-px self-stretch bg-[var(--rule-strong)]" />

        {/* Right lens — For Dental Pros. This segment owns its own hover
            group (group/pros) so the role dropdown fires ONLY from here,
            not from hovering the "For DSOs" segment. */}
        <div className="relative group/pros flex">
          <Link
            href="/for-candidates"
            aria-current={lens === "candidate" ? "true" : undefined}
            aria-haspopup="menu"
            className={`${baseSegment} ${lens === "candidate" ? activeSegment : idleSegment}`}
          >
            For Dental Pros
            <svg
              aria-hidden
              className="h-2.5 w-2.5 transition-transform group-hover/pros:rotate-180"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 4.5l3 3 3-3" />
            </svg>
          </Link>

          {/* Bridge element — keeps hover state alive when moving the cursor
              from the trigger to the menu so the dropdown doesn't flicker. */}
          <span aria-hidden className="absolute left-0 right-0 top-full h-3" />

          {/* Role-specific dropdown — revealed only on hover of the "For
              Dental Pros" segment. Right-aligned to that segment. Pure CSS. */}
          <div
            role="menu"
            className="invisible opacity-0 absolute top-full right-0 mt-3 min-w-[360px] bg-white border border-[var(--rule-strong)] shadow-[0_20px_40px_-20px_rgba(7,15,28,0.20),0_8px_20px_-12px_rgba(7,15,28,0.10)] group-hover/pros:visible group-hover/pros:opacity-100 transition-all duration-150 z-50"
          >
            <ul className="list-none p-2">
              {ROLE_LINKS.map((link, i) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    role="menuitem"
                    className="block px-4 py-2.5 hover:bg-cream/60 transition-colors"
                    style={{
                      // Subtle separator between the overview and the role list
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
          </div>
        </div>
      </div>
    </li>
  );
}
