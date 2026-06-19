"use client";

/**
 * VerificationRequirements — the recruiter-facing "what this role requires"
 * checklist (5G.e Tier 2).
 *
 * ONE shared component, mounted by BOTH wizards (job-wizard.tsx,
 * corporate-wizard.tsx) and BOTH sectioned edit pages — built once
 * deliberately (the code-duplication trap is a named risk).
 *
 * It's a simple set of checkboxes over the canonical verification-type
 * list (src/lib/verifications/types.ts). The recruiter ticks which
 * verifications the role requires; the candidate self-attests to each in
 * the apply flow (V3). No third-party data — Tier 2 is attestation-only.
 *
 * Flat props (a Set + a toggle) — the wizards hold the selection as a
 * `Set<string>` useState, mirroring how they hold selectedLocationIds /
 * specialty / scheduleDays.
 *
 * `accent` swaps the brand color: "heritage" (practice/clinical wizard)
 * vs "corporate" (slate-blue #3D5266, the 5G.d corporate wizard).
 */

import {
  VERIFICATION_TYPES,
  type VerificationTypeValue,
} from "@/lib/verifications/types";

type Accent = "heritage" | "corporate";

const ACCENT: Record<
  Accent,
  { text: string; check: string; tintBorder: string }
> = {
  heritage: {
    text: "text-heritage-deep",
    check: "accent-heritage",
    tintBorder: "border-heritage/40",
  },
  corporate: {
    text: "text-[#3D5266]",
    check: "accent-[#3D5266]",
    tintBorder: "border-[#3D5266]/40",
  },
};

export interface VerificationRequirementsProps {
  accent: Accent;
  /** The selected verification-type values. */
  selected: Set<string>;
  /** Toggle one verification type on/off. */
  onToggle: (value: VerificationTypeValue) => void;
}

export function VerificationRequirements({
  accent,
  selected,
  onToggle,
}: VerificationRequirementsProps) {
  const a = ACCENT[accent];

  return (
    <fieldset className="border border-[var(--rule)] p-6 bg-cream/40">
      <legend
        className={`px-2 text-[13px] font-bold tracking-[2px] uppercase ${a.text}`}
      >
        Verification requirements
      </legend>

      <p className="mt-1 mb-4 text-[12px] text-slate-meta leading-relaxed">
        Pick what this role requires. Candidates confirm each one as part of
        their application — and can attach a matching credential from their
        profile as proof. Optional; leave all unchecked if none apply.
      </p>

      <div className="space-y-2.5">
        {VERIFICATION_TYPES.map((vt) => {
          const checked = selected.has(vt.value);
          return (
            <label
              key={vt.value}
              className={`flex items-start gap-3 p-3.5 border cursor-pointer transition-colors ${
                checked ? a.tintBorder : "border-[var(--rule)]"
              } bg-card`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(vt.value)}
                className={`mt-0.5 ${a.check}`}
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-bold text-ink">
                  {vt.label}
                </span>
                <span className="block text-[11px] text-slate-meta leading-snug">
                  {vt.recruiterHint}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
