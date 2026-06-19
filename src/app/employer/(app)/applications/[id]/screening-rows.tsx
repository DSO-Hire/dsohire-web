/**
 * Screening + verification rows — BOH Remodel Lane 3 commit 1 (pure
 * extraction from page.tsx, markup unchanged).
 *
 * ScreeningResponseRow: one row per screening question with the
 * candidate's formatted answer; required-but-blank gets the red flag.
 * VerificationRow (5G.e Tier 2, attestation-only): one row per job
 * verification requirement, mirroring the screening structure.
 */

import {
  AlignLeft,
  Calendar,
  CheckSquare,
  Hash,
  ListChecks,
  ShieldCheck,
  SlidersHorizontal,
  ToggleLeft,
  Type,
} from "lucide-react";
import type {
  ExistingAnswer,
  ScreeningQuestion,
  ScreeningQuestionKind,
} from "@/app/jobs/[id]/apply/types";

const KIND_ICON: Record<
  ScreeningQuestionKind,
  React.ComponentType<{ className?: string }>
> = {
  short_text: Type,
  long_text: AlignLeft,
  yes_no: ToggleLeft,
  single_select: CheckSquare,
  multi_select: ListChecks,
  number: Hash,
  scale: SlidersHorizontal,
};

const KIND_LABEL: Record<ScreeningQuestionKind, string> = {
  short_text: "Short text",
  long_text: "Long text",
  yes_no: "Yes / No",
  single_select: "Single choice",
  multi_select: "Multi choice",
  number: "Number",
  scale: "Scale",
};

function formatAnswer(
  question: ScreeningQuestion,
  answer: ExistingAnswer | null
): { display: string; missing: boolean } {
  if (!answer) return { display: "Not answered", missing: true };

  switch (question.kind) {
    case "short_text":
    case "long_text": {
      const v = (answer.answer_text ?? "").trim();
      if (!v) return { display: "Not answered", missing: true };
      return { display: v, missing: false };
    }
    case "yes_no": {
      const v = (answer.answer_choice ?? "").trim();
      if (v === "yes") return { display: "Yes", missing: false };
      if (v === "no") return { display: "No", missing: false };
      return { display: "Not answered", missing: true };
    }
    case "number": {
      if (answer.answer_number === null || answer.answer_number === undefined) {
        return { display: "Not answered", missing: true };
      }
      return { display: String(answer.answer_number), missing: false };
    }
    case "scale": {
      // #71 — slider answer (1–5); show the value with its end labels.
      if (answer.answer_number === null || answer.answer_number === undefined) {
        return { display: "Not answered", missing: true };
      }
      const low = question.options?.find((o) => o.id === "low")?.label;
      const high = question.options?.find((o) => o.id === "high")?.label;
      const ends = low && high ? ` (${low} → ${high})` : "";
      return { display: `${answer.answer_number} of 5${ends}`, missing: false };
    }
    case "single_select": {
      const id = answer.answer_choice;
      if (!id) return { display: "Not answered", missing: true };
      const opt = question.options?.find((o) => o.id === id);
      return { display: opt?.label ?? id, missing: false };
    }
    case "multi_select": {
      const ids = answer.answer_choices ?? [];
      if (ids.length === 0) return { display: "Not answered", missing: true };
      const labels = ids.map(
        (id) => question.options?.find((o) => o.id === id)?.label ?? id
      );
      return { display: labels.join(", "), missing: false };
    }
    default:
      return { display: "Not answered", missing: true };
  }
}

