"use client";

/**
 * CorporateAffiliationPolicyForm — 5G.a addendum (2026-05-13).
 *
 * Sibling to AffiliationPolicyForm. Controls how 0-anchor-location
 * corporate-scope job postings resolve the DSO name in AI-generated
 * copy + (future) corporate-scope public surfaces.
 *
 * Two policies:
 *   • strict (default) — mask to "the company" when ANY location is
 *     private. Matches the legal-shield default-to-less-risk posture.
 *   • permissive — expose the DSO name as long as at least one location
 *     is publicly affiliated. The DSO has opted into using its
 *     corporate name on corporate-scope postings.
 *
 * Owner/admin only; gating in the parent page + server action.
 */

import { useActionState, useEffect, useState } from "react";
import { Check, AlertCircle, ShieldCheck, Building2 } from "lucide-react";
import {
  updateCorporateAffiliationPolicy,
  type AffiliationActionState,
  type CorporateAffiliationPolicy,
} from "./actions";

const initialState: AffiliationActionState = { ok: false };

interface CorporateAffiliationPolicyFormProps {
  currentPolicy: CorporateAffiliationPolicy;
  dsoName: string;
  privateCount: number;
  publicCount: number;
}

const SAVE_SENTINEL_INITIAL = Symbol("initial");

interface PolicyOption {
  id: CorporateAffiliationPolicy;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  blurb: string;
  implications: string[];
}

export function CorporateAffiliationPolicyForm({
  currentPolicy,
  dsoName,
  privateCount,
  publicCount,
}: CorporateAffiliationPolicyFormProps) {
  const [state, action, pending] = useActionState(
    updateCorporateAffiliationPolicy,
    initialState
  );
  const [selected, setSelected] =
    useState<CorporateAffiliationPolicy>(currentPolicy);
  const [effectivePolicy, setEffectivePolicy] =
    useState<CorporateAffiliationPolicy>(currentPolicy);
  const [lastAbsorbedState, setLastAbsorbedState] = useState<
    AffiliationActionState | typeof SAVE_SENTINEL_INITIAL
  >(SAVE_SENTINEL_INITIAL);

  useEffect(() => {
    if (state === lastAbsorbedState) return;
    if (state.ok && state.message) {
      setEffectivePolicy(selected);
    }
    setLastAbsorbedState(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, lastAbsorbedState]);

  const options: PolicyOption[] = [
    {
      id: "strict",
      label: "Strict",
      Icon: ShieldCheck,
      blurb: `If any of your locations is privately affiliated, corporate-scope job postings (CEO, CFO, regional director, etc.) mask the ${dsoName} name to "the company" in AI-generated copy and public labels.`,
      implications: [
        "Default — matches the legal-shield posture of erring toward less corporate exposure",
        `Right when ${privateCount} of ${privateCount + publicCount} of your locations already hide the ${dsoName} brand publicly`,
        "A recruiter can still type the name into the description editor manually if they want",
      ],
    },
    {
      id: "permissive",
      label: "Permissive",
      Icon: Building2,
      blurb: `Corporate-scope postings use the ${dsoName} name as long as at least one of your locations is publicly affiliated. The DSO has opted into using its corporate brand on corporate-level hires.`,
      implications: [
        "Useful when corporate leadership hires are publicly branded even if many practices aren't",
        "Per-location and per-job affiliation rules are unchanged — this only affects 0-location corporate jobs",
        "Switch back to strict any time; only future AI generations are affected",
      ],
    },
  ];

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-3">
        {options.map((opt) => {
          const isSelected = selected === opt.id;
          const isCurrent = effectivePolicy === opt.id;
          const Icon = opt.Icon;
          return (
            <label
              key={opt.id}
              className={
                "block border cursor-pointer transition-colors px-5 py-4 " +
                (isSelected
                  ? "border-heritage bg-cream"
                  : "border-[var(--rule-strong)] bg-white hover:bg-cream/50")
              }
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="policy"
                  value={opt.id}
                  checked={isSelected}
                  onChange={() => setSelected(opt.id)}
                  className="mt-1 accent-heritage flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Icon className="h-3.5 w-3.5 text-heritage-deep flex-shrink-0" />
                    <span className="text-[14px] font-extrabold tracking-[-0.2px] text-ink">
                      {opt.label}
                    </span>
                    {isCurrent && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-heritage text-ivory text-[9px] font-bold tracking-[1.2px] uppercase">
                        <Check className="h-2.5 w-2.5" />
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-slate-body leading-relaxed mb-2">
                    {opt.blurb}
                  </p>
                  <ul className="space-y-0.5">
                    {opt.implications.map((line, i) => (
                      <li
                        key={i}
                        className="text-[12px] text-slate-meta leading-relaxed flex items-start gap-1.5"
                      >
                        <span className="text-heritage-deep mt-0.5">·</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </label>
          );
        })}
      </div>

      {state.error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-700 mt-0.5 flex-shrink-0" />
          <p className="text-[13px] text-red-900">{state.error}</p>
        </div>
      )}
      {state.ok && state.message && (
        <div className="bg-cream border-l-4 border-heritage p-3">
          <p className="text-[13px] text-ink font-semibold">{state.message}</p>
        </div>
      )}

      <div className="pt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || selected === effectivePolicy}
          className="inline-flex items-center gap-2 px-7 py-3 bg-ink text-ivory text-[12px] font-bold tracking-[1.8px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending ? "Saving…" : "Save policy"}
        </button>
        {selected !== effectivePolicy && !pending && (
          <span className="text-[12px] text-slate-meta">Unsaved change.</span>
        )}
      </div>

      <p className="text-[11px] text-slate-meta leading-relaxed pt-3 border-t border-[var(--rule)]">
        Only affects 0-anchor-location corporate-scope postings. Jobs at a
        specific practice still follow that practice&apos;s per-location
        affiliation toggle. Regional / multi-practice jobs still follow
        most-private-inherits across their tagged practices.
      </p>
    </form>
  );
}
