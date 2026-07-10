/**
 * <ResumeExtractPanel/> — the employer-facing "AI-read resume" snapshot
 * (parse-on-apply, 2026-07-10). Renders the extraction stored on the
 * APPLICATION row by src/lib/resume/parse-on-apply.ts.
 *
 * Honesty rules:
 *   • Always labeled machine-extracted + unverified — this is the model's
 *     read of the file, not candidate-confirmed data (R8: it never flows
 *     into the candidate profile).
 *   • Low-confidence fields carry a visible "low confidence" tag.
 *   • License NUMBERS are never rendered (locked rule R3 parity with the
 *     candidate profile: numbers stay hidden unless the candidate opts in).
 *   • Failed parses render the honest error state, not silence.
 *   • status null (applications that predate the feature) renders nothing.
 *
 * Defensive by design: the payload is jsonb from the DB — every accessor
 * tolerates missing/misshapen keys rather than trusting ParsedResume.
 */

import { Eyebrow } from "@/components/brand/eyebrow";
import { Sparkles } from "lucide-react";

interface Field {
  value: unknown;
  confidence?: string;
}

function field(x: unknown): Field {
  if (typeof x === "object" && x !== null && "value" in (x as object)) {
    return x as Field;
  }
  return { value: x ?? null };
}

function str(x: unknown): string | null {
  const v = field(x).value;
  return typeof v === "string" && v.trim() ? v : null;
}

