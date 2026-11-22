"use client";

/**
 * MobileMenu — hamburger + slide-in drawer for the public site nav (below lg).
 * Header pass 2026-11-22 (ux-animation / unslop skills):
 *
 *   - Drawer slides 280ms in / 200ms out on a transition (people close a
 *     drawer mid-open), backdrop fades on the same timings, contents ride in
 *     with the panel in one piece. Portaled once on the client and kept
 *     `inert` while closed, so it can animate both ways.
 *   - Lenses are expanders (grid-rows 0fr → 1fr), not native <details>, so
 *     they open smoothly; the lens you're browsing starts open.
 *   - Same grouped role list and real tier prices as the desktop menus
 *     (nav-data.ts). Sentence-case subheads instead of tracked caps.
 *   - Focus moves into the drawer on open, Tab is trapped, Escape and route
 *     changes close it, focus returns to the hamburger. Body scroll locks and
 *     <html data-menu-open> tells NavScrollState to keep the bar pinned.
 *   - One primary action in the footer; sign in and the live demo sit beside
 *     each other as secondary links.
 *
 * Portaled to document.body: SiteNav's backdrop-blur creates a containing
 * block that would otherwise trap `position: fixed` inside the 80px bar.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { DEMO_URL } from "@/lib/marketing/demo";
import { PracticeFitWordmark } from "@/components/practice-fit/brand/practice-fit-wordmark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { TextSizeToggle } from "@/components/theme/text-size-toggle";

import { CLINICAL_ROLES, OFFICE_ROLES, TIER_ROWS, type NavItem } from "./nav-data";
import { resolveLens } from "./lens-toggle";

// True on the client after hydration, false during SSR. The drawer is
// portaled (closed, inert) as soon as we're on the client, so opening it is
// just a data-open flip and the slide always runs.
const noopSubscribe = () => () => {};
const useIsClient = () => useSyncExternalStore(noopSubscribe, () => true, () => false);

const LINKS = [
  { href: "/jobs", label: "Browse jobs" },
  { href: "/companies", label: "Browse DSOs" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function MobileMenu({
  signInHref,
  signInLabel,
  primaryCtaHref,
  primaryCtaLabel,
}: {
  signInHref: string;
  signInLabel: string;
  primaryCtaHref: string;
  primaryCtaLabel: string;
}) {
  const pathname = usePathname() ?? "/";
  const lens = resolveLens(pathname);
  const isClient = useIsClient();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<"dso" | "pros" | null>(null);
  const [lastPath, setLastPath] = useState(pathname);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  const openMenu = () => {
    setSection(lens === "dso" ? "dso" : lens === "candidate" ? "pros" : null);
    setOpen(true);
  };
  const close = () => setOpen(false);

  // While open: Escape, Tab trap, scroll lock, pinned nav, focus in/out.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const burger = burgerRef.current;
    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [],
      ).filter((el) => !el.closest("[inert]"));

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setOpen(false);
      if (e.key !== "Tab") return;
      const els = focusables();
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const html = document.documentElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    html.dataset.menuOpen = "true";
    document.addEventListener("keydown", onKey);
    focusables()[0]?.focus({ preventScroll: true });

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      delete html.dataset.menuOpen;
      burger?.focus({ preventScroll: true });
    };
  }, [open]);

  const toggleSection = (k: "dso" | "pros") => setSection((s) => (s === k ? null : k));

  const drawer = (
    <div
      id="mobile-menu-drawer"
      className="m-drawer-root lg:hidden"
      data-open={open ? "true" : "false"}
      inert={!open}
    >
      <button type="button" aria-label="Close menu" tabIndex={-1} onClick={close} className="m-backdrop" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
        className="m-panel w-[88vw] max-w-[400px] bg-ivory border-l border-[var(--rule-strong)] flex flex-col"
      >
        <div className="flex items-center justify-between h-[80px] pl-6 pr-4 border-b border-[var(--rule)] shrink-0">
          <span className="text-sm font-semibold text-ink">Menu</span>
          <button
            type="button"
            aria-label="Close menu"
            onClick={close}
            className="size-11 flex items-center justify-center text-ink hover:text-heritage-deep transition-colors duration-150"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overscroll-contain">
          {/* The two lenses, as one paired control. */}
          <div className="border-b border-[var(--rule)]">
            <LensSection
              label="Dental groups"
              meta="Hiring for your practices"
              open={section === "dso"}
              onToggle={() => toggleSection("dso")}
              id="m-lens-dso"
            >
              <SubRow href="/for-dental-groups" label="Why DSO Hire" meta="One flat fee for every location" pathname={pathname} onClose={close} strong />
              <SubHead>Plans by group size</SubHead>
              {TIER_ROWS.map((t) => (
                <SubRow
                  key={t.tier}
                  href={t.href}
                  label={t.label}
                  meta={t.meta}
                  pathname={pathname}
                  onClose={close}
                  aside={
                    <span className="text-xs font-semibold text-ink tabular">
                      {t.price}
                      <span className="font-normal text-slate-meta">/mo</span>
                    </span>
                  }
                />
              ))}
            </LensSection>
            <LensSection
              label="Job candidates"
              meta="Find your next role"
              open={section === "pros"}
              onToggle={() => toggleSection("pros")}
              id="m-lens-pros"
            >
              <SubRow href="/for-candidates" label="For dental professionals" meta="Free forever, apply direct" pathname={pathname} onClose={close} strong />
              <SubHead>Clinical</SubHead>
              {CLINICAL_ROLES.map((r) => (
                <SubRow key={r.href} {...r} pathname={pathname} onClose={close} />
              ))}
              <SubHead>Office &amp; leadership</SubHead>
              {OFFICE_ROLES.map((r) => (
                <SubRow key={r.href} {...r} pathname={pathname} onClose={close} />
              ))}
            </LensSection>
          </div>

          <ul className="list-none py-2">
            <li>
              <Link
                href="/practicefit"
                onClick={close}
                aria-current={pathname === "/practicefit" ? "page" : undefined}
                aria-label="PracticeFit"
                className="m-row flex items-center min-h-12 px-6"
              >
                <PracticeFitWordmark surface="light" tm className="text-sm" />
              </Link>
            </li>
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={close}
                  aria-current={pathname === l.href ? "page" : undefined}
                  className="m-row flex items-center min-h-12 px-6 text-sm font-semibold text-ink"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="shrink-0 px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] border-t border-[var(--rule)] flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 text-xs text-slate-body">
            <span className="flex items-center gap-2.5">
              Theme <ThemeToggle className="text-ink" />
            </span>
            <span className="flex items-center gap-2.5">
              Text <TextSizeToggle className="text-ink" />
            </span>
          </div>
          <Link
            href={primaryCtaHref}
            onClick={close}
            className="inline-flex items-center justify-center h-12 px-5 bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 active:scale-[0.97] transition-[background-color,transform] duration-150"
          >
            {primaryCtaLabel}
          </Link>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href={signInHref}
              onClick={close}
              className="inline-flex items-center justify-center h-11 border border-[var(--rule-strong)] text-ink text-xs font-semibold hover:border-ink transition-colors duration-150"
            >
              {signInLabel}
            </Link>
            <a
              href={DEMO_URL}
              target="_blank"
              rel="noopener"
              onClick={close}
              className="inline-flex items-center justify-center gap-2 h-11 border border-[var(--rule-strong)] text-ink text-xs font-semibold hover:border-heritage transition-colors duration-150"
            >
              <span aria-hidden className="live-dot size-1.5 bg-heritage" />
              Live demo
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={burgerRef}
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-menu-drawer"
        onClick={() => (open ? close() : openMenu())}
        className="m-burger lg:hidden flex flex-col gap-[5px] size-11 items-center justify-center -mr-2"
      >
        <span aria-hidden className="block w-5 h-[2px] bg-ink" />
        <span aria-hidden className="block w-5 h-[2px] bg-ink" />
        <span aria-hidden className="block w-5 h-[2px] bg-ink" />
      </button>
      {isClient ? createPortal(drawer, document.body) : null}
    </>
  );
}

