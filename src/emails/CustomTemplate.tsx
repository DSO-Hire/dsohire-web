/**
 * CustomTemplate — wrapper for DSO-customized email bodies (Phase 4.5.f).
 *
 * Takes a sanitized HTML body string (Tiptap output, post-mergefield render)
 * and renders it inside the canonical DSO Hire Layout (header strip + footer).
 *
 * The HTML is injected via dangerouslySetInnerHTML; the caller MUST sanitize
 * upstream — the body comes from Tiptap and runs through the same allowlist
 * sanitizer used for /jobs/[id] descriptions.
 */

import type { ReactElement } from "react";
import { Layout } from "./components/Layout";

interface CustomTemplateProps {
  /** Plain-text preview shown in the inbox list (unrendered). */
  previewText: string;
  /** Sanitized HTML body. Mergefields already substituted upstream. */
  bodyHtml: string;
}

export function CustomTemplate({
  previewText,
  bodyHtml,
}: CustomTemplateProps): ReactElement {
  // The Layout component already wraps content in its own Container. We
  // inject the sanitized HTML directly as a child div. No interactive
  // script tags or inline event handlers can survive the sanitizer.
  return (
    <Layout previewText={previewText}>
      <div
        style={customBody}
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </Layout>
  );
}

export default CustomTemplate;

/* ───── styles ─────
   Match the typographic feel of the existing React Email components so a
   custom template doesn't visually drift from the system defaults. */

const customBody = {
  color: "#14233F",
  fontSize: "15px",
  lineHeight: "1.65",
};
