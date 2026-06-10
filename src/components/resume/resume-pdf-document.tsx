/**
 * #87b/#87c — @react-pdf render of the résumé, template-driven.
 *
 * Mirrors resume-document.tsx (the on-screen preview) using the same template
 * tokens (resume-templates.ts), so the PDF and the preview match. Built-in
 * faces only — sans → Helvetica, serif → Times-Roman — so it's ATS-safe with
 * no fonts to host. Single column, real text, standard headings throughout.
 */

import { createElement, type ReactNode } from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
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

function faces(family: ResumeTemplate["family"]) {
  return family === "serif"
    ? { regular: "Times-Roman", bold: "Times-Bold" }
    : { regular: "Helvetica", bold: "Helvetica-Bold" };
}

function buildStyles(t: ResumeTemplate) {
  const f = faces(t.family);
  return StyleSheet.create({
    page: {
      paddingVertical: 44,
      paddingHorizontal: 50,
      fontSize: t.bodySizePt,
      fontFamily: f.regular,
      color: "#1a1a1a",
      lineHeight: 1.45,
    },
    header: {
      textAlign: t.nameAlign,
      paddingBottom: t.headerRule ? 8 : 0,
      borderBottomWidth: t.headerRule ? 1.5 : 0,
      borderBottomColor: t.ruleHex,
    },
    name: {
      fontSize: t.nameSizePt,
      fontFamily: f.bold,
      color: t.nameAccent ? t.accentHex : "#000000",
      textAlign: t.nameAlign,
    },
    headline: {
      fontSize: t.bodySizePt + 1,
      marginTop: 2,
      color: "#333333",
      textAlign: t.nameAlign,
    },
    contact: { fontSize: 8.5, marginTop: 6, color: "#444444", textAlign: t.nameAlign },
    section: { marginTop: t.sectionGapPt },
    h2: {
      fontSize: 9,
      fontFamily: f.bold,
      color: t.headingAccent ? t.accentHex : "#000000",
      textTransform: t.headingTransform,
      letterSpacing: t.headingLetterSpacing,
      borderBottomWidth: t.headingRule === "full" ? 0.5 : 0,
      borderBottomColor: t.ruleHex,
      paddingBottom: t.headingRule === "full" ? 3 : 0,
      marginBottom: 6,
    },
    item: { marginBottom: 8 },
    row: { flexDirection: "row", justifyContent: "space-between" },
    bold: { fontFamily: f.bold, color: "#000000" },
    meta: { fontSize: 8.5, color: "#666666" },
    body: { color: "#222222", marginTop: 2 },
    li: { color: "#222222", marginBottom: 2 },
    kv: { color: "#222222", marginBottom: 2 },
  });
}

function Section({
  title,
  styles,
  children,
}: {
  title: string;
  styles: ReturnType<typeof buildStyles>;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.h2}>{title}</Text>
      {children}
    </View>
  );
}

