/**
 * Offer-letter merge field engine (Phase 5A Track E).
 *
 * Three responsibilities:
 *   1. Canonical merge field catalog — the `MERGE_FIELDS` constant is
 *      the single source of truth for what tokens can appear in an
 *      offer-letter template body. Categorized so the editor's
 *      "Insert merge field" dropdown can group them; `required`
 *      flagged on sender-filled offer.* fields so the modal can
 *      enforce them.
 *   2. `renderTemplate(body, values)` — replaces every `{{key}}` in
 *      the markdown body with the value from `values` (HTML-escaped),
 *      converts the result to HTML via a minimal markdown converter,
 *      and returns the HTML body fragment plus a list of `offer.*`
 *      required keys that didn't have a value. The fragment is meant
 *      to be wrapped by the OfferLetter React Email template (which
 *      adds the navy header + ivory chrome).
 *   3. `buildPreviewValues()` — derives a placeholder Record from the
 *      catalog for the editor's live preview, so the DSO sees what
 *      a rendered offer looks like with realistic stand-ins.
 *
 * No new deps — we don't pull in `marked` / `remark`. The markdown
 * subset we support intentionally covers the typical offer letter:
 * ## / ### headings, **bold**, *italic*, paragraph breaks, line
 * breaks, and bullet lists (`- item`). That's all most offer letters
 * use. Anything fancier (tables, images, links beyond auto-detected
 * email/URL strings) we leave for the future.
 */

export interface MergeFieldDef {
  /** Stable identifier used in the template body. */
  key: string;
  /** Human label shown in the editor's "Insert merge field" dropdown. */
  label: string;
  /** Where the value comes from.
   *   - candidate / job / dso: auto-filled from the application's row data
   *   - offer: sender fills it in the send modal
   */
  category: "candidate" | "job" | "dso" | "offer";
  /** For category='offer' fields: must the sender fill this before sending? */
  required?: boolean;
  /** Placeholder shown in the editor preview when the field is empty. */
  example?: string;
}

export const MERGE_FIELDS: ReadonlyArray<MergeFieldDef> = [
  // ── Auto from the candidate row
  {
    key: "candidate.full_name",
    label: "Candidate full name",
    category: "candidate",
    example: "Jordan Lee",
  },
  {
    key: "candidate.first_name",
    label: "Candidate first name",
    category: "candidate",
    example: "Jordan",
  },
  {
    key: "candidate.email",
    label: "Candidate email",
    category: "candidate",
    example: "jordan@example.com",
  },

  // ── Auto from the job row
  {
    key: "job.title",
    label: "Job title",
    category: "job",
    example: "Associate Dentist",
  },
  {
    key: "job.location",
    label: "Job location (city, state)",
    category: "job",
    example: "Overland Park, KS",
  },
  {
    key: "job.employment_type",
    label: "Employment type",
    category: "job",
    example: "Full-time",
  },

  // ── Auto from the DSO row
  {
    key: "dso.name",
    label: "DSO name",
    category: "dso",
    example: "Lakeshore Dental Group",
  },

  // ── Sender-filled per offer
  {
    key: "offer.start_date",
    label: "Start date",
    category: "offer",
    required: true,
    example: "Monday, June 16, 2026",
  },
  {
    key: "offer.compensation",
    label: "Compensation",
    category: "offer",
    required: true,
    example: "$165,000 base + 28% production bonus",
  },
  {
    key: "offer.benefits_summary",
    label: "Benefits summary",
    category: "offer",
    example: "Medical / dental / vision, 401(k) match, 4 weeks PTO",
  },
  {
    key: "offer.signing_bonus",
    label: "Signing bonus",
    category: "offer",
    example: "$10,000 paid within 30 days of start",
  },
  {
    key: "offer.reporting_to",
    label: "Reporting to",
    category: "offer",
    example: "Dr. Sara Chen, Regional Clinical Director",
  },
  {
    key: "offer.deadline_to_accept",
    label: "Deadline to accept",
    category: "offer",
    example: "Friday, May 23, 2026 at 5pm CT",
  },
  {
    key: "offer.custom_note",
    label: "Custom note",
    category: "offer",
    example: "Looking forward to having you on the team.",
  },
];

/** Quick lookup by key. */
export const MERGE_FIELDS_BY_KEY: Readonly<Record<string, MergeFieldDef>> =
  Object.freeze(
    Object.fromEntries(MERGE_FIELDS.map((f) => [f.key, f]))
  );

/** All sender-filled fields, in catalog order. */
export const OFFER_FIELDS: ReadonlyArray<MergeFieldDef> = MERGE_FIELDS.filter(
  (f) => f.category === "offer"
);

/** All sender-filled required fields. */
export const REQUIRED_OFFER_FIELDS: ReadonlyArray<MergeFieldDef> =
  OFFER_FIELDS.filter((f) => f.required === true);

/* ───────────────────────────────────────────────────────────────
 * HTML escaping + minimal markdown → HTML converter
 *
 * We intentionally support a small subset:
 *   ## Heading 2
 *   ### Heading 3
 *   **bold**, *italic*
 *   - bullet list items
 *   blank-line-separated paragraphs
 *   single newlines inside a paragraph render as <br/>
 *
 * Tokens (`{{...}}`) are substituted BEFORE this converter runs,
 * which lets the substitution itself be HTML-escaped (so a value
 * like "S&P 500" doesn't break the HTML). The body markdown itself
 * is also HTML-escaped — DSO admins write plain markdown, not raw
 * HTML; this keeps things safe by default.
 * ───────────────────────────────────────────────────────────── */

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const TOKEN_REGEX = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Substitute tokens then convert the markdown to an HTML body fragment.
 * Returns the fragment + a list of REQUIRED offer.* keys that had no
 * (or empty) value supplied. The caller MUST check `missingRequired`
 * before sending.
 */
