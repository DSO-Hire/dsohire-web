"use client";

/**
 * Monthly / Annual segmented toggle for /pricing.
 *
 * Drives the `period` search param (annual = `?period=annual`, monthly = no
 * param) so the server page can read it and render period-aware prices + CTAs.
 * Keeping state in the URL means the choice survives a refresh, is shareable,
 * and the whole page stays server-rendered apart from this control.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { BillingPeriod } from "@/lib/stripe/prices";

export function BillingPeriodToggle({ period }: { period: BillingPeriod }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setPeriod(next: BillingPeriod) {
    if (next === period) return;
    // Annual is the default view, so it's the clean no-param state; monthly
    // is the explicit opt-out via ?period=monthly.
    const params = new URLSearchParams(searchParams.toString());
    if (next === "annual") params.delete("period");
    else params.set("period", "monthly");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex items-center justify-center gap-3">
      <div
        role="group"
        aria-label="Billing period"
        className="inline-flex items-center bg-cream border border-[var(--rule-strong)] p-1"
      >
        <Option
          label="Monthly"
          active={period === "monthly"}
          onClick={() => setPeriod("monthly")}
        />
        <Option
          label="Annual"
          active={period === "annual"}
          onClick={() => setPeriod("annual")}
        />
      </div>
      <span className="text-xs font-semibold text-stage-bronze tabular">
        Save 10% annually
      </span>
    </div>
  );
}

function Option({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`px-5 py-2 text-xs font-semibold transition-colors ${
        active
          ? "bg-card text-ink font-bold shadow-[inset_0_-2px_0_0_var(--heritage)]"
          : "bg-transparent text-slate-body hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
