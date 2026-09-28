"use client";

/**
 * MobileApplyBar: sticky apply CTA for phones (hidden at md and up).
 *
 * Stays out of the way while either in-page apply block is on screen and
 * slides in between them (past the top block, above the bottom one), so
 * the primary action is one tap away while reading a long posting.
 * Observes the blocks by id with an IntersectionObserver.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MobileApplyBar({
  href,
  label,
  jobTitle,
  watchIds,
}: {
  href: string;
  label: string;
  jobTitle: string;
  /** Element ids of the in-page apply blocks. The first is the top block. */
  watchIds: string[];
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const els = watchIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    // Without the anchors (or IntersectionObserver) the bar stays hidden;
    // the in-page apply blocks still carry the action.
    if (els.length === 0 || typeof IntersectionObserver === "undefined") return;
    const onScreen = new Map<Element, boolean>();
    const top = els[0]!;
    const last = els[els.length - 1]!;
    const update = () => {
      const anyOnScreen = els.some((el) => onScreen.get(el));
      const pastTop = top.getBoundingClientRect().bottom < 0;
      // Once the reader is below the last apply block (sidebar details,
      // footer) the bar retires so it never sits on top of the footer.
      const beforeLast =
        last === top || last.getBoundingClientRect().top > 0;
      setVisible(!anyOnScreen && pastTop && beforeLast);
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) onScreen.set(e.target, e.isIntersecting);
      update();
    });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [watchIds]);

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-[var(--rule-strong)] bg-ivory/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] transition-transform duration-200 motion-reduce:transition-none",
        visible ? "translate-y-0" : "translate-y-full pointer-events-none"
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">
          {jobTitle}
        </p>
        <Button asChild variant="primary" size="md">
          <Link href={href} tabIndex={visible ? undefined : -1}>
            {label}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}
