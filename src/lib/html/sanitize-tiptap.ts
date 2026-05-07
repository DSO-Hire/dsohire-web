/**
 * Shared sanitizer for Tiptap-authored HTML (Phase 4.5.f extraction).
 *
 * Mirrors the allowlist used by `RenderedJobDescription` (Phase 2 / Round 1)
 * but lives in a shared location so both /jobs/[id] AND the email pipeline
 * can use the same trust boundary.
 *
 * Strategy:
 *   1. Walk the input string, tokenizing tags vs. text.
 *   2. For each tag, decide whether to keep, void, or rewrite it.
 *   3. For kept tags, scrub attributes against the allowlist and force
 *      safe defaults on <a> (rel="noopener noreferrer nofollow",
 *      target="_blank", drop href values that aren't http(s):, mailto:,
 *      or tel:).
 *   4. Escape any text content that isn't already inside a kept tag.
 *
 * This is intentionally conservative: anything we don't recognize is dropped.
 */

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "em",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
]);

// Allowed attributes per tag. Anything not listed is stripped. `class` is
// preserved on every tag so Tailwind/Tiptap-applied classes survive.
const ALLOWED_ATTR: Record<string, Set<string>> = {
  a: new Set(["href", "class"]),
};
const GLOBAL_ALLOWED_ATTR = new Set(["class"]);

const TAG_REGEX = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
const SAFE_HREF_REGEX = /^(https?:|mailto:|tel:|\/|#)/i;

export function sanitizeTiptapHtml(input: string): string {
  if (!input) return "";

  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TAG_REGEX.lastIndex = 0;

  while ((match = TAG_REGEX.exec(input)) !== null) {
    const fullMatch = match[0];
    const rawTagName = match[1].toLowerCase();
    const rawAttrs = match[2];
    const isClosing = fullMatch.startsWith("</");

    if (match.index > lastIndex) {
      result += escapeText(input.slice(lastIndex, match.index));
    }
    lastIndex = match.index + fullMatch.length;

    if (!ALLOWED_TAGS.has(rawTagName)) continue;

    if (isClosing) {
      result += `</${rawTagName}>`;
      continue;
    }

    const attrs = sanitizeAttributes(rawTagName, rawAttrs);
    if (rawTagName === "br") {
      result += `<br${attrs}/>`;
    } else {
      result += `<${rawTagName}${attrs}>`;
    }
  }

  if (lastIndex < input.length) {
    result += escapeText(input.slice(lastIndex));
  }

  return result;
}

/**
 * Strip all HTML tags and decode common entities. Useful for email
 * preview-text generation and for the candidate timeline excerpt.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return "";
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeAttributes(tag: string, raw: string): string {
  if (!raw || !raw.trim()) {
    if (tag === "a") {
      return ' rel="noopener noreferrer nofollow" target="_blank"';
    }
    return "";
  }

  const allowed = ALLOWED_ATTR[tag] ?? GLOBAL_ALLOWED_ATTR;
  const out: string[] = [];

  const attrRegex = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m: RegExpExecArray | null;

  while ((m = attrRegex.exec(raw)) !== null) {
    const name = m[1].toLowerCase();
    const value = (m[2] ?? m[3] ?? m[4] ?? "").trim();
    if (!allowed.has(name)) continue;

    if (tag === "a" && name === "href") {
      if (!SAFE_HREF_REGEX.test(value)) continue;
      out.push(`href="${escapeAttr(value)}"`);
    } else {
      out.push(`${name}="${escapeAttr(value)}"`);
    }
  }

  if (tag === "a") {
    out.push('rel="noopener noreferrer nofollow"');
    out.push('target="_blank"');
  }

  return out.length > 0 ? " " + out.join(" ") : "";
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");
}
