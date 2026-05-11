"use client";

/**
 * Discover-tab filter bar (E7.2-E7.6 / Phase 5D, shipped 2026-05-11).
 *
 * Single GET form — submitting updates the URL with the active filters
 * so they're shareable / bookmarkable / refresh-survivable.
 */

import { Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

interface DiscoverFiltersProps {
  initial: {
    q: string;
    role: string;
    state: string;
    license: string;
    min_years: string;
  };
  roleOptions: ReadonlyArray<{ value: string; label: string }>;
}

export function DiscoverFilters({ initial, roleOptions }: DiscoverFiltersProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(initial.q);
  const [role, setRole] = useState(initial.role);
  const [stateCode, setStateCode] = useState(initial.state);
  const [licenseCode, setLicenseCode] = useState(initial.license);
  const [minYears, setMinYears] = useState(initial.min_years);

  const hasAnyFilter =
    q || role || stateCode || licenseCode || minYears;

  function buildHref() {
    const params = new URLSearchParams();
    if (sp.get("tab")) params.set("tab", sp.get("tab")!);
    if (q.trim()) params.set("q", q.trim());
    if (role) params.set("role", role);
    if (stateCode.trim()) params.set("state", stateCode.trim().toUpperCase());
    if (licenseCode.trim())
      params.set("license", licenseCode.trim().toUpperCase());
    if (minYears.trim()) params.set("min_years", minYears.trim());
    const qs = params.toString();
    return qs ? `/employer/talent-pool?${qs}` : "/employer/talent-pool";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(buildHref());
  }

  function handleClear() {
    setQ("");
    setRole("");
    setStateCode("");
    setLicenseCode("");
    setMinYears("");
    router.push("/employer/talent-pool");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-[var(--rule)] bg-white p-4 space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-meta"
            aria-hidden
          />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, headline, current title…"
            className="w-full pl-9 pr-3 py-2.5 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage"
          />
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="px-3 py-2.5 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage"
        >
          {roleOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <FilterField
          label="Current state"
          value={stateCode}
          onChange={setStateCode}
          placeholder="e.g. TX"
          maxLength={2}
        />
        <FilterField
          label="Licensed in"
          value={licenseCode}
          onChange={setLicenseCode}
          placeholder="e.g. CA"
          maxLength={2}
        />
        <FilterField
          label="Min years exp"
          value={minYears}
          onChange={setMinYears}
          placeholder="e.g. 3"
          type="number"
        />
      </div>
      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          className="inline-flex items-center gap-2 px-5 py-2 bg-ink text-ivory text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors"
        >
          <Search className="h-3.5 w-3.5" />
          Search
        </button>
        {hasAnyFilter && (
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
          >
            <X className="h-3 w-3" />
            Clear filters
          </button>
        )}
      </div>
    </form>
  );
}

function FilterField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  type?: "text" | "number";
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) =>
          onChange(
            maxLength === 2
              ? e.target.value.toUpperCase().slice(0, 2)
              : e.target.value
          )
        }
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage"
      />
    </label>
  );
}
