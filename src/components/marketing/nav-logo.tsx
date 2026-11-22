"use client";

/**
 * NavLogo — the header lockup's hover life (2026-11-22).
 *
 * As the pointer travels left to right across the lockup, the heritage
 * crossbar (the implied H) reaches toward the arch's spine, closing the gap
 * between the two sides of the D: groups and candidates, connected direct.
 * Pointer position is written to `--reach` (0..1) on the link; the bar's
 * transform eases after it in CSS. On entry, a heritage trace runs once
 * around the arch (`.lockup-trace`, CSS only). Leaving lets the bar settle
 * home. Touch and reduced motion get none of this (hover: hover gate).
 */
import Link from "next/link";
import type { PointerEvent, ReactNode } from "react";

export function NavLogo({ children }: { children: ReactNode }) {
  const onMove = (e: PointerEvent<HTMLAnchorElement>) => {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const reach = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    e.currentTarget.style.setProperty("--reach", reach.toFixed(3));
  };
  const onLeave = (e: PointerEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.setProperty("--reach", "0");
  };

  return (
    <Link
      href="/"
      aria-label="DSO Hire, home"
      className="nav-logo flex items-center shrink-0"
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      {children}
    </Link>
  );
}
