"use client";

/**
 * E2.17 — Voluntary EEO / demographic self-identification card.
 *
 * Rendered on the apply *success* screen, after the application is in.
 * Entirely optional: the candidate can fill any subset, skip the whole
 * thing, or decline per field. Submitting upserts one row into the
 * segregated `application_eeo_responses` table (firewalled from
 * employers by RLS).
 */

import { useState, useTransition } from "react";
import { Check, ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";
import { submitEeoSelfId } from "./eeo-actions";
import { EEO_FIELDS, type EeoFieldKey } from "@/lib/eeo/options";

export function EeoSelfId({ applicationId }: { applicationId: string }) {
  const [open, setOpen] = useState(true);
  const [done, setDone] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<EeoFieldKey, string>>({
    gender: "",
    race_ethnicity: "",
    veteran_status: "",
    disability_status: "",
  });

  const setField = (key: EeoFieldKey, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = () => {
    setError(null);
    startTransition(async () => {
      const result = await submitEeoSelfId({
        applicationId,
        gender: values.gender || null,
        race_ethnicity: values.race_ethnicity || null,
        veteran_status: values.veteran_status || null,
        disability_status: values.disability_status || null,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      setDone(true);
    });
  };

  // Skipped — remove the card entirely (nothing was recorded).
  if (dismissed) return null;

  // ── Recorded state ──
  if (done) {
    return (
      <div className="mt-6 border border-[var(--rule)] bg-white p-6">
        <div className="flex items-start gap-3">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-heritage" />
          <p className="text-[14px] leading-relaxed text-ink">
            Thanks — your voluntary self-identification has been recorded
            separately from your application. It is never shared with the
            hiring team and has no bearing on hiring decisions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 border border-[var(--rule)] bg-white">
      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-6 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-heritage" />
          <span className="text-[10px] font-bold uppercase tracking-[2.5px] text-heritage-deep">
            Voluntary self-identification
          </span>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-ink-soft" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-soft" />
        )}
      </button>

      {open && (
        <div className="border-t border-[var(--rule)] px-6 pb-6 pt-5">
          <p className="mb-5 max-w-prose text-[13px] leading-relaxed text-ink-soft">
            This information is requested on a voluntary basis. It is kept
            completely separate from your application, is{" "}
            <span className="font-semibold text-ink">never seen by anyone</span>{" "}
            making a hiring decision, and{" "}
            <span className="font-semibold text-ink">
              will not affect your candidacy
            </span>{" "}
            in any way. Answering is entirely up to you — you can leave any
            question blank or choose &ldquo;I don&rsquo;t wish to answer.&rdquo;
          </p>

          <div className="space-y-6">
            {EEO_FIELDS.map((field) => (
              <fieldset key={field.key}>
                <legend className="mb-2 text-[12px] font-semibold text-ink">
                  {field.label}
                </legend>
                <div className="space-y-1.5">
                  {field.options.map((opt) => {
                    const id = `${field.key}__${opt.value}`;
                    const checked = values[field.key] === opt.value;
                    return (
                      <label
                        key={id}
                        htmlFor={id}
                        className={
                          "flex cursor-pointer items-start gap-2.5 border px-3 py-2 text-[13px] leading-snug transition-colors " +
                          (checked
                            ? "border-heritage bg-heritage/[0.06] text-ink"
                            : "border-[var(--rule)] text-ink-soft hover:bg-cream")
                        }
                      >
                        <input
                          type="radio"
                          id={id}
                          name={field.key}
                          value={opt.value}
                          checked={checked}
                          onChange={() => setField(field.key, opt.value)}
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-heritage"
                        />
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>

          {error && (
            <p className="mt-4 text-[13px] text-red-700" role="alert">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={pending}
              className="inline-flex items-center gap-2 bg-ink px-5 py-3 text-[12px] font-bold uppercase tracking-[2px] text-ivory transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Saving…" : "Submit responses"}
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              disabled={pending}
              className="text-[12px] font-bold uppercase tracking-[2px] text-ink-soft transition-colors hover:text-ink disabled:opacity-60"
            >
              Skip this step
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