function num(x: unknown): number | null {
  const v = field(x).value;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function lowConfidence(x: unknown): boolean {
  return field(x).confidence === "low";
}

function arr(x: unknown): Array<Record<string, unknown>> {
  return Array.isArray(x)
    ? (x.filter(
        (e) => typeof e === "object" && e !== null
      ) as Array<Record<string, unknown>>)
    : [];
}

function strArr(x: unknown): string[] {
  const v = field(x).value ?? x;
  return Array.isArray(v)
    ? v.filter((s): s is string => typeof s === "string" && s.trim() !== "")
    : [];
}

const FAILURE_COPY: Record<string, string> = {
  // Scanned PDFs get a visual (OCR) read automatically — this state now
  // only renders when BOTH the text extraction and the visual read failed.
  empty_text:
    "This file has no extractable text, and the visual read couldn't parse it either. Open the original above.",
  format_unsupported:
    "This file format can't be machine-read. Open the original above.",
  download_failed: "The resume file couldn't be retrieved for extraction.",
  no_resume: "No resume file was attached to this application.",
};

export function ResumeExtractPanel({
  status,
  parse,
}: {
  status: string | null;
  parse: unknown;
}) {
  // Applications that predate parse-on-apply have no snapshot — stay quiet.
  if (!status) return null;

  const header = (
    <div className="flex items-center gap-2 mb-3">
      <Sparkles className="h-3.5 w-3.5 text-heritage-deep" aria-hidden />
      <Eyebrow as="span">AI-read resume · unverified</Eyebrow>
    </div>
  );

  if (status !== "ok") {
    const p = (parse ?? {}) as Record<string, unknown>;
    const kind = typeof p.error_kind === "string" ? p.error_kind : "unknown";
    return (
      <div className="mt-4 border border-[var(--rule)] bg-cream/40 p-5">
        {header}
        <p className="text-xs text-slate-body leading-relaxed">
          {FAILURE_COPY[kind] ??
            "We couldn't machine-read this resume. Open the original file above."}
        </p>
      </div>
    );
  }

  const p = (parse ?? {}) as Record<string, unknown>;
  const basics = (p.basics ?? {}) as Record<string, unknown>;
  const summary = str(basics.summary) ?? str(basics.headline);
  const years = num(basics.years_experience_dental);
  const licenses = arr(p.licenses);
  const certifications = arr(p.certifications);
  const work = arr(p.work_history);
  const skills = strArr(p.skills);
  const pms = Array.from(
    new Set(work.flatMap((w) => strArr(w.pms_systems_used)))
  );

  const hasAnything =
    summary ||
    years !== null ||
    licenses.length > 0 ||
    certifications.length > 0 ||
    work.length > 0 ||
    skills.length > 0;
  if (!hasAnything) {
    return (
      <div className="mt-4 border border-[var(--rule)] bg-cream/40 p-5">
        {header}
        <p className="text-xs text-slate-body leading-relaxed">
          The file was read, but nothing structured could be extracted.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 border border-[var(--rule)] bg-cream/40 p-5">
      {header}
      <p className="text-2xs text-slate-meta mb-4 leading-relaxed">
        Extracted from the uploaded file by AI — not confirmed by the
        candidate. Verify anything load-bearing against the original above.
      </p>

      <div className="space-y-4">
        {summary && (
          <p className="text-sm text-ink leading-relaxed">{summary}</p>
        )}

        {(years !== null || licenses.length > 0 || certifications.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {years !== null && (
              <span className="px-2.5 py-1 text-xs font-semibold border border-[var(--rule)] bg-card text-ink tabular">
                {years} yr{years === 1 ? "" : "s"} dental
                {lowConfidence(basics.years_experience_dental) && (
                  <span className="ml-1.5 font-normal text-slate-meta">
                    · low confidence
                  </span>
                )}
              </span>
            )}
            {licenses.map((l, i) => {
              const type = str(l.license_type);
              if (!type) return null;
              const state = str(l.state);
              const expires = str(l.expires_date);
              return (
                <span
                  key={`lic-${i}`}
                  className="px-2.5 py-1 text-xs font-semibold border border-heritage/40 bg-heritage/10 text-heritage-deep"
                >
                  {type}
                  {state ? ` · ${state}` : ""}
                  {expires ? ` · exp ${expires}` : ""}
                  {lowConfidence(l.license_type) && (
                    <span className="ml-1.5 font-normal text-slate-meta">
                      · low confidence
                    </span>
                  )}
                </span>
              );
            })}
            {certifications.map((c, i) => {
              const kind = str(c.kind);
              if (!kind) return null;
              return (
                <span
                  key={`cert-${i}`}
                  className="px-2.5 py-1 text-xs font-medium border border-[var(--rule)] bg-card text-ink"
                >
                  {kind.replace(/_/g, " ")}
                  {lowConfidence(c.kind) && (
                    <span className="ml-1.5 text-slate-meta">
                      · low confidence
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {work.length > 0 && (
          <div>
            <Eyebrow className="mb-2">Work history</Eyebrow>
            <ul className="space-y-1.5">
              {work.slice(0, 6).map((w, i) => {
                const title = str(w.title);
                const company = str(w.company_name);
                if (!title && !company) return null;
                const start = str(w.start_date);
                const end =
                  field(w.is_current).value === true
                    ? "present"
                    : str(w.end_date);
                return (
                  <li key={`wh-${i}`} className="text-xs text-ink">
                    <span className="font-semibold">{title ?? "Role"}</span>
                    {company && (
                      <span className="text-slate-body"> · {company}</span>
                    )}
                    {(start || end) && (
                      <span className="text-slate-meta tabular">
                        {" "}
                        · {start ?? "?"} → {end ?? "?"}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {work.length > 6 && (
              <p className="mt-1.5 text-2xs text-slate-meta">
                + {work.length - 6} earlier{" "}
                {work.length - 6 === 1 ? "role" : "roles"} in the original file
              </p>
            )}
          </div>
        )}

        {(pms.length > 0 || skills.length > 0) && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            {pms.length > 0 && (
              <span className="text-slate-body">
                <span className="font-semibold text-ink">PMS:</span>{" "}
                {pms.join(", ")}
              </span>
            )}
            {skills.length > 0 && (
              <span className="text-slate-body">
                <span className="font-semibold text-ink">Skills:</span>{" "}
                {skills.slice(0, 12).join(", ")}
                {skills.length > 12 ? ", …" : ""}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