export function ResumePdfDocument({
  data,
  template,
}: {
  data: ResumeData;
  template?: ResumeTemplateId;
}) {
  const t = getResumeTemplate(template);
  const styles = buildStyles(t);

  const contact = [
    data.email,
    data.phone,
    [data.city, data.state].filter(Boolean).join(", ") || null,
    data.linkedinUrl,
  ].filter(Boolean) as string[];

  const roleLine = data.desiredRoles.map(roleLabel).filter(Boolean).join("  ·  ");
  const specialtyLine = data.specialties.map(specialtyLabel).filter(Boolean).join(", ");
  const hasAdditional =
    data.pmsSystems.length > 0 || data.languages.length > 0 || Boolean(specialtyLine);

  return (
    <Document title={`${data.name || "Résumé"} — Résumé`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.name}>{data.name || "Your Name"}</Text>
          {(data.headline || roleLine) && (
            <Text style={styles.headline}>{data.headline || roleLine}</Text>
          )}
          {contact.length > 0 && (
            <Text style={styles.contact}>{contact.join("   ·   ")}</Text>
          )}
        </View>

        {data.summary && data.summary.trim() && (
          <Section title="Summary" styles={styles}>
            <Text style={styles.body}>{data.summary.trim()}</Text>
          </Section>
        )}

        {data.work.length > 0 && (
          <Section title="Experience" styles={styles}>
            {data.work.map((w) => {
              const range = dateRange(w.start, w.end, w.isCurrent);
              return (
                <View key={w.id} style={styles.item} wrap={false}>
                  <View style={styles.row}>
                    <Text style={styles.bold}>
                      {w.title}
                      {w.company ? ` — ${w.company}` : ""}
                    </Text>
                    {range ? <Text style={styles.meta}>{range}</Text> : null}
                  </View>
                  {w.description && w.description.trim() ? (
                    <Text style={styles.body}>{w.description.trim()}</Text>
                  ) : null}
                </View>
              );
            })}
          </Section>
        )}

        {data.education.length > 0 && (
          <Section title="Education" styles={styles}>
            {data.education.map((e) => {
              const years = [e.startYear, e.endYear].filter(Boolean).join(" – ");
              const deg = [e.degree, e.field].filter(Boolean).join(", ");
              return (
                <View key={e.id} style={styles.item} wrap={false}>
                  <View style={styles.row}>
                    <Text style={styles.bold}>{e.school}</Text>
                    {years ? <Text style={styles.meta}>{years}</Text> : null}
                  </View>
                  {deg ? <Text style={styles.body}>{deg}</Text> : null}
                  {e.description && e.description.trim() ? (
                    <Text style={styles.body}>{e.description.trim()}</Text>
                  ) : null}
                </View>
              );
            })}
          </Section>
        )}

        {(data.licenses.length > 0 || data.certifications.length > 0) && (
          <Section title="Licenses & Certifications" styles={styles}>
            {data.licenses.map((l) => {
              const exp = l.expires ? ` (exp. ${monthYear(l.expires)})` : "";
              const num = l.displayNumber && l.number ? ` #${l.number}` : "";
              const state = l.state ? ` — ${l.state}` : "";
              return (
                <Text key={l.id} style={styles.li}>
                  {licenseTypeLabel(l.type)}
                  {state}
                  {num}
                  {exp}
                </Text>
              );
            })}
            {data.certifications.map((ce) => {
              const exp = ce.expires ? ` (exp. ${monthYear(ce.expires)})` : "";
              const lvl = ce.level ? ` — ${ce.level}` : "";
              return (
                <Text key={ce.id} style={styles.li}>
                  {certKindLabel(ce.kind)}
                  {lvl}
                  {exp}
                </Text>
              );
            })}
          </Section>
        )}

        {data.skills.length > 0 && (
          <Section title="Skills" styles={styles}>
            <Text style={styles.body}>{data.skills.join("   ·   ")}</Text>
          </Section>
        )}

        {hasAdditional && (
          <Section title="Additional" styles={styles}>
            {specialtyLine ? (
              <Text style={styles.kv}>
                <Text style={styles.bold}>Specialties: </Text>
                {specialtyLine}
              </Text>
            ) : null}
            {data.pmsSystems.length > 0 ? (
              <Text style={styles.kv}>
                <Text style={styles.bold}>Practice management systems: </Text>
                {data.pmsSystems.join(", ")}
              </Text>
            ) : null}
            {data.languages.length > 0 ? (
              <Text style={styles.kv}>
                <Text style={styles.bold}>Languages: </Text>
                {data.languages.join(", ")}
              </Text>
            ) : null}
          </Section>
        )}
      </Page>
    </Document>
  );
}

/**
 * Render the résumé to a PDF buffer with the chosen template. The cast bridges
 * @react-pdf's renderToBuffer type (it wants a Document element) and our
 * wrapping component — type-only; the component renders a Document at runtime.
 */
export async function renderResumePdfBuffer(
  data: ResumeData,
  template?: ResumeTemplateId
): Promise<Buffer> {
  const element = createElement(ResumePdfDocument, { data, template }) as unknown as Parameters<
    typeof renderToBuffer
  >[0];
  return renderToBuffer(element);
}
