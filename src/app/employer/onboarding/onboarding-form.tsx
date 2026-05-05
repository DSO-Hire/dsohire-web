"use client";

import { useActionState, useState } from "react";
import { ArrowRight } from "lucide-react";
import { addFirstLocation, type OnboardingState } from "./actions";
import { StateCombobox } from "@/components/ui/state-combobox";

const initial: OnboardingState = { ok: false };

export function OnboardingForm({ dsoId }: { dsoId: string }) {
  const [state, action, pending] = useActionState(addFirstLocation, initial);
  const [stateCode, setStateCode] = useState<string | null>(null);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="dso_id" value={dsoId} />

      <div>
        <label
          htmlFor="loc-name"
          className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
        >
          Location name <span className="text-heritage">*</span>
        </label>
        <input
          id="loc-name"
          name="name"
          required
          autoComplete="organization"
          placeholder="Downtown Office"
          className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
        />
        <p className="mt-1.5 text-[12px] text-slate-meta leading-relaxed">
          The name candidates see on the job listing — usually a neighborhood,
          mall, or street name. Not your DSO name.
        </p>
      </div>

      <div>
        <label
          htmlFor="loc-address"
          className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
        >
          Street address (optional)
        </label>
        <input
          id="loc-address"
          name="address_line1"
          autoComplete="street-address"
          placeholder="123 Main Street"
          className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1.2fr] gap-4">
        <div>
          <label
            htmlFor="loc-city"
            className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
          >
            City <span className="text-heritage">*</span>
          </label>
          <input
            id="loc-city"
            name="city"
            required
            autoComplete="address-level2"
            placeholder="Kansas City"
            className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
          />
        </div>
        <div>
          <label
            htmlFor="loc-state"
            className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
          >
            State <span className="text-heritage">*</span>
          </label>
          <StateCombobox
            id="loc-state"
            name="state"
            value={stateCode}
            onValueChange={setStateCode}
            placeholder="Select state"
            required
            hideClear
          />
        </div>
        <div>
          <label
            htmlFor="loc-zip"
            className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
          >
            ZIP (optional)
          </label>
          <input
            id="loc-zip"
            name="postal_code"
            autoComplete="postal-code"
            placeholder="66208"
            className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
          />
        </div>
      </div>

      {state.error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <p className="text-[14px] text-red-900">{state.error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2.5 w-full sm:w-auto px-9 py-4 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "Saving…" : "Add Location & Continue"}
        {!pending && <ArrowRight className="h-4 w-4" />}
      </button>

      <p className="text-[13px] text-slate-meta leading-relaxed">
        You can add more locations after onboarding. Maps and lat/lng are
        looked up automatically when you save the address.
      </p>
    </form>
  );
}
