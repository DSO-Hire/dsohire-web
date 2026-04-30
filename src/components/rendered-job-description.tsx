/**
 * RenderedJobDescription — sanitizes Tiptap HTML and renders it on public pages.
 *
 * Used on /jobs/[id] and anywhere a job description is displayed publicly.
 * Sanitization happens server-side via isomorphic-dompurify before any HTML
 * touches the browser. Allowlist matches the JobDescriptionEditor's enabled
 * extensions exactly — bold, italic, h2, h3, ul, ol, li, blockquote, p, a.
 *
 * This is a server component (no "use client") so DOMPurify runs at render
 * time on the server.
 */

import DOMPurify from "isomorphic-dompurify";
import { cn } from "@/lib/utils";

const ALLOWED_TAGS = [
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
];

const ALLOWED_ATTR = ["href", "target", "rel", "class"];

interface RenderedJobDescriptionProps {
  html: string;
  className?: string;
}

export function RenderedJobDescription({
  html,
  className,
}: RenderedJobDescriptionProps) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Force all links to open safely in a new tab.
    ADD_ATTR: ["target", "rel"],
  });

  return (
    <div
      className={cn("dso-prose", className)}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

/**
 * Helper: extract plain text from the HTML for JSON-LD JobPosting.description
 * and for email-excerpt previews. Strips tags but preserves whitespace.
 */
export function htmlToPlainText(html: string): string {
  // Lightweight strip — DOMPurify with allowedTags=[] returns text content.
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
    .replace(/\s+/g, " ")
    .trim();
}
