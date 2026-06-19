"use client";

/**
 * CandidateMobileNav — hamburger drop-down for the candidate rail on
 * mobile (Phase 4.6.c). Cam flagged the previous mobile candidate nav as
 * missing/broken — this rebuild ensures the same items as the desktop
 * rail are reachable from a hamburger drawer.
 *
 * Mirrors the employer mobile nav pattern: hamburger → backdrop +
 * full-height drawer → close on link click, backdrop tap, or Esc.
 *
 * Drawer is portaled to document.body — the parent <header> on
 * /candidate/* uses `backdrop-blur-md` which creates a containing
 * block for fixed-positioned descendants (per
 * feedback_backdrop_filter_containing_block.md), so without the portal
 * the drawer's `fixed inset-0` would be clipped to the 64px header
 * bounds. Caught by Cam 2026-05-08 PM via mobile screenshot — the
 * drawer was rendering as just the top strip.
 */

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LifeBuoy, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { isNavItemActive } from "./nav-active";

export interface MobileNavItem {
  id: string;
  label: string;
  href: string;
  /** Pre-rendered icon node (passed from the server shell so the real
   *  PracticeFit / DSOFit marks survive the client boundary). */
  icon?: ReactNode;
  /** Optional full-row node that REPLACES icon + label (e.g. the dual-tone
   *  PracticeFit / DSOFit wordmark for the flagship fit row). */
  node?: ReactNode;
}

interface CandidateMobileNavProps {
  items: MobileNavItem[];
  help: MobileNavItem;
  user: {
    fullName: string;
    avatarUrl: string | null;
    subtitle: string;
  };
}

export function CandidateMobileNav({
  items,
  help,
  user,
}: CandidateMobileNavProps) {
  // Active item is derived from the URL (the shell is now a persistent layout
  // that can't know which child renders) — shared rule with the desktop rail.
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  // Defer the portal target until after mount — Server Components
  // render this file too and document doesn't exist there.
  // The setState-in-effect lint rule fires here, but this is the
  // canonical React.createPortal mount-detection pattern: empty deps,
  // one-time fire, no cascade risk. The rule can't distinguish
  // single-shot mount detection from genuine setState loops.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const drawer = open ? (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Close menu"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-ink/50 backdrop-blur-[1px]"
      />

      <aside className="absolute left-0 top-0 bottom-0 w-[300px] max-w-[85vw] bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar
              name={user.fullName}
              imageUrl={user.avatarUrl}
              size="sm"
              className="ring-1 ring-white/10"
            />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-sidebar-foreground truncate leading-tight">
                {user.fullName}
              </div>
              <div className="text-[10px] text-sidebar-foreground/50 truncate">
                {user.subtitle}
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="inline-flex h-9 w-9 items-center justify-center rounded text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="list-none space-y-0.5">
            {items.map((item) => (
              <MobileRow
                key={item.id}
                item={item}
                pathname={pathname}
                onSelect={() => setOpen(false)}
              />
            ))}
          </ul>
        </nav>

        <div className="border-t border-sidebar-border p-3 space-y-1">
          <Link
            href={help.href}
            onClick={() => setOpen(false)}
            className={
              "flex items-center gap-3 px-3 py-2.5 text-[13px] font-semibold rounded " +
              (isNavItemActive(pathname, { id: help.id, href: help.href })
                ? "bg-white/10 text-sidebar-foreground"
                : "text-sidebar-foreground/65 hover:bg-white/5 hover:text-sidebar-foreground")
            }
          >
            <LifeBuoy className="size-4 flex-shrink-0" />
            {help.label}
          </Link>
          <form action="/candidate/sign-out" method="post">
            <button
              type="submit"
              className="flex w-full items-center gap-3 px-3 py-2.5 text-[13px] font-semibold text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-white/5 rounded transition-colors"
            >
              <LogOut className="size-4 flex-shrink-0" />
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-9 items-center justify-center rounded text-ink hover:bg-cream/70"
      >
        <Menu className="size-5" />
      </button>

      {/* Portal the drawer to document.body so no ancestor's
          backdrop-filter / transform can become its containing
          block — fixes the "drawer renders as a 64px strip" bug
          caught by Cam 2026-05-08 PM. */}
      {mounted && drawer && createPortal(drawer, document.body)}
    </>
  );
}

function MobileRow({
  item,
  pathname,
  onSelect,
}: {
  item: MobileNavItem;
  pathname: string;
  onSelect: () => void;
}) {
  const isActive = isNavItemActive(pathname, item);
  return (
    <li>
      <Link
        href={item.href}
        onClick={onSelect}
        className={
          "flex items-center gap-3 px-3 py-2.5 text-[13px] font-semibold tracking-[0.5px] rounded transition-colors " +
          (isActive
            ? "bg-white/10 text-sidebar-foreground"
            : "text-sidebar-foreground/65 hover:bg-white/5 hover:text-sidebar-foreground")
        }
      >
        {item.node ? (
          item.node
        ) : (
          <>
            {item.icon && (
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
                {item.icon}
              </span>
            )}
            {item.label}
          </>
        )}
      </Link>
    </li>
  );
}
