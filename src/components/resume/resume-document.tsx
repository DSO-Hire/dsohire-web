/**
 * #87a/#87c — on-screen résumé render, template-driven.
 *
 * A presentation layer over ResumeData. Styling comes entirely from the
 * selected template's tokens (resume-templates.ts), so every template stays
 * single-column / real-text / standard-headings (ATS-safe) and only the
 * typography, spacing, color, and heading treatment change. Pure component —
 * renders on server (résumé page) and client (builder live preview) alike.
 *
 * Keep in sync with resume-pdf-document.tsx (the PDF render of the same data).
 */

import type { CSSProperties, ReactNode } from "react";
import {
  type ResumeData,
  roleLabel,
  specialtyLabel,
  licenseTypeLabel,
  certKindLabel,
  monthYear,
  dateRange,
} from "@/lib/resume/resume-format";
import {
  getResumeTemplate,
  type ResumeTemplate,
  type ResumeTemplateId,
} from "@/lib/resume/resume-templates";

const px = (pt: number): string => `${(pt * 1.333).toFixed(1)}px`;

function fontStack(family: ResumeTemplate["family"]): string {
  return family === "serif"
    ? 'Georgia, "Times New Roman", Times, serif'
    : 'Arial, Helvetica, "Helvetica Neue", sans-serif';
}

function Section({
  title,
  t,
  children,
}: {
  title: string;
  t: ResumeTemplate;
  children: ReactNode;
}) {
  const h2: CSSProperties = {
    fontSize: px(9),
    fontWeight: 700,
    textTransform: t.headingTransform,
    letterSpacing: `${t.headingLetterSpacing}px`,
    color: t.headingAccent ? t.accentHex : "#000000",
    paddingBottom: t.headingRule === "full" ? "3px" : 0,
    borderBottom: t.headingRule === "full" ? `1px solid ${t.ruleHex}` : "none",
    marginBottom: "6px",
  };
  return (
    <section style={{ marginTop: px(t.sectionGapPt) }} className="break-inside-avoid">
      <h2 style={h2}>{title}</h2>
      {children}
    </section>
  );
}

export function ResumeDocument({
  data,
  template,
}: {
  data: ResumeData;
  template?: ResumeTemplateId;
}) {
  const t = getResumeTemplate(template);

  const contact = [
    data.email,
    data.phone,
    [data.city, data.state].filter(Boolean).join(", ") || null,
    data.linkedinUrl,
  ].filter(Boolean) as string[];

  const roleLine = data.desiredRoles.map(roleLabel).filter(Boolean).join(" · ");
  const specialtyLine = data.specialties.map(specialtyLabel).filter(Boolean).join(", ");

  const sheet: CSSProperties = {
    fontFamily: fontStack(t.family),
    fontSize: px(t.bodySizePt),
    lineHeight: 1.45,
    color: "#1a1a1a",
  };
  const nameStyle: CSSProperties = {
    fontSize: px(t.nameSizePt),
    fontWeight: 800,
    letterSpacing: "-0.3px",
    textAlign: t.nameAlign,
    color: t.nameAccent ? t.accentHex : "#000000",
  };
  const headerStyle: CSSProperties = {
    textAlign: t.nameAlign,
    paddingBottom: t.headerRule ? px(8) : 0,
    borderBottom: t.headerRule ? `2px solid ${t.ruleHex}` : "none",
  };
  const metaStyle: CSSProperties = { color: "#444444", fontSize: px(8.5) };

  return (
    <article className="resume-sheet mx-auto max-w-[760px] bg-white px-12 py-10" style={sheet}>
      <header style={headerStyle}>
        <div style={nameStyle}>{data.name || "Your Name"}</div>
        {(data.headline || roleLine) && (
          <p style={{ marginTop: "2px", fontSize: px(t.bodySizePt + 1), color: "#333333", textAlign: t.nameAlign }}>
            {data.headline || roleLine}
          </p>
        )}
        {contact.length > 0 && (
          <p style={{ marginTop: "6px", ...metaStyle, textAlign: t.nameAlign }}>
            {contact.join("   ·   ")}
          </p>
        )}
      </header>

      {data.summary && data.summary.trim() && (
        <Section title="Summary" t={t}>
          <p style={{ whiteSpace: "pre-line", color: "#222222" }}>{data.summary.trim()}</p>
        </Section>
      )}

      {data.work.length > 0 && (
        <Section title="Experience" t={t}>
          <div className="space-y-3">
            {data.work.map((w) => {
              const range = dateRange(w.start, w.end, w.isCurrent);
              return (
                <div key={w.id} className="break-inside-avoid">
                  <div className="flex items-baseline justify-between gap-4">
                    <span style={{ fontWeight: 700, color: "#000000" }}>
                      {w.title}
                      {w.company ? ` — ${w.company}` : ""}
                    </span>
                    {range && <span style={metaStyle}>{range}</span>}
                  </div>
                  {w.description && w.description.trim() && (
                    <p style={{ whiteSpace: "pre-line", color: "#222222", marginTop: "2px" }}>
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
        <Section title="Education" t={t}>
          <div className="space-y-2">
            {data.education.map((e) => {
              const years = [e.startYear, e.endYear].filter(Boolean).join(" – ");
              const deg = [e.degree, e.field].filter(Boolean).join(", ");
              return (
                <div key={e.id} className="break-inside-avoid">
                  <div className="flex items-baseline justify-between gap-4">
                    <span style={{ fontWeight: 700, color: "#000000" }}>{e.school}</span>
                    {years && <span style={metaStyle}>{years}</span>}
                  </div>
                  {deg && <p style={{ color: "#222222" }}>{deg}</p>}
                  {e.description && e.description.trim() && (
                    <p style={{ whiteSpace: "pre-line", color: "#222222", marginTop: "2px" }}>
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
        <Section title="Licenses & Certifications" t={t}>
          <ul className="space-y-1">
            {data.licenses.map((l) => {
              const exp = l.expires ? ` (exp. ${monthYear(l.expires)})` : "";
              const num = l.displayNumber && l.number ? ` #${l.number}` : "";
              const state = l.state ? ` — ${l.state}` : "";
              return (
                <li key={l.id} style={{ color: "#222222" }}>
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
                <li key={ce.id} style={{ color: "#222222" }}>
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
        <Section title="Skills" t={t}>
          <p style={{ color: "#222222" }}>{data.skills.join("   ·   ")}</p>
        </Section>
      )}

      {(data.pmsSystems.length > 0 || data.languages.length > 0 || specialtyLine) && (
        <Section title="Additional" t={t}>
          {specialtyLine && (
            <p style={{ color: "#222222" }}>
              <span style={{ fontWeight: 700 }}>Specialties:</span> {specialtyLine}
            </p>
          )}
          {data.pmsSystems.length > 0 && (
            <p style={{ color: "#222222" }}>
              <span style={{ fontWeight: 700 }}>Practice management systems:</span>{" "}
              {data.pmsSystems.join(", ")}
            </p>
          )}
          {data.languages.length > 0 && (
            <p style={{ color: "#222222" }}>
              <span style={{ fontWeight: 700 }}>Languages:</span> {data.languages.join(", ")}
            </p>
          )}
        </Section>
      )}
    </article>
  );
}
