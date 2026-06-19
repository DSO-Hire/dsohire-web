"use client";

/**
 * <RoleFilter /> — client-side role filter for the team page. Writes the
 * chosen role to the URL (`?role=<value>`), preserving the active sort.
 *
 * Extracted from the team page's inline `<select onChange>` (2026-06-01):
 * that handler lived in a Server Component, which throws
 * "Event handlers cannot be passed to Client Component props" the moment
 * the controls strip renders (i.e. once a DSO has >1 teammate). Mirrors
 * the ListSort pattern so the two controls compose on the same row.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const ROLE_OPTIONS = [
  { value: "", label: "All roles" },
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "recruiter", label: "Recruiter" },
  { value: "hiring_manager", label: "Hiring Manager" },
] as const;

interface RoleFilterProps {
  basePath: string;
  activeValue: string;
}

export function RoleFilter({ basePath, activeValue }: RoleFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const onChange = (value: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (value) params.set("role", value);
    else params.delete("role");
    startTransition(() => {
      router.push(`${basePath}${params.size ? `?${params.toString()}` : ""}`);
    });
  };

  return (
    <div className="inline-flex items-center gap-2">
      <label className="text-[10px] font-bold tracking-[2px] uppercase text-slate-body">
        Role
      </label>
      <select
        value={activeValue}
        onChange={(e) => onChange(e.currentTarget.value)}
        disabled={pending}
        className="text-[12px] px-2.5 py-1.5 bg-card border border-[var(--rule-strong)] text-ink focus:outline-none focus:border-heritage"
      >
        {ROLE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