function LensSection({
  label,
  meta,
  open,
  onToggle,
  id,
  children,
}: {
  label: string;
  meta: string;
  open: boolean;
  onToggle: () => void;
  id: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-[var(--rule)] first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="m-row w-full flex items-center justify-between gap-3 px-6 py-4 text-left"
      >
        <span>
          <span className="block text-base font-bold tracking-[-0.2px] text-ink">{label}</span>
          <span className="block text-xs text-slate-body mt-0.5">{meta}</span>
        </span>
        <ChevronDown
          aria-hidden
          className={`size-4 shrink-0 text-slate-meta transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div id={id} className="m-expander" data-open={open ? "true" : "false"}>
        <div inert={!open}>
          <ul className="list-none pb-3 bg-cream/40 border-t border-[var(--rule)]">{children}</ul>
        </div>
      </div>
    </div>
  );
}

function SubHead({ children }: { children: ReactNode }) {
  return <li className="px-6 pt-4 pb-1 text-2xs font-semibold text-slate-meta">{children}</li>;
}

function SubRow({
  href,
  label,
  meta,
  aside,
  strong,
  pathname,
  onClose,
}: NavItem & { aside?: ReactNode; strong?: boolean; pathname: string; onClose: () => void }) {
  return (
    <li>
      <Link
        href={href}
        onClick={onClose}
        aria-current={pathname === href ? "page" : undefined}
        className="m-row flex items-center gap-3 min-h-12 px-6 py-2"
      >
        <span className="min-w-0 flex-1">
          <span className={`block text-sm text-ink ${strong ? "font-bold" : "font-semibold"}`}>{label}</span>
          <span className="block text-2xs text-slate-meta mt-0.5">{meta}</span>
        </span>
        {aside}
      </Link>
    </li>
  );
}
