"use client";

/**
 * LensToggle — the segmented "Dental Groups | Job Candidates" control in the
 * marketing nav, each segment owning a menu. Header pass 2026-11-22, built
 * from the ux-animation / unslop skills:
 *
 * Behavior (disclosure-nav pattern, not role="menu"):
 *   - Mouse: opens after a 70ms hover intent so sweeping across the bar
 *     doesn't flash menus; closes 140ms after the pointer leaves, so a
 *     diagonal path to the panel is forgiven.
 *   - Moving from one open menu to the other switches instantly with no
 *     animation (the tooltip "instant" rule: once you're browsing, don't
 *     make people wait twice).
 *   - Touch / pen (iPad at lg+): first tap opens the menu instead of
 *     navigating; the overview row inside still reaches the lens page.
 *   - Keyboard: the trigger stays a real link (Enter navigates). ArrowDown
 *     opens and focuses the first row; arrows / Home / End move; Escape
 *     closes and returns focus; tabbing out closes.
 *   - Closes on any link click, outside pointerdown, and route change.
 *
 * Motion (globals.css `.lens-*`): 160ms in on --ease-settle, 120ms out
 * ease-in, fade + 4px rise + 0.98 scale from the trigger. Rows arrive with
 * the panel in one piece (no stagger inside a moving container). The one
 * secondary motion is the PracticeFit ring drawing in after the panel lands.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { Eyebrow } from "@/components/brand/eyebrow";
import { DEMO_URL } from "@/lib/marketing/demo";

import { CLINICAL_ROLES, OFFICE_ROLES, TIER_ROWS, type NavItem } from "./nav-data";

type LensKey = "dso" | "pros";

/**
 * Which lens does this path belong to?
 *   - "dso"       → /for-dental-groups, /employer/*, /pricing
 *   - "candidate" → /for-candidates, /for-* role pages, /jobs, /candidate/*,
 *                   /companies
 *   - "neutral"   → everything else (/, /about, /contact, /legal)
 */
