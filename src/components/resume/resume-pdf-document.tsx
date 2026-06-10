/**
 * #87b — @react-pdf/renderer version of the "Classic" résumé template.
 *
 * Server-rendered to a real PDF buffer (see /candidate/resume/pdf/route.ts and
 * saveResumePdf). Same content + ATS-safe structure as the on-screen
 * ResumeDocument, expressed in @react-pdf primitives. Uses the built-in
 * Helvetica family (no font hosting, always real selectable text).
 *
 * Keep this in sync with components/resume/resume-document.tsx (the HTML
 * preview) — they render the same ResumeData.
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

const styles = StyleSheet.create({
  page: {
    paddingVertical: 44,
    paddingHorizontal: 50,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111111",
    lineHeight: 1.4,
  },
  name: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#000000" },
  headline: { fontSize: 11, marginTop: 2, color: "#333333" },
  contact: { fontSize: 9, marginTop: 6, color: "#555555" },
  section: { marginTop: 14 },
  h2: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#000000",
    textTransform: "uppercase",
    letterSpacing: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: "#999999",
    paddingBottom: 3,
    marginBottom: 6,
  },
  item: { marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  bold: { fontFamily: "Helvetica-Bold", color: "#000000" },
  meta: { fontSize: 9, color: "#666666" },
  body: { color: "#222222", marginTop: 2 },
  li: { color: "#222222", marginBottom: 2 },
  kv: { color: "#222222", marginBottom: 2 },
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.h2}>{title}</Text>
      {children}
    </View>
  );
}

export function ResumePdfDocument({ data }: { data: ResumeData }) {
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
        {/* Header */}
        <View>
          <Text style={styles.name}>{data.name || "Your Name"}</Text>
          {(data.headline || roleLine) && (
            <Text style={styles.headline}>{data.headline || roleLine}</Text>
          )}
          {contact.length > 0 && (
            <Text style={styles.contact}>{contact.join("   ·   ")}</Text>
          )}
        </View>

        {data.summary && data.summary.trim() && (
          <Section title="Summary">
            <Text style={styles.body}>{data.summary.trim()}</Text>
          </Section>
        )}

        {data.work.length > 0 && (
          <Section title="Experience">
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
          <Section title="Education">
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
          <Section title="Licenses & Certifications">
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
          <Section title="Skills">
            <Text style={styles.body}>{data.skills.join("   ·   ")}</Text>
          </Section>
        )}

        {hasAdditional && (
          <Section title="Additional">
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
 * Render the résumé to a PDF buffer. The cast bridges @react-pdf's
 * `renderToBuffer` type (it wants a `<Document>` element) and our wrapping
 * component element — the component renders a Document at runtime, so this is
 * type-only. Both the download route and saveResumePdf use this.
 */
export async function renderResumePdfBuffer(data: ResumeData): Promise<Buffer> {
  const element = createElement(ResumePdfDocument, { data }) as unknown as Parameters<
    typeof renderToBuffer
  >[0];
  return renderToBuffer(element);
}
