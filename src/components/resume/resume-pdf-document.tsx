/**
 * #87 — @react-pdf render of the résumé. Template-driven, section-ordered,
 * with bullet lists and user custom sections. Mirrors resume-document.tsx
 * using the same tokens, so the PDF and the on-screen preview match. Built-in
 * faces only (sans → Helvetica, serif → Times-Roman) → ATS-safe, no font
 * hosting. Single column, real text, standard headings throughout.
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
  type ResumeSectionKey,
  roleLabel,
  specialtyLabel,
  licenseTypeLabel,
  certKindLabel,
  monthYear,
  dateRange,
  toBullets,
  orderedMainSections,
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
    headline: { fontSize: t.bodySizePt + 1, marginTop: 2, color: "#333333", textAlign: t.nameAlign },
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
    bullet: { color: "#222222", marginTop: 1, paddingLeft: 8 },
    li: { color: "#222222", marginBottom: 2 },
    kv: { color: "#222222", marginBottom: 2 },
  });
}

type Styles = ReturnType<typeof buildStyles>;

function Section({
  title,
  styles,
  children,
}: {
  title: string;
  styles: Styles;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.h2}>{title}</Text>
      {children}
    </View>
  );
}

function PdfBody({ text, styles }: { text: string | null; styles: Styles }) {
  const bullets = toBullets(text);
  if (bullets.length === 0) return null;
  if (bullets.length === 1) return <Text style={styles.body}>{bullets[0]}</Text>;
  return (
    <View style={{ marginTop: 2 }}>
      {bullets.map((b, i) => (
        <Text key={i} style={styles.bullet}>{`•  ${b}`}</Text>
      ))}
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

  function renderMain(key: ResumeSectionKey): ReactNode {
    switch (key) {
      case "summary":
        return data.summary && data.summary.trim() ? (
          <Section key={key} title="Summary" styles={styles}>
            <Text style={styles.body}>{data.summary.trim()}</Text>
          </Section>
        ) : null;
      case "experience":
        return data.work.length > 0 ? (
          <Section key={key} title="Experience" styles={styles}>
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
                  <PdfBody text={w.description} styles={styles} />
                </View>
              );
            })}
          </Section>
        ) : null;
      case "education":
        return data.education.length > 0 ? (
          <Section key={key} title="Education" styles={styles}>
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
                  <PdfBody text={e.description} styles={styles} />
                </View>
              );
            })}
          </Section>
        ) : null;
      case "credentials":
        return data.licenses.length > 0 || data.certifications.length > 0 ? (
          <Section key={key} title="Licenses & Certifications" styles={styles}>
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
        ) : null;
      case "skills":
        return data.skills.length > 0 ? (
          <Section key={key} title="Skills" styles={styles}>
            <Text style={styles.body}>{data.skills.join("   ·   ")}</Text>
          </Section>
        ) : null;
      case "additional": {
        const hasAdditional =
          data.pmsSystems.length > 0 || data.languages.length > 0 || Boolean(specialtyLine);
        return hasAdditional ? (
          <Section key={key} title="Additional" styles={styles}>
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
        ) : null;
      }
      default:
        return null;
    }
  }

  const customSections = data.customSections.filter((s) => s.title.trim());

  return (
    <Document title={`${data.name || "Résumé"} — Résumé`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.name}>{data.name || "Your Name"}</Text>
          {(data.headline || roleLine) && (
            <Text style={styles.headline}>{data.headline || roleLine}</Text>
          )}
          {contact.length > 0 && <Text style={styles.contact}>{contact.join("   ·   ")}</Text>}
        </View>

        {orderedMainSections(data.sectionOrder).map((k) => renderMain(k))}

        {customSections.map((s, i) => {
          const range = dateRange(s.dateStart, s.dateEnd, false);
          return (
            <Section key={`custom-${i}`} title={s.title} styles={styles}>
              {range ? <Text style={styles.meta}>{range}</Text> : null}
              <PdfBody text={s.body} styles={styles} />
            </Section>
          );
        })}
      </Page>
    </Document>
  );
}

/**
 * Render the résumé to a PDF buffer with the chosen template. The cast bridges
 * @react-pdf's renderToBuffer type and our wrapping component — type-only.
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
