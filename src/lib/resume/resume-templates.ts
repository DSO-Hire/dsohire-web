/**
 * #87c — résumé template registry.
 *
 * A template is a PRESENTATION LAYER over the same ResumeData — switching one
 * never touches content (TASKS.md #87). Every template here is single-column,
 * real text, standard section headings, and a web-safe font family, so all of
 * them stay ATS-safe (the "use it to apply anywhere" promise). They differ
 * ONLY in typography, spacing, color accent, and heading treatment.
 *
 * Tokens are primitives so BOTH renderers consume them: the on-screen HTML
 * preview (resume-document.tsx) and the @react-pdf PDF (resume-pdf-document.tsx).
 * Font families map to built-in, ATS-safe faces — sans → Helvetica/Arial,
 * serif → Times/Georgia — so there are no fonts to host.
 *
 * Palette follows the 2026 "restrained accent" consensus: navy, slate, teal.
 */

export type ResumeTemplateId =
  | "classic"
  | "modern"
  | "executive"
  | "minimal"
  | "compact"
  | "accent";

export type ResumeTemplate = {
  id: ResumeTemplateId;
  name: string;
  blurb: string;
  /** Maps to Helvetica (sans) or Times-Roman (serif) in PDF; web-safe stack in HTML. */
  family: "sans" | "serif";
  nameAlign: "left" | "center";
  /** Name size in PDF points (HTML scales ~1.33×). */
  nameSizePt: number;
  /** Render the name in the accent color. */
  nameAccent: boolean;
  /** A thin rule under the whole header (name + contact) block. */
  headerRule: boolean;
  headingTransform: "uppercase" | "none";
  /** Letter-spacing for section headings, in PDF points. */
  headingLetterSpacing: number;
  /** Color the section heading text with the accent. */
  headingAccent: boolean;
  /** Divider under each section heading. */
  headingRule: "full" | "none";
  accentHex: string;
  ruleHex: string;
  bodySizePt: number;
  /** Vertical gap above each section, in PDF points. */
  sectionGapPt: number;
};

export const RESUME_TEMPLATES: Record<ResumeTemplateId, ResumeTemplate> = {
  accent: {
    id: "accent",
    name: "Accent",
    blurb: "A teal pop on the name & headings. Distinctive but parser-safe.",
    family: "sans",
    nameAlign: "left",
    nameSizePt: 24,
    nameAccent: true,
    headerRule: true,
    headingTransform: "uppercase",
    headingLetterSpacing: 1.5,
    headingAccent: true,
    headingRule: "full",
    accentHex: "#0F766E",
    ruleHex: "#0F766E",
    bodySizePt: 10,
    sectionGapPt: 16,
  },
  classic: {
    id: "classic",
    name: "Classic",
    blurb: "Traditional serif, centered name. Timeless and conservative.",
    family: "serif",
    nameAlign: "center",
    nameSizePt: 24,
    nameAccent: false,
    headerRule: true,
    headingTransform: "uppercase",
    headingLetterSpacing: 1.2,
    headingAccent: false,
    headingRule: "full",
    accentHex: "#111111",
    ruleHex: "#444444",
    bodySizePt: 10.5,
    sectionGapPt: 14,
  },
  modern: {
    id: "modern",
    name: "Modern",
    blurb: "Clean sans with a navy accent. Current and confident.",
    family: "sans",
    nameAlign: "left",
    nameSizePt: 24,
    nameAccent: false,
    headerRule: true,
    headingTransform: "uppercase",
    headingLetterSpacing: 1.5,
    headingAccent: true,
    headingRule: "full",
    accentHex: "#1F3A5F",
    ruleHex: "#1F3A5F",
    bodySizePt: 10,
    sectionGapPt: 16,
  },
  executive: {
    id: "executive",
    name: "Executive",
    blurb: "Refined serif with slate accents. Suits senior & corporate roles.",
    family: "serif",
    nameAlign: "left",
    nameSizePt: 23,
    nameAccent: false,
    headerRule: true,
    headingTransform: "uppercase",
    headingLetterSpacing: 1.2,
    headingAccent: true,
    headingRule: "full",
    accentHex: "#334155",
    ruleHex: "#94A3B8",
    bodySizePt: 10.5,
    sectionGapPt: 14,
  },
  minimal: {
    id: "minimal",
    name: "Minimal",
    blurb: "Understated sans, no rules — headings carried by weight & space.",
    family: "sans",
    nameAlign: "left",
    nameSizePt: 22,
    nameAccent: false,
    headerRule: false,
    headingTransform: "uppercase",
    headingLetterSpacing: 2,
    headingAccent: false,
    headingRule: "none",
    accentHex: "#111111",
    ruleHex: "#CCCCCC",
    bodySizePt: 10,
    sectionGapPt: 18,
  },
  compact: {
    id: "compact",
    name: "Compact",
    blurb: "Tighter spacing to fit a longer history on one page.",
    family: "sans",
    nameAlign: "left",
    nameSizePt: 20,
    nameAccent: false,
    headerRule: false,
    headingTransform: "uppercase",
    headingLetterSpacing: 1,
    headingAccent: false,
    headingRule: "full",
    accentHex: "#111111",
    ruleHex: "#999999",
    bodySizePt: 9.5,
    sectionGapPt: 10,
  },
};

export const RESUME_TEMPLATE_LIST: ResumeTemplate[] =
  Object.values(RESUME_TEMPLATES);

export const DEFAULT_RESUME_TEMPLATE: ResumeTemplateId = "accent";

export function getResumeTemplate(id: string | null | undefined): ResumeTemplate {
  if (id && id in RESUME_TEMPLATES) {
    return RESUME_TEMPLATES[id as ResumeTemplateId];
  }
  return RESUME_TEMPLATES[DEFAULT_RESUME_TEMPLATE];
}
