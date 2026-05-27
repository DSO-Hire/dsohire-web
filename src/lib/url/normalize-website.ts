/**
 * Normalize a user-supplied practice website URL.
 *
 *   - Trims whitespace
 *   - Prepends `https://` when no scheme is present
 *   - Lowercases the scheme + host (preserves path/query case)
 *   - Rejects anything that doesn't parse as a URL after normalization
 *   - Rejects non-http(s) schemes (mailto:, javascript:, etc.)
 *
 * Returns the normalized URL string or null when the input is empty.
 * Throws when the input is non-empty but unparseable — callers should
 * wrap in try/catch and surface a friendly error to the user.
 */
export function normalizeWebsite(input: string | null | undefined): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error(`Website URL is invalid: ${input}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Website URL must use http or https (got ${parsed.protocol})`
    );
  }

  // Hostname sanity — must include a dot (basic domain shape check).
  if (!parsed.hostname.includes(".")) {
    throw new Error(`Website URL is missing a domain: ${input}`);
  }

  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  return parsed.toString();
}
