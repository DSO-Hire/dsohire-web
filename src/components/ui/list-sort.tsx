"use client";

/**
 * <ListSort /> — generic sort-selector that writes its choice to the
 * URL (`?sort=<value>`). Pair it with surface-specific filter UI on
 * the same controls strip; the sort value composes with whatever
 * other params the page tracks.
 *
 * Surfaces using this:
 *   - /employer/jobs           (also has location multi-select)
 *   - /employer/applications   (also has job + status + range filters)
 *   - /candidate/applications  (tab-based status filter)
 *   - /employer/team           (also has role filter)
 *   - /employer/locations
 *   - /companies               (also has state filter)
 *
 * Pattern note: when the active sort equals `defaultValue`, we delete
 * the param so URLs stay clean for the canonical view.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface ListSortProps {
  /** The route this sort writes back to. */
  basePath: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  activeValue: string;
  /** When the choice equals this, omit the URL param (keeps URLs clean). */
  defaultValue: string;
  /** Optional label shown to the left of the select. */
  label?: string;
  /**
   * Optional CSS classes for the wrapper. Lets surfaces compose this
   * with their own filter controls on the same row.
   */
  className?: string;
}

export function ListSort({
  basePath,
  options,
  activeValue,
  defaultValue,
  label = "Sort",
  className,
}: ListSortProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const onChange = (value: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("page"); // sort change resets pagination
    if (value === defaultValue) params.delete("sort");
    else params.set("sort", value);
    startTransition(() => {
      router.push(`${basePath}${params.size ? `?${params.toString()}` : ""}`);
    });
  };

  return (
    <div className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <label className="text-[10px] font-bold tracking-[2px] uppercase text-slate-body">
        {label}
      </label>
      <select
        value={activeValue}
        onChange={(e) => onChange(e.currentTarget.value)}
        disabled={pending}
        className="text-[12px] px-2.5 py-1.5 bg-white border border-[var(--rule-strong)] text-ink focus:outline-none focus:border-heritage min-w-[180px]"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
