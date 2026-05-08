"use client";

/**
 * AuditFiltersBar — three-control filter strip for the audit list.
 *
 * Date range (single-select), actor (single-select), event kind
 * (multi-select chips). Submitting any control posts a GET to the
 * same route with the URL-encoded filter set; the server-rendered
 * page re-fetches with the new filter applied. Keeps state in the URL
 * so a recruiter can deep-link a filtered view.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface AuditFiltersBarProps {
  teammates: Array<{ id: string; full_name: string | null; role: string }>;
  eventKinds: Record<string, string>;
  activeActor: string;
  activeKinds: string[];
  activeRange: string;
}

const RANGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

export function AuditFiltersBar({
  teammates,
  eventKinds,
  activeActor,
  activeKinds,
  activeRange,
}: AuditFiltersBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParam = (
    key: "actor" | "range",
    value: string | null
  ) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("page");
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
    startTransition(() => {
      router.push(`/employer/settings/audit?${params.toString()}`);
    });
  };

  const toggleKind = (kind: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("page");
    const current = params.getAll("kind");
    params.delete("kind");
    if (current.includes(kind)) {
      for (const k of current) if (k !== kind) params.append("kind", k);
    } else {
      for (const k of current) params.append("kind", k);
      params.append("kind", kind);
    }
    startTransition(() => {
      router.push(`/employer/settings/audit?${params.toString()}`);
    });
  };

  const clearAll = () => {
    startTransition(() => {
      router.push("/employer/settings/audit");
    });
  };

  const hasFilters = activeActor || activeKinds.length > 0 || activeRange !== "30d";

  return (
    <div className="border border-[var(--rule)] bg-cream/40 px-4 py-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[10px] font-bold tracking-[2px] uppercase text-slate-body">
          Range
        </label>
        <select
          value={activeRange}
          onChange={(e) => setParam("range", e.currentTarget.value)}
          disabled={pending}
          className="text-[12px] px-2 py-1.5 bg-white border border-[var(--rule-strong)] text-ink focus:outline-none focus:border-heritage"
        >
          {RANGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <label className="ml-2 text-[10px] font-bold tracking-[2px] uppercase text-slate-body">
          Actor
        </label>
        <select
          value={activeActor}
          onChange={(e) => setParam("actor", e.currentTarget.value || null)}
          disabled={pending}
          className="text-[12px] px-2 py-1.5 bg-white border border-[var(--rule-strong)] text-ink focus:outline-none focus:border-heritage min-w-[160px]"
        >
          <option value="">All teammates</option>
          {teammates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name ?? "(unnamed)"} · {t.role.replace("_", " ")}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            disabled={pending}
            className="ml-auto text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta hover:text-red-700 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <label className="text-[10px] font-bold tracking-[2px] uppercase text-slate-body mr-2">
          Event kinds
        </label>
        {Object.entries(eventKinds).map(([kind, label]) => {
          const active = activeKinds.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              onClick={() => toggleKind(kind)}
              disabled={pending}
              className={
                "text-[10px] font-semibold tracking-[0.5px] px-2 py-1 transition-colors " +
                (active
                  ? "bg-heritage text-ivory"
                  : "bg-white text-ink border border-[var(--rule-strong)] hover:bg-cream")
              }
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
