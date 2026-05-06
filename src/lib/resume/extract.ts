/**
 * Server-side resume text extraction (Phase 4.1.c, parity sprint).
 *
 * One entry point: `extractResumeText(input)` returns a `{ text, pageCount,
 * warnings }` payload that the LLM parser in `./parse.ts` consumes. PDFs go
 * through `unpdf` (modern Node-friendly wrapper around pdfjs-dist) and
 * DOCX through `mammoth`. `.doc` (legacy Word) is intentionally not
 * supported — we surface a friendly nudge to convert to DOCX or PDF.
 *
 * Failure modes are explicit (`ResumeExtractionErrorKind`) so the calling
 * server action can render an actionable error message to the candidate
 * instead of a generic "something went wrong."
 *
 * ─────────────────────────────────────────────────────────────────
 * Locked failure-mode contract (from parity sprint scope §4.1.c):
 *   • >10MB                → reject  ('file_too_large')
 *   • .doc legacy          → reject  ('format_unsupported')
 *   • >8 pages             → warn but proceed; surfaces in `warnings[]`
 *   • Empty / no text      → reject  ('empty_text')  — likely a scanned
 *                            image-only resume; parser can't help here
 *                            until we add OCR (Phase 5+)
 *   • 30-second timeout    → reject  ('timeout')
 *   • Parser throws        → reject  ('extraction_failed')
 * ─────────────────────────────────────────────────────────────────
 *
 * Server-only — never import from a "use client" file. Pulls in pdfjs
 * + mammoth which are large dependencies meant to live in serverless
 * functions, not browser bundles.
 */

import { extractText as unpdfExtractText } from "unpdf";
import * as mammoth from "mammoth";

// Locked caps (kept as named constants so the limits are greppable).
export const MAX_FILE_BYTES = 10 * 1024 * 1024;        // 10 MB hard cap
export const PAGE_COUNT_WARN_THRESHOLD = 8;             // soft warn
export const EXTRACTION_TIMEOUT_MS = 30_000;            // 30 sec

export type ResumeFormat = "pdf" | "docx";

export type ResumeExtractionErrorKind =
  | "format_unsupported"      // .doc, .rtf, .pages, etc.
  | "file_too_large"
  | "empty_text"
  | "extraction_failed"
  | "timeout";

export class ResumeExtractionError extends Error {
  readonly kind: ResumeExtractionErrorKind;
  constructor(kind: ResumeExtractionErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = "ResumeExtractionError";
  }
}

export interface ResumeExtractionInput {
  /** Raw file bytes. Server actions receive this from a FormData blob. */
  bytes: ArrayBuffer | Uint8Array | Buffer;
  /** MIME type from the upload, used to disambiguate format. */
  mimeType: string;
  /** Original filename, used for nudge messages on `.doc` rejection. */
  filename?: string;
}

export interface ResumeExtractionResult {
  format: ResumeFormat;
  text: string;
  pageCount: number;
  warnings: string[];
}

/**
 * Public API. Resolves with the extracted text or rejects with a
 * `ResumeExtractionError` whose `.kind` the caller pattern-matches on.
 */
export async function extractResumeText(
  input: ResumeExtractionInput
): Promise<ResumeExtractionResult> {
  const format = detectFormat(input);

  const bytes = toUint8Array(input.bytes);
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new ResumeExtractionError(
      "file_too_large",
      `Resume is ${(bytes.byteLength / 1_048_576).toFixed(1)}MB; the limit is ${MAX_FILE_BYTES / 1_048_576}MB.`
    );
  }

  // Wrap the actual extraction in a timeout so a malformed file can't
  // hold a serverless function open until Vercel kills it.
  return await withTimeout(
    runExtraction(format, bytes),
    EXTRACTION_TIMEOUT_MS,
    () =>
      new ResumeExtractionError(
        "timeout",
        `Reading the file took longer than ${EXTRACTION_TIMEOUT_MS / 1000} seconds.`
      )
  );
}

// ─────────────────────────────────────────────────────────────────────
// Format detection
// ─────────────────────────────────────────────────────────────────────

