"use client";

/**
 * <ReviewNav> — BOH Remodel Lane 3 commit 3 (Model 03 Review Mode v1).
 *
 * Candidate cursor over the job's pipeline: prev/next links + position
 * ("3 of 12"), with j/k keyboard navigation (guarded — never fires
 * while typing). Sibling ids are resolved SERVER-side by the page from
 * the same RLS-scoped applications query every pipeline surface uses;
 * this component only navigates. Verdict actions stay in the pipeline
 * rail behind their existing capability guards.
 */

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

export function ReviewNav({
  prevHref,
  nextHref,
  position,
  total,
}: {
  prevHref: string | null;
  nextHref: string | null;
  position: number;
  total: number;
}) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === "j" && nextHref) {
        e.preventDefault();
        router.push(nextHref);
      } else if (e.key === "k" && prevHref) {
        e.preventDefault();
        router.push(prevHref);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, prevHref, nextHref]);

  if (total < 2) return null;

  const linkCls =
    "inline-flex items-center gap-1 text-[10px] font-bold tracking-[2px] uppercase transition-colors";

  return (
    <span className="ml-auto inline-flex items-center gap-3.5 border border-[var(--rule-strong)] bg-card px-3 py-1.5">
      <span className="hidden sm:inline text-[9px] font-bold tracking-[1.5px] uppercase text-slate-meta">
        Review · j/k
      </span>
      {prevHref ? (
        <Link
          href={prevHref}
          className={`${linkCls} text-heritage-deep hover:text-ink`}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </Link>
      ) : (
        <span className={`${linkCls} text-slate-meta/50`}>
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </span>
      )}
      <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-ink whitespace-nowrap">
        {position} of {total}
      </span>
      {nextHref ? (
        <Link
          href={nextHref}
          className={`${linkCls} text-heritage-deep hover:text-ink`}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      ) : (
        <span className={`${linkCls} text-slate-meta/50`}>
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      )}
    </span>
  );
}
