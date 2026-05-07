/**
 * Email template renderer (Phase 4.5.f).
 *
 * Substitutes {{var.path}} tokens in a subject or body string using the
 * provided context object. Two safety properties:
 *
 *   1. Allowlist — only tokens registered for the template's kind are
 *      substituted. Unknown tokens render as a visible warning marker
 *      (`mode = "preview"`) or as the literal text (`mode = "send"` so
 *      the customer's recipient never sees a broken token).
 *
 *   2. HTML escaping — when rendering body_html (`mode = "send"` /
 *      "preview"), substituted values are HTML-escaped to prevent stray
 *      injection. For subjects (`mode = "subject"`), no HTML escaping.
 *
 * The same renderer is used both server-side (dispatch) and inside the
 * editor's live-preview pane.
 */

import { TEMPLATE_META, type EmailTemplateKind } from "./manifest";

export type RenderMode = "html" | "subject" | "preview";

/**
 * Walk a context object using a dotted path. Returns null when any
 * intermediate node is missing. Strings/numbers/booleans pass through.
 */
function resolveByPath(
  context: Record<string, unknown>,
  path: string
): unknown {
  const parts = path.split(".");
  let cursor: unknown = context;
  for (const part of parts) {
    if (cursor === null || cursor === undefined) return null;
    if (typeof cursor !== "object") return null;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const TOKEN_REGEX = /\{\{\s*([\w.]+)\s*\}\}/g;

export interface RenderResult {
  output: string;
  /** Tokens that don't exist in the manifest for this kind. Useful for editor diagnostics. */
  unknownTokens: string[];
  /** Tokens that resolved to null/undefined in the context — typically a missing optional field. */
  missingValues: string[];
}

interface RenderOptions {
  kind: EmailTemplateKind;
  template: string;
  context: Record<string, unknown>;
  mode: RenderMode;
}

/**
 * Substitute mergefield tokens in `template` against `context`.
 *
 * - mode === "html"     → HTML-escape values, render unknown tokens as the
 *                         literal raw token (so production sends never leak
 *                         unrendered placeholders to the recipient).
 * - mode === "subject"  → Plain-text substitution, no escaping. Same fallback.
 * - mode === "preview"  → HTML-escape values AND wrap unknown tokens in a
 *                         visible `<mark>` warning so the editor can flag them.
 */
export function renderTemplate(opts: RenderOptions): RenderResult {
  const { kind, template, context, mode } = opts;
  const meta = TEMPLATE_META[kind];
  const allowedTokens = new Set(
    meta.groups.flatMap((g) => g.fields.map((f) => f.token))
  );

  const unknownTokens: string[] = [];
  const missingValues: string[] = [];

  const output = template.replace(TOKEN_REGEX, (_match, rawToken) => {
    const token = String(rawToken);

    if (!allowedTokens.has(token)) {
      unknownTokens.push(token);
      if (mode === "preview") {
        // Visible warning in the editor preview.
        return `<mark style="background:#FEF3C7;color:#92400E;border:1px solid #F59E0B;padding:0 4px;border-radius:3px;font-family:monospace;font-size:0.85em;">{{${escapeHtml(token)}}}</mark>`;
      }
      // Production / subject: render the literal token text. This is safer
      // than emitting nothing — a "{{candidate.fist_name}}" arriving at the
      // recipient is annoying but the recipient can ask the DSO to fix it,
      // whereas a silent empty string would be invisible.
      return mode === "subject" ? `{{${token}}}` : escapeHtml(`{{${token}}}`);
    }

    const resolved = resolveByPath(context, token);
    if (resolved === null || resolved === undefined) {
      missingValues.push(token);
      return "";
    }

    const stringValue = String(resolved);
    if (mode === "subject") return stringValue;
    return escapeHtml(stringValue);
  });

  return { output, unknownTokens, missingValues };
}

/**
 * Build a sample context object for the editor's live preview. Pulls
 * example values from the template's manifest groups so what the DSO
 * sees in preview matches the dropdown's example column exactly.
 */
export function buildSampleContext(
  kind: EmailTemplateKind
): Record<string, unknown> {
  const meta = TEMPLATE_META[kind];
  const ctx: Record<string, Record<string, string>> = {};
  for (const group of meta.groups) {
    ctx[group.id] = {};
    for (const field of group.fields) {
      ctx[group.id][field.token.split(".")[1]] = field.example;
    }
  }
  return ctx;
}
