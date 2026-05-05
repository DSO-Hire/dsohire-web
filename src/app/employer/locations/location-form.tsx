"use client";

/**
 * LocationForm — shared form for /employer/locations/new and /employer/locations/[id].
 *
 * Wraps create / update server actions with useActionState. Field shape mirrors
 * the onboarding-form so DSOs see the same surface everywhere they enter
 * location info.
 */

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowRight, Save } from "lucide-react";
import {
  createLocation,
  updateLocation,
  type LocationActionState,
} from "./actions";
import {
  StateCombobox,
  normalizeStateInput,
} from "@/components/ui/state-combobox";

export interface LocationFormInitial {
  id: string;
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
}

interface LocationFormProps {
  dsoId: string;
  mode: "create" | "edit";
  initial?: LocationFormInitial;
}

const initialState: LocationActionState = { ok: false };

export function LocationForm({ dsoId, mode, initial }: LocationFormProps) {
  const action = mode === "edit" ? updateLocation : createLocation;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [stateCode, setStateCode] = useState<string | null>(
    normalizeStateInput(initial?.state ?? null)
  );

  return (
    <form action={formAction} className="space-y-6 max-w-[720px]">
      <input type="hidden" name="dso_id" value={dsoId} />
      {mode === "edit" && initial && (
        <input type="hidden" name="location_id" value={initial.id} />
      )}

      <Field
        label="Location name"
        name="name"
        required
        autoComplete="organization"
        placeholder="Downtown Office"
        defaultValue={initial?.name ?? ""}
        helper="The name candidates see on the job listing — usually a neighborhood, mall, or street name. Not your DSO name."
      />

      <Field
        label="Street address"
        name="address_line1"
        autoComplete="street-address"
        placeholder="123 Main Street"
        defaultValue={initial?.address_line1 ?? ""}
        optional
      />

      <Field
        label="Suite / unit"
        name="address_line2"
        autoComplete="address-line2"
        placeholder="Suite 200"
        defaultValue={initial?.address_line2 ?? ""}
        optional
      />

      <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1.2fr] gap-4">
        <Field
          label="City"
          name="city"
          required
          autoComplete="address-level2"
          placeholder="Kansas City"
          defaultValue={initial?.city ?? ""}
        />
        <div>
          <label
            htmlFor="loc-state"
            className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
          >
            State <span className="text-heritage"> *</span>
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
        <Field
          label="ZIP"
          name="postal_code"
          autoComplete="postal-code"
          placeholder="66208"
          defaultValue={initial?.postal_code ?? ""}
          optional
        />
      </div>

      {state.error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <p className="text-[14px] text-red-900">{state.error}</p>
        </div>
      )}

      {state.ok && mode === "edit" && (
        <div className="bg-cream border-l-4 border-heritage p-4">
          <p className="text-[14px] text-ink font-semibold">Saved.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-3 pt-4 border-t border-[var(--rule)]">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending
            ? mode === "create"
              ? "Adding…"
              : "Saving…"
            : mode === "create"
              ? "Add Location"
              : "Save Changes"}
          {!pending &&
            (mode === "create" ? (
              <ArrowRight className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            ))}
        </button>
        <Link
          href="/employer/locations"
          className="inline-flex items-center gap-2.5 px-7 py-4 border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[2px] uppercase hover:bg-cream transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

/* ───── small input ───── */

function Field({
  label,
  name,
  required,
  optional,
  placeholder,
  defaultValue,
  autoComplete,
  maxLength,
  uppercase,
  helper,
}: {
  label: string;
  name: string;
  required?: boolean;
  optional?: boolean;
  placeholder?: string;
  defaultValue?: string | number;
  autoComplete?: string;
  maxLength?: number;
  uppercase?: boolean;
  helper?: string;
}) {
  return (
    <div>
      <label
        htmlFor={`loc-${name}`}
        className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
      >
        {label}
        {required && <span className="text-heritage"> *</span>}
        {optional && (
          <span className="text-slate-meta font-normal normal-case tracking-normal">
            {" "}
            (optional)
          </span>
        )}
      </label>
      <input
        id={`loc-${name}`}
        name={name}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        maxLength={maxLength}
        className={`w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors ${
          uppercase ? "uppercase" : ""
        }`}
      />
      {helper && (
        <p className="mt-1.5 text-[12px] text-slate-meta leading-relaxed">
          {helper}
        </p>
      )}
    </div>
  );
}
