/**
 * #88 — approach nudge. Renders a usage banner once a DSO crosses ~80% of a
 * plan cap (jobs or seats), turning red at the limit. Server component — fed
 * by getCapStatus(). Renders nothing below the threshold or on unlimited tiers
 * (memo §4.5: nudges at ~80/90%, framed around the next tier's features).
 */

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { CapUsage } from "@/lib/billing/caps";

const NEXT_TIER: Record<string, string> = {
  solo: "Growth",
  growth: "Scale",
  scale: "Enterprise",
};

export function CapNudge({
  kind,
  usage,
  tier,
}: {
  kind: "jobs" | "seats";
  usage: CapUsage;
  tier: string | null;
}) {
  if (usage.cap === null || !usage.nearLimit) return null;

  const noun = kind === "jobs" ? "active openings" : "admin seats";
  const next = tier ? NEXT_TIER[tier] : undefined;
  const tone = usage.atLimit
    ? "border-red-300 bg-red-50 text-red-900"
    : "border-amber-300 bg-amber-50 text-amber-900";

  const message = usage.atLimit
    ? `You're using all ${usage.cap} ${noun} on your plan.${
        kind === "jobs"
          ? " Pause a listing to free a slot, or upgrade."
          : " Remove a teammate or pending invite, or upgrade."
      }`
    : `You're using ${usage.used} of ${usage.cap} ${noun}. ${
        next ? `${next} unlocks more, plus added features.` : ""
      }`;

  return (
    <div
      className={
        "mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 text-[13px] " +
        tone
      }
    >
      <span className="inline-flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {message}
      </span>
      <Link
        href="/employer/billing"
        className="shrink-0 whitespace-nowrap font-bold underline"
      >
        {next ? `Upgrade to ${next} →` : "Manage plan →"}
      </Link>
    </div>
  );
}