export function ScreeningResponseRow({
  question,
  answer,
}: {
  question: ScreeningQuestion;
  answer: ExistingAnswer | null;
}) {
  const Icon = KIND_ICON[question.kind] ?? Calendar;
  const { display, missing } = formatAnswer(question, answer);

  return (
    <div className="p-5">
      <div className="flex items-start gap-3">
        <Icon className="h-4 w-4 text-heritage-deep flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <div className="text-[14px] font-semibold text-ink leading-snug">
              {question.prompt}
            </div>
            <span className="text-[9px] font-bold tracking-[2px] uppercase text-slate-meta">
              {KIND_LABEL[question.kind]}
            </span>
            {question.required && (
              <span className="text-[9px] font-bold tracking-[2px] uppercase text-heritage-deep">
                Required
              </span>
            )}
          </div>
          {question.helper_text && (
            <div className="text-[13px] text-slate-meta mt-0.5 leading-snug">
              {question.helper_text}
            </div>
          )}
          <div
            className={`mt-2 text-[14px] leading-relaxed whitespace-pre-wrap ${
              missing ? "italic text-slate-meta" : "text-ink"
            }`}
          >
            {display}
          </div>
          {missing && question.required && (
            <div className="mt-1.5 text-[12px] font-bold tracking-[1px] uppercase text-danger">
              Required question — no response
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Verification row (5G.e Tier 2)
 *
 * One row per job verification requirement. Mirrors ScreeningResponseRow's
 * structure + the required-but-blank red-flag treatment: a required
 * verification the candidate did not attest to gets the same uppercase
 * red callout.
 * ───────────────────────────────────────────────────────────── */

export interface VerificationRowData {
  verificationType: string;
  label: string;
  required: boolean;
  attested: boolean;
  attestedAt: string | null;
  linkedCredentials: Array<{
    id: string;
    type: string;
    summary: string;
    linkable: boolean;
  }>;
  note: string | null;
}

function formatAttestedAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function VerificationRow({ row }: { row: VerificationRowData }) {
  const flagged = row.required && !row.attested;
  const attestedDate = formatAttestedAt(row.attestedAt);

  return (
    <div className="p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="h-4 w-4 text-heritage-deep flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <div className="text-[14px] font-semibold text-ink leading-snug">
              {row.label}
            </div>
            <span className="text-[9px] font-bold tracking-[2px] uppercase text-slate-meta">
              Verification
            </span>
            {row.required && (
              <span className="text-[9px] font-bold tracking-[2px] uppercase text-heritage-deep">
                Required
              </span>
            )}
          </div>

          {/* Attestation status */}
          <div
            className={`mt-2 text-[14px] leading-relaxed ${
              row.attested ? "text-ink" : "italic text-slate-meta"
            }`}
          >
            {row.attested ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-heritage-deep font-bold">✓</span>
                Candidate attested
                {attestedDate ? ` · ${attestedDate}` : ""}
              </span>
            ) : (
              "Candidate did not attest"
            )}
          </div>

          {/* Linked credential proof — 0..N (migration ...004). License /
              certification entries deep-link to their row in the
              Credentials section below, where the document + verify
              controls live; education stays plain text. */}
          {row.linkedCredentials.length > 0 && (
            <div className="mt-1.5 text-[13px] text-slate-body leading-snug">
              <span className="text-[9px] font-bold tracking-[2px] uppercase text-slate-meta mr-2">
                Linked proof
              </span>
              {row.linkedCredentials.map((c, i) => (
                <span key={`${c.type}-${c.id}`}>
                  {i > 0 && "; "}
                  {c.linkable ? (
                    <a
                      href={`#credential-${c.id}`}
                      className="text-heritage-deep underline underline-offset-2 hover:text-ink"
                    >
                      {c.summary}
                    </a>
                  ) : (
                    c.summary
                  )}
                </span>
              ))}
            </div>
          )}

          {/* Candidate note */}
          {row.note && (
            <div className="mt-1.5 text-[13px] text-slate-body leading-snug whitespace-pre-wrap">
              <span className="text-[9px] font-bold tracking-[2px] uppercase text-slate-meta mr-2">
                Note
              </span>
              {row.note}
            </div>
          )}

          {/* Required-but-not-attested red flag — mirrors the screening
              block's required-blank treatment. */}
          {flagged && (
            <div className="mt-1.5 text-[12px] font-bold tracking-[1px] uppercase text-danger">
              Required verification — not attested
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