function detectFormat(input: ResumeExtractionInput): ResumeFormat {
  const mime = input.mimeType.toLowerCase();
  const name = (input.filename ?? "").toLowerCase();

  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    return "pdf";
  }

  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return "docx";
  }

  // Specific nudge for legacy .doc — common pain point.
  if (mime === "application/msword" || name.endsWith(".doc")) {
    throw new ResumeExtractionError(
      "format_unsupported",
      "We can't read legacy .doc files yet. Save your resume as .docx or .pdf and try again."
    );
  }

  // Catch-all for everything else (RTF, Pages, ODT, plain text, etc.)
  throw new ResumeExtractionError(
    "format_unsupported",
    "Please upload a PDF or DOCX file."
  );
}

// ─────────────────────────────────────────────────────────────────────
// Per-format extraction
// ─────────────────────────────────────────────────────────────────────

async function runExtraction(
  format: ResumeFormat,
  bytes: Uint8Array
): Promise<ResumeExtractionResult> {
  if (format === "pdf") {
    return extractFromPdf(bytes);
  }
  return extractFromDocx(bytes);
}

async function extractFromPdf(
  bytes: Uint8Array
): Promise<ResumeExtractionResult> {
  let result: { totalPages: number; text: string };
  try {
    result = await unpdfExtractText(bytes, { mergePages: true });
  } catch (err) {
    throw new ResumeExtractionError(
      "extraction_failed",
      err instanceof Error
        ? `Couldn't read this PDF: ${err.message}`
        : "Couldn't read this PDF."
    );
  }

  const text = (result.text ?? "").trim();
  if (!text) {
    throw new ResumeExtractionError(
      "empty_text",
      "We couldn't pull any text from this PDF — it may be a scanned image. Try uploading a PDF exported from Word or Google Docs, or paste your summary manually."
    );
  }

  const warnings: string[] = [];
  if (result.totalPages > PAGE_COUNT_WARN_THRESHOLD) {
    warnings.push(
      `Your resume is ${result.totalPages} pages — we'll do our best, but the parser is tuned for resumes up to ${PAGE_COUNT_WARN_THRESHOLD} pages.`
    );
  }

  return {
    format: "pdf",
    text,
    pageCount: result.totalPages,
    warnings,
  };
}

async function extractFromDocx(
  bytes: Uint8Array
): Promise<ResumeExtractionResult> {
  let extracted: { value: string };
  try {
    // mammoth accepts a Buffer (Node) or an ArrayBuffer; we hand it the
    // underlying ArrayBuffer to keep the call shape isomorphic.
    extracted = await mammoth.extractRawText({
      buffer: Buffer.from(bytes),
    });
  } catch (err) {
    throw new ResumeExtractionError(
      "extraction_failed",
      err instanceof Error
        ? `Couldn't read this DOCX: ${err.message}`
        : "Couldn't read this DOCX."
    );
  }

  const text = (extracted.value ?? "").trim();
  if (!text) {
    throw new ResumeExtractionError(
      "empty_text",
      "We couldn't pull any text from this DOCX. If your resume is mostly images, please upload a PDF instead."
    );
  }

  // DOCX has no concept of pages without rendering, so we approximate via
  // a rough character heuristic. ~3000 chars/page is a reasonable default
  // for resumes; only used to surface the >8-page warning.
  const approxPages = Math.max(1, Math.ceil(text.length / 3000));
  const warnings: string[] = [];
  if (approxPages > PAGE_COUNT_WARN_THRESHOLD) {
    warnings.push(
      `Your resume is roughly ${approxPages} pages — we'll do our best, but the parser is tuned for resumes up to ${PAGE_COUNT_WARN_THRESHOLD} pages.`
    );
  }

  return {
    format: "docx",
    text,
    pageCount: approxPages,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function toUint8Array(
  bytes: ArrayBuffer | Uint8Array | Buffer
): Uint8Array {
  if (bytes instanceof Uint8Array) return bytes;
  // ArrayBuffer fallback (covers `Buffer` subclass too via Uint8Array branch above).
  return new Uint8Array(bytes);
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => Error
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
