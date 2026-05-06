"use client";

/**
 * MobileMenu — hamburger + slide-out drawer for the public site nav.
 *
 * Below md (768px) the desktop `<ul>` of nav links is hidden in SiteNav, so
 * mobile users had no way to reach /pricing, /for-dsos, /for-candidates, etc.
 * This component renders:
 *   - A 3-line hamburger button visible below md (sits in the right-side
 *     cluster of SiteNav, next to the "Post a Job" CTA which stays visible).
 *   - A slide-in drawer from the right edge with all nav links, the For
 *     Dental Pros sub-list expanded inline (hover dropdowns don't work on
 *     touch), the audience-aware Sign In/Dashboard link, and a duplicate
 *     "Post a Job" CTA in the drawer footer for thumb-friendly tap distance.
 *
 * Closes on link tap, Escape key, or backdrop tap. Locks body scroll while
 * open. Pure React state — no Radix or framer-motion dep, just transitions.
 *
 * SiteNav is an async server component; this client island receives the
 * audience-aware hrefs as props rather than re-deriving them.
 *
 * IMPORTANT — drawer is portaled to document.body. SiteNav has
 * `backdrop-blur-md` (frosted-glass effect), which creates a new
 * containing block for `position: fixed` descendants. Without the portal,
 * the drawer's `fixed inset-0` would be constrained to the 80px-tall nav
 * rectangle instead of covering the full viewport — resulting in a
 * collapsed drawer with the footer CTAs floating mid-page over the hero.
 * createPortal escapes the nav's containing block so the dialog
 * positions against the viewport as intended.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

const ROLE_LINKS = [
  { href: "/for-candidates", label: "Overview" },
  { href: "/for-dentists", label: "For Dentists" },
  { href: "/for-specialists", label: "For Specialists" },
  { href: "/for-hygienists", label: "For Hygienists" },
  { href: "/for-dental-assistants", label: "For Dental Assistants" },
  { href: "/for-front-desk", label: "For Front Desk + Treatment Coordinators" },
  { href: "/for-office-managers", label: "For Office + Regional Managers" },
];

const PRIMARY_LINKS = [
  { href: "/for-dsos", label: "For DSOs" },
  { href: "/jobs", label: "Browse Jobs" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function MobileMenu({
  signInHref,
  signInLabel,
  postAJobHref,
}: {
  signInHref: string;
  signInLabel: string;
  postAJobHref: string;
}) {
  const [open, setOpen] = useState(false);

  // Close on Escape; lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const close = () => setOpen(false);

  const drawer =
    open ? (
      <div
        id="mobile-menu-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
        className="fixed inset-0 z-[60] md:hidden"
      >
          {/* Backdrop — tap to close. <button> rather than <div> so it's
              keyboard-reachable and screen-readers know it's interactive. */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={close}
            className="absolute inset-0 bg-ink/35 backdrop-blur-sm"
          />

          {/* Drawer panel */}
          <div className="absolute top-0 right-0 bottom-0 w-[88vw] max-w-[400px] bg-ivory border-l border-[var(--rule-strong)] shadow-2xl flex flex-col">
            <div className="flex items-center justify-between h-[80px] px-6 border-b border-[var(--rule)]">
              <span className="text-[10px] font-bold tracking-[1.8px] uppercase text-heritage-deep">
                Menu
              </span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={close}
                className="w-9 h-9 flex items-center justify-center text-ink hover:text-heritage-deep transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-6 py-6">
              <ul className="list-none flex flex-col gap-1">
                {PRIMARY_LINKS.map((link) => (
                  <MobileMenuLink
                    key={link.href}
                    href={link.href}
                    onClose={close}
                  >
                    {link.label}
                  </MobileMenuLink>
                ))}
              </ul>

              <div className="mt-7 pt-5 border-t border-[var(--rule)]">
                <div className="text-[10px] font-bold tracking-[1.8px] uppercase text-heritage-deep mb-3">
                  For Dental Pros
                </div>
                <ul className="list-none flex flex-col gap-1">
                  {ROLE_LINKS.map((link) => (
                    <MobileMenuLink
                      key={link.href}
                      href={link.href}
                      onClose={close}
                    >
                      {link.label}
                    </MobileMenuLink>
                  ))}
                </ul>
              </div>
            </nav>

            <div className="px-6 pb-7 pt-4 border-t border-[var(--rule)] flex flex-col gap-3">
              <Link
                href={signInHref}
                onClick={close}
                className="inline-flex items-center justify-center px-5 py-3 border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[2px] uppercase hover:border-ink transition-colors"
              >
                {signInLabel}
              </Link>
              <Link
                href={postAJobHref}
                onClick={close}
                className="inline-flex items-center justify-center px-5 py-3 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
              >
                Post a Job
              </Link>
            </div>
          </div>
        </div>
      ) : null;

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-menu-drawer"
        onClick={() => setOpen(true)}
        className="md:hidden flex flex-col gap-[5px] w-9 h-9 items-center justify-center -mr-1"
      >
        <span aria-hidden className="block w-5 h-[2px] bg-ink" />
        <span aria-hidden className="block w-5 h-[2px] bg-ink" />
        <span aria-hidden className="block w-5 h-[2px] bg-ink" />
      </button>
      {/* Portal to document.body so the drawer escapes SiteNav's
          `backdrop-blur-md` containing block. SSR-safe via typeof window
          guard; harmless during initial client render too because `open`
          starts false (drawer is null), so no hydration mismatch ever
          occurs. The portal only mounts post-click, well after hydration. */}
      {drawer && typeof window !== "undefined"
        ? createPortal(drawer, document.body)
        : null}
    </>
  );
}

function MobileMenuLink({
  href,
  onClose,
  children,
}: {
  href: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onClose}
        className="block py-3 text-[15px] font-semibold text-ink hover:text-heritage-deep transition-colors"
      >
        {children}
      </Link>
    </li>
  );
}
