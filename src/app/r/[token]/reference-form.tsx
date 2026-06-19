"use client";

/**
 * Public reference-form (Phase 5A Track D).
 *
 * Renders the locked 7-field set defined in reference-data.ts. The
 * reference is unauthenticated — submit goes through the server action
 * which writes via the service-role client, gated only by token match.
 *
 * Validation here is a courtesy; the server action revalidates against
 * the same REFERENCE_FIELDS source of truth.
 */

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import {
  REFERENCE_FIELDS,
  renderPrompt,
  type ReferenceFieldDef,
} from "@/app/employer/(app)/applications/[id]/reference-data";
import { submitReferenceResponse } from "./actions";

interface ReferenceFormProps {
  token: string;
  candidateName: string | null;
  referenceName: string | null;
  dsoName: string | null;
  jobTitle: string | null;
  requestingUserName: string | null;
}

export function ReferenceForm({
  token,
  candidateName,
  referenceName,
  dsoName,
  jobTitle,
  requestingUserName,
}: ReferenceFormProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const f of REFERENCE_FIELDS) seed[f.key] = "";
    return seed;
  });
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  const firstName = referenceName?.split(" ")[0] ?? null;

  function handleChange(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Client-side required check — server validates again.
    for (const field of REFERENCE_FIELDS) {
      if (!field.required) continue;
      if (!values[field.key] || values[field.key].trim() === "") {
        setError("Please answer every required question before submitting.");
        return;
      }
    }

    startTransition(async () => {
      const payload: Record<string, string | null> = {};
      for (const f of REFERENCE_FIELDS) {
        const v = values[f.key]?.trim() ?? "";
        payload[f.key] = v || null;
      }
      const result = await submitReferenceResponse(token, payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="text-center py-6">
        <CheckCircle2 className="mx-auto h-10 w-10 text-heritage mb-4" />
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-3">
          Thank you
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.8px] text-ink mb-3">
          Your reference has been sent.
        </h1>
        <p className="text-[14px] text-slate-body leading-relaxed max-w-[480px] mx-auto">
          {dsoName ?? "The hiring team"} has been notified. You can close this
          window — there&apos;s nothing else to do.
        </p>
      </div>
    );
  }

  const safeCandidate = candidateName ?? "the candidate";
  const requesterCopy = requestingUserName ?? "The hiring team";
  const dsoCopy = dsoName ?? "the hiring team";

  return (
    <form onSubmit={handleSubmit} className="space-y-7">
      <div>
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-3">
          {firstName ? `Hi ${firstName} —` : "Reference form"}
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.8px] text-ink mb-3 leading-[1.15]">
          Tell {dsoCopy} what it&apos;s like to work with {safeCandidate}.
        </h1>
        <p className="text-[14px] text-slate-body leading-relaxed">
          {requesterCopy} is considering {safeCandidate}
          {jobTitle ? (
            <>
              {" "}for a <strong className="text-ink">{jobTitle}</strong>{" "}
              role
            </>
          ) : null}
          {" "}and asked for your perspective. About 3-5 minutes — answers go
          only to the hiring team.
        </p>
      </div>

      <div className="space-y-6">
        {REFERENCE_FIELDS.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            candidateName={candidateName}
            value={values[field.key] ?? ""}
            onChange={(v) => handleChange(field.key, v)}
            disabled={pending}
          />
        ))}
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 border border-danger bg-danger-bg text-danger px-4 py-3 text-[13px]"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="pt-2 flex flex-wrap items-center gap-4 justify-between">
        <p className="text-[12px] text-slate-meta leading-relaxed">
          Your response goes only to {dsoCopy}&apos;s hiring team.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 text-[13px] font-bold tracking-[1.5px] uppercase hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting…
            </>
          ) : (
            "Submit reference"
          )}
        </button>
      </div>
    </form>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Field rendering
 * ───────────────────────────────────────────────────────────── */

function FieldRow({
  field,
  candidateName,
  value,
  onChange,
  disabled,
}: {
  field: ReferenceFieldDef;
  candidateName: string | null;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const prompt = renderPrompt(field.promptTemplate, candidateName);

  // Button-group inputs (scale_1_5, yes_no_maybe) aren't form controls
  // a <label> can be associated with — wrap them in a <fieldset> /
  // <legend> so the prompt labels the whole group for screen readers.
  // text / long_text stay in a <label> (single associated control).
  const isButtonGroup =
    field.kind === "scale_1_5" || field.kind === "yes_no_maybe";

  const header = (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-1.5">
        <span className="text-[14px] font-semibold text-ink leading-snug">
          {prompt}
        </span>
        {field.required ? (
          <span className="text-[9px] font-bold tracking-[2px] uppercase text-heritage-deep">
            Required
          </span>
        ) : (
          <span className="text-[9px] font-bold tracking-[2px] uppercase text-slate-meta">
            Optional
          </span>
        )}
      </div>
      {field.helperText && (
        <div className="text-[12px] text-slate-meta mb-2 leading-snug">
          {field.helperText}
        </div>
      )}
    </>
  );

  const input = (
    <FieldInput
      field={field}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );

  if (isButtonGroup) {
    return (
      <div>
        {/* reset default fieldset border/margin/padding */}
        <fieldset className="block border-0 m-0 p-0 min-w-0">
          <legend className="block p-0 w-full">{header}</legend>
          {input}
        </fieldset>
      </div>
    );
  }

  return (
    <div>
      <label className="block">
        {header}
        {input}
      </label>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: ReferenceFieldDef;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  switch (field.kind) {
    case "text":
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          maxLength={500}
          className="w-full border border-[var(--rule-strong)] bg-card px-3 py-2.5 text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-heritage/40 disabled:bg-muted disabled:cursor-not-allowed"
        />
      );
    case "long_text":
      return (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          maxLength={4000}
          rows={field.rows ?? 4}
          className="w-full border border-[var(--rule-strong)] bg-card px-3 py-2.5 text-[14px] text-ink leading-relaxed focus:outline-none focus:ring-2 focus:ring-heritage/40 disabled:bg-muted disabled:cursor-not-allowed resize-y"
        />
      );
    case "scale_1_5":
      return (
        <div className="flex flex-wrap items-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => {
            const selected = value === String(n);
            return (
              <button
                key={n}
                type="button"
                disabled={disabled}
                onClick={() => onChange(String(n))}
                className={`min-w-[44px] h-[40px] border text-[14px] font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-[var(--rule-strong)] bg-card text-ink hover:bg-cream"
                }`}
                aria-pressed={selected}
              >
                {n}
              </button>
            );
          })}
          <div className="ml-2 text-[11px] text-slate-meta">
            1 = Poor · 5 = Excellent
          </div>
        </div>
      );
    case "yes_no_maybe":
      return (
        <div className="flex flex-wrap items-center gap-2">
          {[
            { v: "yes", label: "Yes" },
            { v: "maybe", label: "Maybe" },
            { v: "no", label: "No" },
          ].map((opt) => {
            const selected = value === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                disabled={disabled}
                onClick={() => onChange(opt.v)}
                className={`px-4 py-2 border text-[13px] font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-[var(--rule-strong)] bg-card text-ink hover:bg-cream"
                }`}
                aria-pressed={selected}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      );
  }
}
