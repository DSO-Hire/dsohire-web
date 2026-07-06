import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Eyebrow — the ONE sanctioned all-caps treatment in the app.
 *
 * House doctrine (2026-07-06 design-language sweep): all-caps is reserved
 * for section eyebrows and table/column headers, max one per card. Chips,
 * buttons, tabs, stat labels and nav items are sentence case — if you're
 * reaching for `uppercase` anywhere else, use plain text instead.
 *
 * Canonical treatment: 11px ExtraBold caps, 1.5px tracking, muted
 * slate-meta ink. Pass `as` for semantics (`h2`/`h3`/`th`/`dt`/…);
 * defaults to a div. Color can be overridden via className for dark
 * surfaces (e.g. `text-white/60` on navy).
 */
export function Eyebrow({
  as,
  className,
  children,
  ...props
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
} & Record<string, unknown>) {
  const Comp: ElementType = as ?? "div";
  return (
    <Comp
      className={cn(
        "text-[11px] font-bold uppercase tracking-[1.5px] text-slate-meta",
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}
