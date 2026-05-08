"use client";

/**
 * <InlineDimEditor /> — small per-dim editor inside WhyThisMatch's
 * UnscoredDimRow (Phase 5D v1.3).
 *
 * Renders a tight inline form for the four dims that have a single
 * primitive answer the candidate can supply right there:
 *   • compensation (min_salary + salary_unit)
 *   • years_experience (years_experience_dental int)
 *   • employment_type (temp_or_perm: temp / perm / either)
 *   • dso_size (dso_size_preference: small / mid / large / any)
 *
 * On save: calls updateInlineDim server action. On success, the page
 * revalidates → fit row's input_hash differs from cache → next render
 * recomputes the score with the new input. The candidate sees their
 * fit lift in real time without bouncing through /candidate/profile.
 *
 * Multi-select dims (specialty, skills, license_states) deliberately
 * use the link-out CTA instead — chip-picker UX doesn't fit cleanly
 * inline and would make WhyThisMatch into an editor-in-disguise.
 */

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { updateInlineDim } from "@/lib/practice-fit/inline-edit-action";
import type { FitDimensionKey } from "@/lib/practice-fit/types";

export interface InlineDimEditorProps {
  dimKey: FitDimensionKey;
}

export function InlineDimEditor({ dimKey }: InlineDimEditorProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Per-dim local form state. Each dim shows different inputs.
  const [minSalary, setMinSalary] = useState("");
  const [salaryUnit, setSalaryUnit] = useState<string>("yearly");
  const [years, setYears] = useState("");
  const [tempOrPerm, setTempOrPerm] = useState<string>("");
  const [dsoSize, setDsoSize] = useState<string>("");

  function buildPayload(): Record<string, string> | { error: string } {
    switch (dimKey) {
      case "compensation":
        if (!minSalary.trim()) return { error: "Enter a minimum salary." };
        return { min_salary: minSalary, salary_unit: salaryUnit };
      case "years_experience":
        if (!years.trim()) return { error: "Enter your years of experience." };
        return { years };
      case "employment_type":
        if (!tempOrPerm) return { error: "Pick a preference." };
        return { temp_or_perm: tempOrPerm };
      case "dso_size":
        if (!dsoSize) return { error: "Pick a preference." };
        return { dso_size_preference: dsoSize };
      default:
        return { error: "This dimension doesn't support inline edit." };
    }
  }

  function handleSave() {
    const payload = buildPayload();
    if ("error" in payload) {
      setError(payload.error);
      return;
    }
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateInlineDim({ dimKey, payload });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <div className="mt-3 border border-[var(--rule)] bg-white p-3">
      <div className="flex flex-wrap items-end gap-2">
        {dimKey === "compensation" && (
          <>
            <div className="flex-1 min-w-[120px]">
              <label className="block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1">
                Minimum
              </label>
              <input
                type="number"
                value={minSalary}
                onChange={(e) => setMinSalary(e.target.value)}
                placeholder="50"
                className="w-full px-2 py-1.5 text-[13px] border border-[var(--rule)] focus:border-heritage focus:outline-none"
              />
            </div>
            <div className="min-w-[120px]">
              <label className="block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1">
                Per
              </label>
              <select
                value={salaryUnit}
                onChange={(e) => setSalaryUnit(e.target.value)}
                className="w-full px-2 py-1.5 text-[13px] border border-[var(--rule)] focus:border-heritage focus:outline-none bg-white"
              >
                <option value="hourly">hour</option>
                <option value="yearly">year</option>
                <option value="per_day">day</option>
                <option value="per_visit">visit</option>
              </select>
            </div>
          </>
        )}

        {dimKey === "years_experience" && (
          <div className="flex-1 min-w-[100px]">
            <label className="block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1">
              Years
            </label>
            <input
              type="number"
              min={0}
              max={80}
              value={years}
              onChange={(e) => setYears(e.target.value)}
              placeholder="3"
              className="w-full px-2 py-1.5 text-[13px] border border-[var(--rule)] focus:border-heritage focus:outline-none"
            />
          </div>
        )}

        {dimKey === "employment_type" && (
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1">
              I want
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { value: "perm", label: "Permanent" },
                { value: "temp", label: "Temp / contract" },
                { value: "either", label: "Either" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTempOrPerm(opt.value)}
                  className={`px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                    tempOrPerm === opt.value
                      ? "bg-heritage-deep text-ivory border-heritage-deep"
                      : "bg-white text-ink border-[var(--rule)] hover:border-heritage"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {dimKey === "dso_size" && (
          <div className="flex-1 min-w-[240px]">
            <label className="block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1">
              I prefer
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { value: "small", label: "Small (1-9)" },
                { value: "mid", label: "Mid (10-49)" },
                { value: "large", label: "Large (50+)" },
                { value: "any", label: "Any" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDsoSize(opt.value)}
                  className={`px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                    dsoSize === opt.value
                      ? "bg-heritage-deep text-ivory border-heritage-deep"
                      : "bg-white text-ink border-[var(--rule)] hover:border-heritage"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={pending || saved}
          className="px-3 py-1.5 text-[10px] font-bold tracking-[1.5px] uppercase bg-ink text-ivory hover:bg-ink-soft disabled:opacity-60 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
        >
          {pending && <Loader2 className="h-3 w-3 animate-spin" />}
          {saved && <Check className="h-3 w-3" />}
          {saved ? "Saved" : pending ? "Saving" : "Save"}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-[11px] text-red-700 leading-snug">{error}</p>
      )}
      {saved && (
        <p className="mt-2 text-[11px] text-heritage-deep leading-snug">
          Saved. Reload to see your updated score.
        </p>
      )}
    </div>
  );
}