export function resolveLens(pathname: string): "dso" | "candidate" | "neutral" {
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

/* ── Icons ─────────────────────────────────────────────────────────── */

function Chevron() {
  return (
    <svg aria-hidden className="lens-chevron h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4.5l3 3 3-3" />
    </svg>
  );
}

function Arrow({ className = "lens-arrow" }: { className?: string }) {
  return (
    <svg aria-hidden className={`${className} h-3 w-3 shrink-0`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 6h7M6.5 3l3 3-3 3" />
    </svg>
  );
}

function External() {
  return (
    <svg aria-hidden className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8l4-4M4.5 4H8v3.5" />
    </svg>
  );
}

/* ── Menu pieces ───────────────────────────────────────────────────── */

function Row({ href, label, meta, aside, current }: NavItem & { aside?: ReactNode; current: boolean }) {
  return (
    <li>
      <Link href={href} className="lens-row" aria-current={current ? "page" : undefined}>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-snug tracking-[-0.1px] text-ink">{label}</span>
          <span className="block text-2xs leading-snug text-slate-meta mt-0.5">{meta}</span>
        </span>
        {aside ?? <Arrow />}
      </Link>
    </li>
  );
}

function Lead({ href, label, meta, current }: NavItem & { current: boolean }) {
  return (
    <Link href={href} className="lens-lead" aria-current={current ? "page" : undefined}>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold tracking-[-0.2px] text-ink">{label}</span>
        <span className="block text-xs text-slate-body mt-0.5">{meta}</span>
      </span>
      <Arrow />
    </Link>
  );
}

function DsoMenu({ pathname }: { pathname: string }) {
  return (
    <>
      <Lead
        href="/for-dental-groups"
        label="Why DSO Hire"
        meta="One flat fee for every location. No placement fees."
        current={pathname === "/for-dental-groups"}
      />
      <div className="px-2 pb-2">
        <Eyebrow as="p" className="px-3 pt-3 pb-1.5">
          Plans by group size
        </Eyebrow>
        <ul className="list-none">
          {TIER_ROWS.map((t) => (
            <Row
              key={t.tier}
              href={t.href}
              label={t.label}
              meta={t.meta}
              current={pathname === t.href}
              aside={
                <span className="text-xs font-semibold text-ink tabular shrink-0">
                  {t.price}
                  <span className="font-normal text-slate-meta">/mo</span>
                </span>
              }
            />
          ))}
        </ul>
      </div>
      <div className="lens-foot">
        <span>Click through a real hiring workspace.</span>
        <a href={DEMO_URL} target="_blank" rel="noopener" className="lens-foot-link">
          Live demo
          <External />
        </a>
      </div>
    </>
  );
}

function CandidateMenu({ pathname }: { pathname: string }) {
  return (
    <>
      <Lead
        href="/for-candidates"
        label="For dental professionals"
        meta="Free forever. Apply straight to the group, never through an agency."
        current={pathname === "/for-candidates"}
      />
      <div className="grid grid-cols-2 gap-x-2 px-2 pb-2">
        <div>
          <Eyebrow as="p" className="px-3 pt-3 pb-1.5">
            Clinical
          </Eyebrow>
          <ul className="list-none">
            {CLINICAL_ROLES.map((r) => (
              <Row key={r.href} {...r} current={pathname === r.href} />
            ))}
          </ul>
        </div>
        <div className="flex flex-col">
          <Eyebrow as="p" className="px-3 pt-3 pb-1.5">
            Office &amp; leadership
          </Eyebrow>
          <ul className="list-none">
            {OFFICE_ROLES.map((r) => (
              <Row key={r.href} {...r} current={pathname === r.href} />
            ))}
          </ul>
          {/* The menu's one product moment, filling the short column. The
              ring draws in just after the panel lands. */}
          <Link href="/jobs" className="lens-fit mt-auto">
            <svg aria-hidden viewBox="0 0 40 40" className="h-10 w-10 shrink-0 -rotate-90">
              <circle cx="20" cy="20" r="16" fill="none" stroke="var(--rule-strong)" strokeWidth="3" />
              <circle className="lens-fit-ring" cx="20" cy="20" r="16" fill="none" stroke="var(--heritage)" strokeWidth="3" strokeLinecap="butt" pathLength="100" />
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

/* ── Controller ────────────────────────────────────────────────────── */

const OPEN_DELAY = 70;
const CLOSE_DELAY = 140;

const keyOf = (el: HTMLElement) => el.dataset.lens as LensKey;

/** Rows inside a panel, in visual order. */
function panelRows(panel: Element | null) {
  return Array.from(panel?.querySelectorAll<HTMLElement>("a[href]") ?? []);
}

export function LensToggle() {
  const pathname = usePathname() ?? "/";
  const lens = resolveLens(pathname);
  const uid = useId();

  const [open, setOpen] = useState<LensKey | null>(null);
  const [instant, setInstant] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const rootRef = useRef<HTMLDivElement>(null);
  // Hover-intent timers and the last pointer type. Only touched from event
  // handlers and effects, never during render.
  const timers = useRef({ open: 0, close: 0, pointer: "mouse" });
  // Set by ArrowDown on a trigger; the effect below moves focus into the
  // panel once React has rendered it open.
  const focusFirst = useRef(false);

  // Route change closes any open menu (state-during-render, no effect).
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (open) setOpen(null);
  }

  function clearTimers() {
    window.clearTimeout(timers.current.open);
    window.clearTimeout(timers.current.close);
  }
  function show(k: LensKey, inst = false) {
    clearTimers();
    setInstant(inst);
    setOpen(k);
  }
  function hide() {
    clearTimers();
    setInstant(false);
    setOpen(null);
  }

  useEffect(() => {
    const t = timers.current;
    return () => {
      window.clearTimeout(t.open);
      window.clearTimeout(t.close);
    };
  }, []);

  useEffect(() => {
    if (!open || !focusFirst.current) return;
    focusFirst.current = false;
    panelRows(document.getElementById(`${uid}-${open}`))[0]?.focus();
  }, [open, uid]);

  // Escape closes and returns focus; outside pointerdown closes.
  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    const close = () => {
      setInstant(false);
      setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const trigger = root?.querySelector<HTMLElement>(`[data-lens-trigger="${open}"]`);
      close();
      trigger?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (root && !root.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const panelId = (k: LensKey) => `${uid}-${k}`;

  /* Group (trigger + panel): hover intent and focus-out. */
  function onGroupEnter(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    const k = keyOf(e.currentTarget);
    window.clearTimeout(timers.current.close);
    if (open === k) return;
    if (open) return show(k, true); // already browsing: switch instantly
    window.clearTimeout(timers.current.open);
    timers.current.open = window.setTimeout(() => show(k), OPEN_DELAY);
  }
  function onGroupLeave(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    window.clearTimeout(timers.current.open);
    timers.current.close = window.setTimeout(hide, CLOSE_DELAY);
  }
  function onGroupBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (open === keyOf(e.currentTarget) && !e.currentTarget.contains(e.relatedTarget as Node | null)) hide();
  }

  /* Trigger: touch opens on first tap, ArrowDown enters the panel. */
  function onTriggerPointerDown(e: ReactPointerEvent<HTMLAnchorElement>) {
    timers.current.pointer = e.pointerType;
  }
  function onTriggerClick(e: React.MouseEvent<HTMLAnchorElement>) {
    const k = e.currentTarget.dataset.lensTrigger as LensKey;
    if (timers.current.pointer !== "mouse" && open !== k) {
      e.preventDefault();
      show(k);
    }
    timers.current.pointer = "mouse";
  }
  function onTriggerKeyDown(e: ReactKeyboardEvent<HTMLAnchorElement>) {
    if (e.key !== "ArrowDown") return;
    e.preventDefault();
    const k = e.currentTarget.dataset.lensTrigger as LensKey;
    if (open === k) {
      panelRows(document.getElementById(panelId(k)))[0]?.focus();
      return;
    }
    focusFirst.current = true;
    show(k, true);
  }

  /* Panel: close on link click, arrow / Home / End between rows. */
  function onPanelClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("a")) hide();
  }
  function onPanelKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const rows = panelRows(e.currentTarget);
    if (!rows.length) return;
    const i = rows.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => rows[(n + rows.length) % rows.length].focus();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      go(i + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (i <= 0) {
        rootRef.current
          ?.querySelector<HTMLElement>(`[data-lens-trigger="${e.currentTarget.dataset.lens}"]`)
          ?.focus();
      } else go(i - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0);
    } else if (e.key === "End") {
      e.preventDefault();
      go(rows.length - 1);
    }
  }

  const baseSegment =
    "lens-trigger inline-flex items-center gap-1.5 px-3.5 h-9 text-xs font-semibold whitespace-nowrap";
  const activeSegment = "text-ink font-bold shadow-[inset_0_-2px_0_0_var(--heritage)]";
  const idleSegment = "text-slate-body hover:text-ink";

  const segments: {
    k: LensKey;
    href: string;
    label: string;
    active: boolean;
    panelClass: string;
    origin: string;
    menu: ReactNode;
  }[] = [
    {
      k: "dso",
      href: "/for-dental-groups",
      label: "Dental Groups",
      active: lens === "dso",
      panelClass: "left-0 w-[420px]",
      origin: "64px 0",
      menu: <DsoMenu pathname={pathname} />,
    },
    {
      k: "pros",
      href: "/for-candidates",
      label: "Job Candidates",
      active: lens === "candidate",
      // Shifted left so the wide two-column panel centers on the toggle.
      panelClass: "-left-[200px] w-[600px]",
      origin: "266px 0",
      menu: <CandidateMenu pathname={pathname} />,
    },
  ];

  return (
    <li>
      <div ref={rootRef} className="flex items-stretch border border-[var(--rule-strong)]">
        {segments.map((seg, idx) => (
          <div key={seg.k} className="contents">
            {idx > 0 && <span aria-hidden className="w-px self-stretch bg-[var(--rule-strong)]" />}
            <div
              className="relative flex"
              data-lens={seg.k}
              onPointerEnter={onGroupEnter}
              onPointerLeave={onGroupLeave}
              onBlur={onGroupBlur}
            >
              <Link
                href={seg.href}
                data-lens-trigger={seg.k}
                aria-current={seg.active ? "true" : undefined}
                aria-expanded={open === seg.k}
                aria-controls={panelId(seg.k)}
                onPointerDown={onTriggerPointerDown}
                onClick={onTriggerClick}
                onKeyDown={onTriggerKeyDown}
                className={`${baseSegment} ${seg.active ? activeSegment : idleSegment}`}
              >
                {seg.label}
                <Chevron />
              </Link>
              {/* Hover bridge across the 12px gap to the panel. */}
              <span aria-hidden className="absolute left-0 right-0 top-full h-3" />
              <div
                id={panelId(seg.k)}
                data-lens={seg.k}
                data-open={open === seg.k ? "true" : "false"}
                data-instant={instant ? "true" : undefined}
                onClick={onPanelClick}
                onKeyDown={onPanelKeyDown}
                className={`lens-menu ${seg.panelClass}`}
                style={{ transformOrigin: seg.origin }}
              >
                {seg.menu}
              </div>
            </div>
          </div>
        ))}
      </div>
    </li>
  );
}
