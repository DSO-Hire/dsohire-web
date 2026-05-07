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
import Link from "next/link";
import { Menu, X, LifeBuoy, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

export interface MobileNavItem {
  id: string;
  label: string;
  href: string;
}

interface EmployerMobileNavProps {
  active?: string;
  groups: Array<{ group: string; items: MobileNavItem[] }>;
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
  active,
  groups,
  help,
  user,
}: EmployerMobileNavProps) {
  const [open, setOpen] = useState(false);

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

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/50 backdrop-blur-[1px]"
          />

          {/* Drawer */}
          <aside className="absolute left-0 top-0 bottom-0 w-[300px] max-w-[85vw] bg-ink text-ivory flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar
                  name={user.dsoName}
                  imageUrl={user.dsoLogo}
                  size="sm"
                  className="ring-1 ring-white/10"
                />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-ivory truncate leading-tight">
                    {user.dsoName}
                  </div>
                  <div className="text-[9px] tracking-[1.5px] uppercase text-ivory/50 truncate">
                    {user.role.replace("_", " ")} · {user.dsoStatus}
                  </div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded text-ivory/70 hover:bg-white/10 hover:text-ivory"
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
                      active={active}
                      onSelect={() => setOpen(false)}
                    />
                  ))}
                </ul>
              ))}
            </nav>

            <div className="border-t border-white/10 p-3 space-y-1">
              <Link
                href={help.href}
                onClick={() => setOpen(false)}
                className={
                  "flex items-center gap-3 px-3 py-2.5 text-[13px] font-semibold rounded " +
                  (active === help.id
                    ? "bg-white/10 text-ivory"
                    : "text-ivory/65 hover:bg-white/5 hover:text-ivory")
                }
              >
                <LifeBuoy className="size-4 flex-shrink-0" />
                {help.label}
              </Link>
              <form action="/employer/sign-out" method="post">
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-[13px] font-semibold text-ivory/55 hover:text-ivory hover:bg-white/5 rounded transition-colors"
                >
                  <LogOut className="size-4 flex-shrink-0" />
                  Sign out
                </button>
              </form>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function MobileRow({
  item,
  active,
  onSelect,
}: {
  item: MobileNavItem;
  active?: string;
  onSelect: () => void;
}) {
  const isActive = active === item.id;
  return (
    <li>
      <Link
        href={item.href}
        onClick={onSelect}
        className={
          "flex items-center gap-3 px-3 py-2.5 text-[13px] font-semibold tracking-[0.5px] rounded transition-colors " +
          (isActive
            ? "bg-white/10 text-ivory"
            : "text-ivory/65 hover:bg-white/5 hover:text-ivory")
        }
      >
        {item.label}
      </Link>
    </li>
  );
}
