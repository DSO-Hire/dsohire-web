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
  /**
   * Per-location DSO-affiliation toggle (Phase 4.5.b launch-blocker,
   * locked 2026-05-08). True (default) shows the DSO name on public
   * surfaces; false hides it for acquired-brand practices that retain
   * their original brand publicly.
   */
  public_dso_affiliation: boolean;
}

interface LocationFormProps {
  dsoId: string;
  mode: "create" | "edit";
  initial?: LocationFormInitial;
  /**
   * The DSO's display name — interpolated into the affiliation toggle's
   * helper copy ("Display {dsoName} on the public job page"). Required
   * when mode = 'edit'; ignored on 'create' (toggle isn't shown there
   * since new locations default to public + can be flipped post-create).
   */
  dsoName?: string;
}

const initialState: LocationActionState = { ok: false };

export function LocationForm({ dsoId, mode, initial, dsoName }: LocationFormProps) {
  const action = mode === "edit" ? updateLocation : createLocation;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [stateCode, setStateCode] = useState<string | null>(
    normalizeStateInput(initial?.state ?? null)
  );
  const [showDsoAffiliation, setShowDsoAffiliation] = useState<boolean>(
    initial?.public_dso_affiliation ?? true
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

      {/* Per-location DSO-affiliation toggle. Edit mode only — the
          create flow defaults to public; admins can flip after creation
          if the new location is an acquired brand. Form posts the
          checkbox value as `public_dso_affiliation`; unchecked means
          false. The hidden input ensures the field is always present
          in formData even when the checkbox is unchecked (browsers
          omit unchecked checkbox values, which would otherwise leave
          the existing DB value unchanged on submit). */}
      {mode === "edit" && (
        <div className="border border-[var(--rule-strong)] bg-cream/50 px-5 py-4">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
            Public Branding
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="public_dso_affiliation_checkbox"
              checked={showDsoAffiliation}
              onChange={(e) => setShowDsoAffiliation(e.currentTarget.checked)}
              className="mt-1 h-4 w-4 accent-heritage cursor-pointer flex-shrink-0"
            />
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-ink">
                Display{" "}
                <span className="text-heritage-deep">
                  {dsoName ?? "your DSO"}
                </span>{" "}
                on the public job page
              </div>
              <p className="mt-1 text-[12px] text-slate-meta leading-relaxed">
                When off, candidates see this practice as a standalone
                brand. They won&apos;t see {dsoName ?? "your DSO"}{" "}
                anywhere — not on the job, the location page, the apply
                flow, or in confirmation emails. Use this for acquired
                practices that keep their original public brand.
              </p>
              <p className="mt-2 text-[12px] text-slate-meta leading-relaxed">
                Multi-location jobs that include a private location will
                also hide {dsoName ?? "the DSO name"} on every other
                location they touch — &ldquo;most-private&rdquo;
                inherits across the whole job.
              </p>
            </div>
          </label>
          {/* Hidden field carries the actual boolean value to the action.
              Always present, regardless of checkbox state. */}
          <input
            type="hidden"
            name="public_dso_affiliation"
            value={showDsoAffiliation ? "true" : "false"}
          />
        </div>
      )}

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
