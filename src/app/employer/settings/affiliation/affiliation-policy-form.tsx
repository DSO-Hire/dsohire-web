"use client";

/**
 * AffiliationPolicyForm — radio-card chooser for the DSO's affiliation
 * reveal policy. Owner/admin only; gating is enforced in the parent
 * page + the server action.
 *
 * Three policies, each rendered as a radio card with explicit
 * implications spelled out — a recruiter shouldn't have to guess what
 * "after_hire" means in practice. Save action is the standard
 * useActionState pattern.
 */

import { useActionState, useEffect, useState } from "react";
import { Check, AlertCircle, Lock, ShieldCheck, MousePointerClick } from "lucide-react";
import {
  updateAffiliationRevealPolicy,
  type AffiliationActionState,
  type AffiliationRevealPolicy,
} from "./actions";

const initialState: AffiliationActionState = { ok: false };

interface AffiliationPolicyFormProps {
  currentPolicy: AffiliationRevealPolicy;
  dsoName: string;
}

// Stable identity for "no save has happened yet in this session" so the
// useEffect below can distinguish initial mount from post-save renders.
const SAVE_SENTINEL_INITIAL = Symbol("initial");

interface PolicyOption {
  id: AffiliationRevealPolicy;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  blurb: string;
  implications: string[];
}

export function AffiliationPolicyForm({
  currentPolicy,
  dsoName,
}: AffiliationPolicyFormProps) {
  const [state, action, pending] = useActionState(
    updateAffiliationRevealPolicy,
    initialState
  );
  const [selected, setSelected] = useState<AffiliationRevealPolicy>(currentPolicy);
  // effectivePolicy mirrors the DB-persisted value as the form sees it.
  // On mount it equals currentPolicy (the server-rendered prop); after a
  // successful save it advances to whatever was just persisted, so the
  // "Current" badge + the dirty-form check track reality without
  // waiting for a full Server Component refetch. Without this, save
  // reports "Saved." but the badge sits on the previous value and the
  // recruiter has to refresh to see the change land — exactly the bug
  // Cam caught 2026-05-08 PM.
  const [effectivePolicy, setEffectivePolicy] =
    useState<AffiliationRevealPolicy>(currentPolicy);
  // Track which `state` object's success we've already absorbed so the
  // effect doesn't double-fire when React re-renders.
  const [lastAbsorbedState, setLastAbsorbedState] = useState<
    AffiliationActionState | typeof SAVE_SENTINEL_INITIAL
  >(SAVE_SENTINEL_INITIAL);

  useEffect(() => {
    if (state === lastAbsorbedState) return;
    if (state.ok && state.message) {
      setEffectivePolicy(selected);
    }
    setLastAbsorbedState(state);
    // selected intentionally excluded — we only care about the value
    // at the moment the save succeeded, which is what useActionState
    // captured. Including it would re-run on every radio click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, lastAbsorbedState]);

  const options: PolicyOption[] = [
    {
      id: "never",
      label: "Never",
      Icon: Lock,
      blurb: `Candidates never see the ${dsoName} name — not during application, not after interview, not after hire. Their W-2 might say ${dsoName} but DSO Hire shows only the practice name forever.`,
      implications: [
        "Strongest privacy posture",
        "Matches DSOs that bought practices specifically for the brand equity",
        "Candidate paperwork at hire-time is on you to handle outside DSO Hire",
      ],
    },
    {
      id: "after_hire",
      label: "After hire",
      Icon: ShieldCheck,
      blurb: `Once you mark a candidate as hired, the ${dsoName} name appears in their inbox and dashboard. Before that point — every other status — they only see the practice name.`,
      implications: [
        "Cleanest narrative — they learn the corporate connection at the moment they sign on",
        "Aligns with payroll / W-2 timing in most cases",
        `One-way reveal — once they've seen ${dsoName}, you can't un-show it`,
      ],
    },
    {
      id: "per_application",
      label: "Per application",
      Icon: MousePointerClick,
      blurb: `You decide candidate-by-candidate. A "Reveal ${dsoName}" button on each application lets you flip visibility for that one candidate at any stage.`,
      implications: [
        "Maximum flexibility — useful for senior/leadership hires who'd want to know up front",
        "Adds a recruiter judgment call to every private-affiliation application",
        "Audit-logged: we track who revealed and when, for every flip",
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
          <span className="text-[12px] text-slate-meta">
            Unsaved change.
          </span>
        )}
      </div>

      <p className="text-[11px] text-slate-meta leading-relaxed pt-3 border-t border-[var(--rule)]">
        Changing this policy affects every private-affiliation
        application going forward + every existing application that
        hasn&apos;t yet been revealed. Already-revealed applications
        stay revealed — once a candidate has seen the {dsoName} name,
        we don&apos;t pretend they haven&apos;t.
      </p>
    </form>
  );
}
