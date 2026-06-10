"use client";

/**
 * #88 — seat-pack control. Lets an owner/admin add or remove +3 seat packs
 * (an add-on line item on their Stripe subscription) without a full tier jump.
 * The light top-off option; the CapNudge still offers the upgrade path, so
 * heavy seat needs are steered to a bigger plan (memo §4.5, anti-nickel-dime).
 *
 * Server component callers fetch the current usage + pack count and pass them
 * in. Renders nothing if packs aren't available for the plan.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Minus, Users } from "lucide-react";
import { addSeatPack, removeSeatPack } from "@/app/employer/billing/seat-pack-actions";

export function SeatPackControl({
  currentPacks,
  seatsUsed,
  seatCap,
  packSize,
  monthlyPrice,
  annualPrice,
  period,
}: {
  currentPacks: number;
  seatsUsed: number;
  seatCap: number | null;
  packSize: number;
  monthlyPrice: number;
  annualPrice: number;
  period: "monthly" | "annual";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const priceLabel =
    period === "annual"
      ? `$${annualPrice.toLocaleString()}/yr`
      : `$${monthlyPrice.toLocaleString()}/mo`;

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setMsg(null);
    startTransition(async () => {
      const res = await action();
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="border border-[var(--rule-strong)] bg-cream/40 p-6 max-w-[820px]">
      <div className="flex items-start gap-3">
        <Users className="h-5 w-5 text-heritage-deep shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-ink">Need more seats?</div>
          <p className="mt-1 text-[13px] text-slate-body leading-relaxed">
            Add a {packSize}-seat pack for {priceLabel} — billed on your current
            cycle, prorated. Cancel anytime.{" "}
            {seatCap !== null && (
              <span className="text-slate-meta">
                Using {seatsUsed} of {seatCap} seats
                {currentPacks > 0
                  ? ` · ${currentPacks} pack${currentPacks === 1 ? "" : "s"} active (+${currentPacks * packSize})`
                  : ""}
                .
              </span>
            )}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(addSeatPack)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink text-ivory text-[11px] font-bold tracking-[1.6px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add {packSize} seats
            </button>
            {currentPacks > 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(removeSeatPack)}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-bold tracking-[1.4px] uppercase text-slate-body hover:text-red-700 transition-colors disabled:opacity-50"
              >
                <Minus className="h-3.5 w-3.5" />
                Remove a pack
              </button>
            )}
          </div>

          {msg && (
            <p
              className={
                "mt-3 text-[13px] " +
                (msg.ok ? "text-heritage-deep" : "text-red-700")
              }
            >
              {msg.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
