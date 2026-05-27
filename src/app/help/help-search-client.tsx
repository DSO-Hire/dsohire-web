"use client";

/**
 * HelpSearchClient — client-side fuzzy search over the help registry.
 *
 * v1 implementation: substring match on title + tip. Lightweight (no
 * fuse.js dep), good enough for ~50 entries. Results render as a
 * dropdown panel beneath the input; clicking navigates to the entry's
 * permalink page.
 *
 * Server passes the entries pre-flattened so we don't ship the whole
 * registry shape to the client — just key/slug/title/tip/lens.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search as SearchIcon, X } from "lucide-react";

interface SearchEntry {
  key: string;
  slug: string;
  title: string;
  tip: string;
  lens: "employer" | "candidate" | "both";
}

interface Props {
  entries: SearchEntry[];
}

export function HelpSearchClient({ entries }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Click-outside dismiss.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return entries
      .filter((e) => {
        const hay = (e.title + " " + e.tip).toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [query, entries]);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-meta" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search help — try 'bulk locations' or 'two-factor'"
          className="w-full border border-[var(--rule-strong)] bg-white pl-10 pr-10 py-3.5 text-[14px] text-ink placeholder:text-slate-meta focus:border-heritage focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-meta hover:text-ink"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-full mt-1 border border-[var(--rule-strong)] bg-white shadow-lg z-20 max-h-[360px] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-[13px] text-slate-meta italic">
              Nothing matched &ldquo;{query}&rdquo;. Try a different word, or
              email support.
            </div>
          ) : (
            <ul>
              {results.map((r) => (
                <li key={r.key} className="border-b border-[var(--rule)] last:border-0">
                  <Link
                    href={`/help/${r.slug}`}
                    className="block px-4 py-3 hover:bg-cream/60 transition-colors"
                    onClick={() => setOpen(false)}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="font-semibold text-ink text-[13.5px]">
                        {r.title}
                      </div>
                      <span className="text-[10px] font-semibold tracking-[1px] uppercase text-slate-meta shrink-0">
                        {lensLabel(r.lens)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-slate-meta line-clamp-2 leading-snug">
                      {r.tip}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function lensLabel(lens: SearchEntry["lens"]): string {
  if (lens === "employer") return "Employer";
  if (lens === "candidate") return "Candidate";
  return "Both";
}
