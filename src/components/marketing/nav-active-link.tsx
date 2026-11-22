"use client";

/**
 * NavActiveLink — top-bar link that knows when it's the current page.
 * Sets aria-current="page" so the heritage underline (`.nav-link::after`
 * in globals.css) stays drawn, and screen readers announce the location.
 * Child paths count as current (/pricing/solo lights up Pricing).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavActiveLink({
  href,
  className,
  children,
  ...rest
}: {
  href: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const pathname = usePathname() ?? "/";
  const current = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} className={className} aria-current={current ? "page" : undefined} {...rest}>
      {children}
    </Link>
  );
}
