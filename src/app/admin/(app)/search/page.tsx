/**
 * /admin/search — god-mode operator search (Tranche 1, Phase 3).
 *
 * Tier-1 read surface (the (app) layout gates admin_users). One box → results
 * across DSOs / candidates / jobs / applications, each linking to its Account
 * 360. Operator access, not impersonation; EEO never surfaced.
 */

import Link from "next/link";
import { Search as SearchIcon, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { searchAdmin, type SearchResult } from "@/lib/admin/search";

export const metadata: Metadata = {
  title: "Search · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  dso: "DSO",
  candidate: "Candidate",
  job: "Job",
  application: "Application",
};

export default async function AdminSearch({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const results = query.length >= 2 ? await searchAdmin(query) : [];

  return (
    <>
      <header className="mb-6">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Operator search
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink">
          Search
        </h1>
        <p className="mt-3 text-[14px] text-slate-body leading-relaxed max-w-[640px]">
          Find any DSO, candidate, job, or application (paste an app id). Opens
          its Account 360.
        </p>
      </header>

      <form action="/admin/search" method="get" className="mb-8 max-w-[560px]">
        <div className="flex items-center gap-2 border border-[var(--rule-strong)] bg-card px-4 py-3 focus-within:border-heritage">
          <SearchIcon className="h-4 w-4 text-slate-meta shrink-0" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            autoFocus
            placeholder="Name, slug, email, job title, or application id…"
            className="flex-1 bg-transparent text-[14px] text-ink placeholder:text-slate-meta outline-none"
          />
        </div>
      </form>

      {query.length >= 2 && (
        <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta mb-3">
          {results.length} result{results.length === 1 ? "" : "s"} for
          &ldquo;{query}&rdquo;
        </div>
      )}

      {query.length >= 2 && results.length === 0 ? (
        <p className="text-[13px] text-slate-meta italic">
          Nothing matched. Try a name, slug, email, job title, or a full
          application id.
        </p>
      ) : (
        <ul className="list-none border border-[var(--rule)] divide-y divide-[var(--rule)] max-w-[760px]">
          {results.map((r) => (
            <li key={`${r.type}:${r.id}`}>
              <Link
                href={r.href}
                className="flex items-center justify-between gap-4 px-5 py-3.5 bg-card hover:bg-cream/60 transition-colors group"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold tracking-[1px] uppercase text-heritage-deep bg-heritage/10 shrink-0">
                      {TYPE_LABEL[r.type]}
                    </span>
                    <span className="text-[14px] text-ink font-semibold truncate">
                      {r.title}
                    </span>
                    {r.status && (
                      <span className="text-[10px] font-bold tracking-[0.5px] uppercase text-slate-meta shrink-0">
                        · {r.status}
                      </span>
                    )}
                  </div>
                  {r.subtitle && (
                    <div className="text-[12px] text-slate-meta truncate mt-0.5">
                      {r.subtitle}
                    </div>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 text-slate-meta group-hover:text-ink transition-colors shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