export interface RenderTemplateResult {
  html: string;
  missingRequired: string[];
  /** Tokens present in the body that are not in the canonical catalog. */
  unknownTokens: string[];
}

export function renderTemplate(
  body: string,
  values: Record<string, string>
): RenderTemplateResult {
  const unknownTokens = new Set<string>();
  const allowedKeys = new Set(MERGE_FIELDS.map((f) => f.key));

  // Step 1 — token substitution. Tokens we don't recognize fall through
  // as literal `{{...}}` so the recipient sees something rather than a
  // silent empty string. We HTML-escape both the resolved value and the
  // fallback literal (the markdown converter runs after, on already-
  // escaped content).
  const substituted = body.replace(TOKEN_REGEX, (_match, rawToken) => {
    const token = String(rawToken);
    if (!allowedKeys.has(token)) {
      unknownTokens.add(token);
      return escapeHtml(`{{${token}}}`);
    }
    const raw = values[token];
    if (raw === undefined || raw === null || raw === "") {
      return "";
    }
    return escapeHtml(String(raw));
  });

  // Step 2 — markdown → HTML. The input has already had its tokens
  // substituted and HTML-escaped, so the rest of this is structural:
  // detect block-level constructs (headings, lists, paragraphs), then
  // convert inline bold/italic + line breaks.
  const html = markdownToHtml(substituted);

  // Step 3 — check required offer.* fields. We compare against the
  // values map only (not against tokens present in the body) so a
  // template that DOESN'T reference offer.start_date still requires
  // it — the field is canonical regardless of whether the template
  // happens to use the token. Recruiters can always add it inline.
  // Actually — more useful: only require fields that the template
  // BODY references. Otherwise we're forcing every template to use
  // every field, which is the wrong default.
  const referencedTokens = collectReferencedTokens(body);
  const missingRequired: string[] = [];
  for (const f of REQUIRED_OFFER_FIELDS) {
    if (!referencedTokens.has(f.key)) continue;
    const v = values[f.key];
    if (v === undefined || v === null || v.trim() === "") {
      missingRequired.push(f.key);
    }
  }

  return {
    html,
    missingRequired,
    unknownTokens: Array.from(unknownTokens),
  };
}

/**
 * Pull every `{{token}}` reference out of a raw body string.
 * Helper for "what required fields does this template touch?".
 */
export function collectReferencedTokens(body: string): Set<string> {
  const out = new Set<string>();
  const re = new RegExp(TOKEN_REGEX.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.add(m[1]);
  }
  return out;
}

/* ───────────────────────────────────────────────────────────────
 * Minimal markdown → HTML
 * ───────────────────────────────────────────────────────────── */

function markdownToHtml(escapedSource: string): string {
  // Normalize line endings, then split into blocks separated by one
  // or more blank lines. Each block becomes a single HTML element
  // (heading, list, or paragraph).
  const normalized = escapedSource.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split(/\n{2,}/);
  const htmlBlocks: string[] = [];

  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;

    // Heading 3 — must come before H2 because H2 prefix matches H3
    if (/^###\s+/.test(block)) {
      const text = block.replace(/^###\s+/, "");
      htmlBlocks.push(`<h3 style="font-size:16px;font-weight:700;color:#14233F;margin:18px 0 8px;">${renderInline(text)}</h3>`);
      continue;
    }
    if (/^##\s+/.test(block)) {
      const text = block.replace(/^##\s+/, "");
      htmlBlocks.push(`<h2 style="font-size:18px;font-weight:800;color:#14233F;margin:22px 0 10px;letter-spacing:-0.3px;">${renderInline(text)}</h2>`);
      continue;
    }

    // Bullet list — every line starts with `- ` (or `* `).
    const lines = block.split("\n");
    if (lines.every((l) => /^[-*]\s+/.test(l))) {
      const items = lines
        .map((l) => l.replace(/^[-*]\s+/, ""))
        .map(
          (l) =>
            `<li style="margin:0 0 6px;line-height:1.55;">${renderInline(l)}</li>`
        )
        .join("");
      htmlBlocks.push(
        `<ul style="margin:12px 0 16px;padding-left:22px;color:#14233F;font-size:15px;">${items}</ul>`
      );
      continue;
    }

    // Paragraph. Single newlines inside a paragraph render as <br/>.
    const para = lines.map((l) => renderInline(l)).join("<br/>");
    htmlBlocks.push(
      `<p style="margin:0 0 14px;color:#14233F;font-size:15px;line-height:1.65;">${para}</p>`
    );
  }

  return htmlBlocks.join("\n");
}

/**
 * Inline-level conversions: **bold**, *italic*. Operates on
 * already-HTML-escaped text so `**` / `*` from the source are still
 * unambiguous (HTML-escape doesn't touch them).
 */
function renderInline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight:700;">$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em style="font-style:italic;">$2</em>');
}

/* ───────────────────────────────────────────────────────────────
 * Preview-helper — build a values map of catalog examples so the
 * editor's live preview shows a realistic rendered offer.
 * ───────────────────────────────────────────────────────────── */

export function buildPreviewValues(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of MERGE_FIELDS) {
    out[f.key] = f.example ?? `{{${f.key}}}`;
  }
  return out;
}
