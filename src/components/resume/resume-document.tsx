/**
 * #87a — ATS-safe résumé template ("Classic").
 *
 * The FIRST of the planned ~5 templates (87c adds the gallery). All templates
 * are a PRESENTATION LAYER over the same `ResumeData` — switching templates
 * never touches content. ATS constraints (TASKS.md #87): single column, real
 * text (no images/sidebars/tables for layout), standard section headings.
 * Kept structurally conservative so another company's résumé scanner can read
 * it — the "use it to apply anywhere" promise depends on this.
 *
 * Pure presentational server component — no client state.
 */

import type { ReactNode } from "react";
import {
  type ResumeData,
  roleLabel,
  specialtyLabel,
  licenseTypeLabel,
  certKindLabel,
} from "@/lib/resume/resume-data";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2021-03-01" → "Mar 2021"; null → "". */
function monthYear(d: string | null): string {
  if (!d) return "";
  const [y, m] = d.split("-");
  const mi = Number(m) - 1;
  if (!y || mi < 0 || mi > 11) return y ?? "";
  return `${MONTHS[mi]} ${y}`;
}

function dateRange(start: string | null, end: string | null, isCurrent: boolean): string {
  const s = monthYear(start);
  const e = isCurrent ? "Present" : monthYear(end);
  if (s && e) return `${s} – ${e}`;
  return s || e || "";
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5 break-inside-avoid">
      <h2 className="mb-2 border-b border-black/30 pb-1 text-[11px] font-bold uppercase tracking-[1.5px] text-black">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function ResumeDocument({ data }: { data: ResumeData }) {
  const contact = [
    data.email,
    data.phone,
    [data.city, data.state].filter(Boolean).join(", ") || null,
    data.linkedinUrl,
  ].filter(Boolean) as string[];

  const roleLine = data.desiredRoles.map(roleLabel).filter(Boolean).join(" · ");
  const specialtyLine = data.specialties.map(specialtyLabel).filter(Boolean).join(", ");

  return (
    <article className="resume-sheet mx-auto max-w-[760px] bg-white px-12 py-10 text-[12.5px] leading-relaxed text-black">
      {/* Header */}
      <header className="mb-5">
        <h1 className="text-[26px] font-extrabold tracking-[-0.5px] text-black">
          {data.name || "Your Name"}
        </h1>
        {(data.headline || roleLine) && (
          <p className="mt-0.5 text-[13px] font-medium text-black/80">
            {data.headline || roleLine}
          </p>
        )}
        {contact.length > 0 && (
          <p className="mt-2 text-[11.5px] text-black/70">
            {contact.join("  ·  ")}
          </p>
        )}
      </header>

      {data.summary && data.summary.trim() && (
        <Section title="Summary">
          <p className="whitespace-pre-line text-black/90">{data.summary.trim()}</p>
        </Section>
      )}

      {data.work.length > 0 && (
        <Section title="Experience">
          <div className="space-y-3">
            {data.work.map((w) => {
              const range = dateRange(w.start, w.end, w.isCurrent);
              return (
                <div key={w.id} className="break-inside-avoid">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-bold text-black">
                      {w.title}
                      {w.company ? ` — ${w.company}` : ""}
                    </span>
                    {range && (
                      <span className="shrink-0 text-[11px] text-black/60">{range}</span>
                    )}
                  </div>
                  {w.description && w.description.trim() && (
                    <p className="mt-0.5 whitespace-pre-line text-black/85">
                      {w.description.trim()}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {data.education.length > 0 && (
        <Section title="Education">
          <div className="space-y-2">
            {data.education.map((e) => {
              const years = [e.startYear, e.endYear].filter(Boolean).join(" – ");
              const deg = [e.degree, e.field].filter(Boolean).join(", ");
              return (
                <div key={e.id} className="break-inside-avoid">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-bold text-black">{e.school}</span>
                    {years && (
                      <span className="shrink-0 text-[11px] text-black/60">{years}</span>
                    )}
                  </div>
                  {deg && <p className="text-black/85">{deg}</p>}
                  {e.description && e.description.trim() && (
                    <p className="mt-0.5 whitespace-pre-line text-black/85">
                      {e.description.trim()}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {(data.licenses.length > 0 || data.certifications.length > 0) && (
        <Section title="Licenses & Certifications">
          <ul className="space-y-1">
            {data.licenses.map((l) => {
              const exp = l.expires ? ` (exp. ${monthYear(l.expires)})` : "";
              const num = l.displayNumber && l.number ? ` #${l.number}` : "";
              const state = l.state ? ` — ${l.state}` : "";
              return (
                <li key={l.id} className="text-black/90">
                  {licenseTypeLabel(l.type)}
                  {state}
                  {num}
                  {exp}
                </li>
              );
            })}
            {data.certifications.map((ce) => {
              const exp = ce.expires ? ` (exp. ${monthYear(ce.expires)})` : "";
              const lvl = ce.level ? ` — ${ce.level}` : "";
              return (
                <li key={ce.id} className="text-black/90">
                  {certKindLabel(ce.kind)}
                  {lvl}
                  {exp}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {data.skills.length > 0 && (
        <Section title="Skills">
          <p className="text-black/90">{data.skills.join("  ·  ")}</p>
        </Section>
      )}

      {(data.pmsSystems.length > 0 ||
        data.languages.length > 0 ||
        specialtyLine) && (
        <Section title="Additional">
          {specialtyLine && (
            <p className="text-black/90">
              <span className="font-semibold">Specialties:</span> {specialtyLine}
            </p>
          )}
          {data.pmsSystems.length > 0 && (
            <p className="text-black/90">
              <span className="font-semibold">Practice management systems:</span>{" "}
              {data.pmsSystems.join(", ")}
            </p>
          )}
          {data.languages.length > 0 && (
            <p className="text-black/90">
              <span className="font-semibold">Languages:</span>{" "}
              {data.languages.join(", ")}
            </p>
          )}
        </Section>
      )}
    </article>
  );
}
