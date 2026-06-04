/**
 * Name-leak detector for the pre-publish anonymity nudge (2026-06-04).
 *
 * Masking can hide the structured name field, but it can't rewrite free text the
 * employer typed (a job title like "Office Manager — 67 Dental" or body copy
 * that names the practice). This finds which of a set of names appears in any of
 * the supplied texts, so the wizard can warn before a private/anonymized job
 * goes live with its identity leaked in the prose.
 *
 * Pure + dependency-free so it's unit-testable and usable on client or server.
 */

/** Strip HTML tags (the rich-text description is HTML) before scanning. */
export function stripHtml(html: string | null | undefined): string {
  return (html ?? "").replace(/<[^>]*>/g, " ");
}

/**
 * Return the subset of `names` that appear in any of `texts`, matched
 * case-insensitively on a word-ish boundary (so "Dental" inside "Dentally"
 * doesn't false-match, but "67 Dental" inside "— 67 Dental" does). Names under
 * 3 chars are skipped as too generic to flag reliably.
 */
export function findNameLeaks(
  texts: Array<string | null | undefined>,
  names: Array<string | null | undefined>
): string[] {
  const haystack = texts
    .map((t) => t ?? "")
    .join("\n")
    .toLowerCase();
  if (!haystack.trim()) return [];

  const found = new Set<string>();
  for (const raw of names) {
    const name = (raw ?? "").trim();
    if (name.length < 3) continue;
    const escaped = name
      .toLowerCase()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // \b handles the common cases (spaces, dashes, punctuation around the name),
    // including digit-leading names like "67 Dental".
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    if (re.test(haystack)) found.add(name);
  }
  return [...found];
}
