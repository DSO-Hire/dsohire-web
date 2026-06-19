"use client";

/**
 * EmployerMobileNav — hamburger drop-down for the employer rail on mobile
 * (Phase 4.6).
 *
 * On viewports < lg, the desktop sidebar is hidden. This hamburger lives
 * on the mobile top bar, opens a full-height drawer that mirrors the
 * desktop rail's grouped structure, and closes automatically when a link
 * is clicked or the user taps the backdrop.
 *
 * The data shape (groups + items + help + user) comes from the parent
 * server component so we don't double-load DSO context client-side.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LifeBuoy, LogOut, Settings as SettingsIcon } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { isEmployerNavItemActive } from "./employer-nav-active";

export interface MobileNavItem {
  id: string;
  label: string;
  href: string;
}

interface EmployerMobileNavProps {
  groups: Array<{ group: string; items: MobileNavItem[] }>;
  settings: MobileNavItem;
  help: MobileNavItem;
  user: {
    fullName: string;
    role: string;
    dsoName: string;
    dsoLogo: string | null;
    dsoStatus: string;
  };
}

export function EmployerMobileNav({
  groups,
  settings,
  help,
  user,
}: EmployerMobileNavProps) {
  // Active item is derived from the URL (the shell is now a persistent layout
  // that can't know which child renders) — shared rule with the desktop rail.
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  // Defer portal target until mount — server render has no document.
  // setState-in-effect lint fires here; this is the canonical React
  // portal mount-detection pattern with empty deps and no cascade
  // risk. Mirrors the candidate-mobile-nav rationale.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Lock body scroll while drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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

      {/* Drawer portaled to document.body — the parent /employer/*
          mobile header uses `backdrop-blur-md` which creates a
          containing block for fixed-positioned descendants (per
          feedback_backdrop_filter_containing_block.md), clipping the
          drawer to the 64px header bounds. Fixed 2026-05-08 PM after
          Cam caught the same bug on the candidate side. */}
      {mounted && open && createPortal(
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/50 backdrop-blur-[1px]"
          />

          {/* Drawer */}
          <aside className="absolute left-0 top-0 bottom-0 w-[300px] max-w-[85vw] bg-sidebar text-sidebar-foreground flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-sidebar-border">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar
                  name={user.dsoName}
                  imageUrl={user.dsoLogo}
                  size="sm"
                  className="ring-1 ring-white/10"
                />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-sidebar-foreground truncate leading-tight">
                    {user.dsoName}
                  </div>
                  <div className="text-[9px] tracking-[1.5px] uppercase text-sidebar-foreground/50 truncate">
                    {user.role.replace("_", " ")} · {user.dsoStatus}
                  </div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded text-sidebar-foreground/70 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4">
              {groups.map((group, idx) => (
                <ul
                  key={group.group}
                  className={
                    "list-none space-y-0.5 " + (idx > 0 ? "mt-5" : "")
                  }
                >
                  {group.items.map((item) => (
                    <MobileRow
                      key={item.id}
                      item={item}
                      isActive={isEmployerNavItemActive(pathname, item)}
                      onSelect={() => setOpen(false)}
                    />
                  ))}
                </ul>
              ))}
            </nav>

            <div className="border-t border-sidebar-border p-3 space-y-1">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-[1.5px] text-sidebar-muted">
                  Theme
                </span>
                <ThemeToggle className="text-sidebar-foreground" />
              </div>
              <Link
                href={settings.href}
                onClick={() => setOpen(false)}
                className={
                  "flex items-center gap-3 px-3 py-2.5 text-[13px] font-semibold rounded " +
                  (isEmployerNavItemActive(pathname, settings)
                    ? "bg-sidebar-foreground/10 text-sidebar-foreground"
                    : "text-sidebar-foreground/65 hover:bg-sidebar-foreground/5 hover:text-sidebar-foreground")
                }
              >
                <SettingsIcon className="size-4 flex-shrink-0" />
                {settings.label}
              </Link>
              <Link
                href={help.href}
                onClick={() => setOpen(false)}
                className={
                  "flex items-center gap-3 px-3 py-2.5 text-[13px] font-semibold rounded " +
                  (isEmployerNavItemActive(pathname, help)
                    ? "bg-sidebar-foreground/10 text-sidebar-foreground"
                    : "text-sidebar-foreground/65 hover:bg-sidebar-foreground/5 hover:text-sidebar-foreground")
                }
              >
                <LifeBuoy className="size-4 flex-shrink-0" />
                {help.label}
              </Link>
              <form action="/employer/sign-out" method="post">
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-[13px] font-semibold text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-foreground/5 rounded transition-colors"
                >
                  <LogOut className="size-4 flex-shrink-0" />
                  Sign out
                </button>
              </form>
            </div>
          </aside>
        </div>,
        document.body
      )}
    </>
  );
}

function MobileRow({
  item,
  isActive,
  onSelect,
}: {
  item: MobileNavItem;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <Link
        href={item.href}
        onClick={onSelect}
        className={
          "flex items-center gap-3 px-3 py-2.5 text-[13px] font-semibold tracking-[0.5px] rounded transition-colors " +
          (isActive
            ? "bg-sidebar-foreground/10 text-sidebar-foreground"
            : "text-sidebar-foreground/65 hover:bg-sidebar-foreground/5 hover:text-sidebar-foreground")
        }
      >
        {item.label}
      </Link>
    </li>
  );
}
