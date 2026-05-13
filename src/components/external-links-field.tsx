"use client";

/**
 * ExternalLinksField — E1.12 Slice B (2026-05-13).
 *
 * Repeating row of {label, url} inputs for jobs.external_links. Used by
 * both the job-posting wizard (Compensation & Details step) and the
 * sectioned edit page. Hard cap at 5 entries.
 *
 * Submits each row as a pair of arrays via the standard form name
 * attributes (external_link_label[], external_link_url[]) so the server
 * can read them via formData.getAll(...) — that's the contract
 * parseExternalLinks() already established in Slice A.
 *
 * Visual style matches the wizard's other small repeating surfaces
 * (skills/benefits ChipArrayInput). One row = one logical link; remove
 * button per row; "Add another" CTA at the bottom (disabled at cap).
 */

import { useState } from "react";
import { Plus, X, ExternalLink } from "lucide-react";

export interface ExternalLinkPair {
  label: string;
  url: string;
}

interface ExternalLinksFieldProps {
  /** Initial values from the DB (edit flow) or empty (new job). */
  initial?: ExternalLinkPair[];
  /** Bubbles changes up to the parent for form-submit composition. */
  onChange?: (links: ExternalLinkPair[]) => void;
  /** Hard cap; default 5 per the Slice A schema constraint. */
  maxLinks?: number;
}

export function ExternalLinksField({
  initial,
  onChange,
  maxLinks = 5,
}: ExternalLinksFieldProps) {
  const [rows, setRows] = useState<ExternalLinkPair[]>(
    initial && initial.length > 0 ? initial : []
  );

  const update = (next: ExternalLinkPair[]) => {
    setRows(next);
    onChange?.(next);
  };

  const addRow = () => {
    if (rows.length >= maxLinks) return;
    update([...rows, { label: "", url: "" }]);
  };

  const removeRow = (idx: number) => {
    update(rows.filter((_, i) => i !== idx));
  };

  const setField = (idx: number, key: keyof ExternalLinkPair, value: string) => {
    update(rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
  };

  return (
    <div>
      <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
        External links{" "}
        <span className="text-slate-meta font-normal normal-case tracking-[0.3px]">
          (optional · up to {maxLinks})
        </span>
      </label>
      <p className="text-[12px] text-slate-meta leading-relaxed mb-3">
        Video tours, benefits PDFs, &ldquo;meet the team&rdquo; pages, or any
        other URLs you want candidates to see alongside the job posting.
        Each link needs a short label + a full URL (http/https).
      </p>

      {/* Each row submits via these form names. The empty rows that the
          user added but didn't fill in get skipped by the server-side
          parser, so leaving them in the DOM is safe. */}
      {rows.map((row, idx) => (
        <div
          key={idx}
          className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 mb-2 items-start"
        >
          <input
            type="text"
            name="external_link_label"
            value={row.label}
            onChange={(e) => setField(idx, "label", e.target.value)}
            placeholder="Video tour"
            maxLength={80}
            className="h-[40px] px-3 bg-white border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
          />
          <input
            type="url"
            name="external_link_url"
            value={row.url}
            onChange={(e) => setField(idx, "url", e.target.value)}
            placeholder="https://example.com/tour"
            className="h-[40px] px-3 bg-white border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
          />
          <button
            type="button"
            onClick={() => removeRow(idx)}
            aria-label="Remove this link"
            className="h-[40px] px-3 border border-[var(--rule-strong)] bg-white text-slate-meta hover:text-red-700 hover:border-red-300 transition-colors inline-flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        disabled={rows.length >= maxLinks}
        className="mt-1 inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold border border-[var(--rule-strong)] bg-white text-ink hover:border-heritage hover:bg-heritage/[0.06] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus className="h-3.5 w-3.5 text-heritage-deep" />
        {rows.length === 0 ? "Add a link" : "Add another link"}
        {rows.length >= maxLinks && (
          <span className="text-[10px] text-slate-meta tracking-[0.3px] ml-1">
            (max {maxLinks})
          </span>
        )}
      </button>

      {rows.length > 0 && (
        <p className="mt-3 text-[11px] text-slate-meta inline-flex items-center gap-1.5">
          <ExternalLink className="h-3 w-3" />
          Links render as chips below the job&apos;s benefits on the public page.
        </p>
      )}
    </div>
  );
}
