/**
 * Candidate name helpers (Day 14 — first/last/salutation split).
 *
 * `candidates.full_name` is now a STORED generated column derived from
 * `first_name || ' ' || last_name`. All WRITE paths set first_name /
 * last_name (never full_name — Postgres rejects writes to a generated
 * column). READS of full_name keep working everywhere unchanged.
 *
 * `salutation` is an OPTIONAL prefix from a fixed dropdown — see
 * SALUTATIONS below. The CHECK constraint in migration
 * 20260515000001_candidate_name_split.sql mirrors that list 1:1.
 */

// ─────────────────────────────────────────────────────────────────────
// Salutations — fixed dropdown. "Dr." leads; it's the common case for
// a dental audience. Stored verbatim (with the period).
// ─────────────────────────────────────────────────────────────────────

export const SALUTATIONS = ["Dr.", "Prof.", "Mr.", "Mrs.", "Ms.", "Mx."] as const;

export type Salutation = (typeof SALUTATIONS)[number];

/** Runtime guard — normalizes form input to a valid Salutation or null. */
export function parseSalutation(raw: unknown): Salutation | null {
  const v = String(raw ?? "").trim();
  return (SALUTATIONS as readonly string[]).includes(v) ? (v as Salutation) : null;
}

// ─────────────────────────────────────────────────────────────────────
// Pronouns — fixed dropdown added 2026-05-18 after Erica's testing pass
// flagged the free-text pronouns input as a typo/inconsistency risk.
// Common combinations cover ~95% of candidate selections; "Prefer not
// to say" preserves the choice not to disclose without forcing a value;
// the profile keeps a free-text fallback if a candidate's pronouns
// aren't in the list (legacy custom values render as a "(current)"
// option so they don't silently disappear from the picker).
// ─────────────────────────────────────────────────────────────────────

export const PRONOUN_OPTIONS = [
  "she/her",
  "he/him",
  "they/them",
  "she/they",
  "he/they",
  "Prefer not to say",
] as const;

// ─────────────────────────────────────────────────────────────────────
// Split / compose
// ─────────────────────────────────────────────────────────────────────

export interface SplitName {
  first_name: string | null;
  last_name: string | null;
}

/**
 * Split a single free-text name into first + last. Matches the SQL
 * backfill heuristic in the migration: collapse internal whitespace,
 * the last token is the last name, everything before is the first name.
 * Single-token names → first_name only. Blank → both null.
 *
 * Used wherever we still only have one name string to work with —
 * OAuth `user_metadata.full_name`, resume-parser `basics.full_name`.
 */
export function splitFullName(input: string | null | undefined): SplitName {
  const collapsed = String(input ?? "").trim().replace(/\s+/g, " ");
  if (!collapsed) return { first_name: null, last_name: null };
  const lastSpace = collapsed.lastIndexOf(" ");
  if (lastSpace === -1) return { first_name: collapsed, last_name: null };
  return {
    first_name: collapsed.slice(0, lastSpace),
    last_name: collapsed.slice(lastSpace + 1),
  };
}

/**
 * Compose the display name from parts. Mirrors the generated-column
 * expression (first + last), with an optional salutation prefix for
 * surfaces that want the courtesy title (emails, offer letters).
 */
export function composeName(parts: {
  salutation?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  const core = [parts.first_name, parts.last_name]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const sal = (parts.salutation ?? "").trim();
  return [sal, core].filter(Boolean).join(" ");
}

/**
 * The first name we actually want to greet someone by. Prefers the real
 * `first_name` column; falls back to splitting a legacy `full_name`
 * string for rows/sources that predate the split. Returns `fallback`
 * (default "there") when nothing usable is present.
 *
 * This replaces the platform-wide `full_name.split(/\s+/)[0]` hack.
 */
export function greetingFirstName(
  source: { first_name?: string | null; full_name?: string | null },
  fallback = "there"
): string {
  const fn = (source.first_name ?? "").trim();
  if (fn) return fn;
  const split = splitFullName(source.full_name);
  return split.first_name ?? fallback;
}
