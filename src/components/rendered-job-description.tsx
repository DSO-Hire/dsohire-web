/**
 * RenderedJobDescription — sanitizes Tiptap HTML and renders it on public pages.
 *
 * Used on /jobs/[id] and anywhere a job description is displayed publicly.
 * Sanitization is delegated to the shared `sanitizeTiptapHtml` lib so the
 * email render path uses the same allowlist (Phase 4.5.f extraction).
 */
import { cn } from "@/lib/utils";
import {
  sanitizeTiptapHtml,
  htmlToPlainText as sharedHtmlToPlainText,
} from "@/lib/html/sanitize-tiptap";

interface RenderedJobDescriptionProps {
  html: string;
  className?: string;
}

export function RenderedJobDescription({
  html,
  className,
}: RenderedJobDescriptionProps) {
  const clean = sanitizeTiptapHtml(html);

  return (
    <div
      className={cn("dso-prose", className)}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

/**
 * Helper: extract plain text from the HTML for JSON-LD JobPosting.description
 * and for email-excerpt previews. Re-exported from the shared lib for
 * backwards compatibility with existing call sites that imported it from
 * this module.
 */
export const htmlToPlainText = sharedHtmlToPlainText;
