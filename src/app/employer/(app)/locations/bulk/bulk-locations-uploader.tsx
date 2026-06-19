"use client";

/**
 * BulkLocationsUploader — file picker + submit + per-row error report.
 *
 * Server-side parsing keeps the client bundle small. The flow is:
 *   1. User picks a .csv / .xlsx file (or drags onto the dropzone)
 *   2. Hit "Add N locations" → POSTs the file as FormData to the
 *      bulkAddLocations server action
 *   3. Server parses, validates each row, inserts the valid ones,
 *      returns {succeededCount, failed[]}
 *   4. We render a summary card + a per-row error list (with a
 *      download-errors-as-CSV affordance for quick fixes)
 *
 * Sample CSV download is built client-side from a constant so the
 * surface stays static-friendly.
 */

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import {
  bulkAddLocations,
  type BulkAddLocationsResult,
  type BulkRowFailure,
} from "../bulk-actions";

const SAMPLE_CSV = `name,address_line1,address_line2,city,state,postal_code,website
Lakeshore Dental — Downtown,123 Main St,Suite 200,Indianapolis,IN,46204,https://lakeshore-downtown.example.com
Lakeshore Dental — Northside,4500 N Meridian St,,Indianapolis,IN,46208,https://lakeshore-northside.example.com
Lakeshore Dental — Greenwood,1100 N Madison Ave,,Greenwood,IN,46142,
`;

export function BulkLocationsUploader() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<BulkAddLocationsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onPick(f: File | null) {
    setError(null);
    setResult(null);
    setFile(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0] ?? null;
    if (f) onPick(f);
  }

  function onSubmit() {
    if (!file) {
      setError("Pick a file first.");
      return;
    }
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const r = await bulkAddLocations(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResult(r);
    });
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dsohire-locations-sample.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadErrors(failed: BulkRowFailure[]) {
    const header = "row_number,name,error\n";
    const csvRows = failed
      .map(
        (f) =>
          `${f.rowNumber},${csvEscape(f.name)},${csvEscape(f.error)}`
      )
      .join("\n");
    const blob = new Blob([header + csvRows + "\n"], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dsohire-locations-errors.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Sample download */}
      <div className="border border-[var(--rule)] bg-cream/30 p-4 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-semibold text-ink mb-0.5">
            New to this? Start from the sample.
          </h3>
          <p className="text-[12px] text-slate-meta leading-relaxed">
            Three example rows showing exactly the columns we expect.
            Replace the rows with your own locations and upload.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadSample}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--rule-strong)] bg-card px-3 py-2 text-[12px] font-semibold text-ink hover:bg-cream/60"
        >
          <Download className="size-3.5" />
          Download sample CSV
        </button>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={
          "border-2 border-dashed p-8 sm:p-10 text-center transition-colors " +
          (dragOver
            ? "border-heritage bg-heritage/[0.04]"
            : "border-[var(--rule-strong)] bg-card")
        }
      >
        {file ? (
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2.5 text-[14px] text-ink font-semibold">
              <FileSpreadsheet className="size-4 text-heritage-deep" />
              {file.name}
              <span className="text-[12px] font-normal text-slate-meta">
                ({(file.size / 1024).toFixed(1)} KB)
              </span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setResult(null);
                  setError(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--rule-strong)] bg-card px-3 py-2 text-[12px] font-semibold text-slate-body hover:bg-cream/60 hover:text-ink"
              >
                <Trash2 className="size-3.5" />
                Pick a different file
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                {pending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    Import locations
                    <ArrowRight className="size-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Upload className="size-6 mx-auto text-slate-meta" />
            <div className="text-[14px] text-slate-body">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="font-semibold text-heritage-deep underline-offset-2 hover:underline"
              >
                Click to choose a file
              </button>{" "}
              or drag it here.
            </div>
            <p className="text-[11px] text-slate-meta">
              .csv, .xlsx, or .xls — up to 5 MB · 1000 rows max
            </p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </div>

      {/* Error from server */}
      {error && (
        <div className="border border-danger bg-danger-bg px-4 py-3 text-[13px] text-danger inline-flex items-start gap-2">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Result */}
      {result?.ok && (
        <ResultCard result={result} onDownloadErrors={downloadErrors} />
      )}
    </div>
  );
}

function ResultCard({
  result,
  onDownloadErrors,
}: {
  result: Extract<BulkAddLocationsResult, { ok: true }>;
  onDownloadErrors: (failed: BulkRowFailure[]) => void;
}) {
  const { succeededCount, failed, totalRows } = result;
  const allOk = failed.length === 0;
  const noneOk = succeededCount === 0;

  return (
    <div
      className={
        "border p-5 space-y-4 " +
        (allOk
          ? "border-heritage/40 bg-heritage/[0.06]"
          : noneOk
            ? "border-danger bg-danger-bg"
            : "border-warning bg-warning-bg")
      }
    >
      <div className="flex items-start gap-3">
        {allOk ? (
          <CheckCircle2 className="size-5 text-heritage-deep shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle
            className={
              "size-5 shrink-0 mt-0.5 " +
              (noneOk ? "text-danger" : "text-warning")
            }
          />
        )}
        <div className="flex-1 min-w-0">
          <h3
            className={
              "text-[14px] font-bold " +
              (allOk
                ? "text-heritage-deep"
                : noneOk
                  ? "text-danger"
                  : "text-warning")
            }
          >
            {allOk
              ? `Added ${succeededCount} location${succeededCount === 1 ? "" : "s"}.`
              : noneOk
                ? `Couldn't add any of ${totalRows} rows.`
                : `Added ${succeededCount} of ${totalRows} locations — ${failed.length} skipped.`}
          </h3>
          {allOk && (
            <p className="mt-1 text-[12px] text-heritage-deep/80">
              Each location is being geocoded in the background. They&apos;ll
              show up on the map view within a minute.
            </p>
          )}
        </div>
        {succeededCount > 0 && (
          <Link
            href="/employer/locations"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-[11px] font-bold tracking-[1.5px] uppercase text-primary-foreground hover:bg-primary/90 shrink-0"
          >
            View all
            <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>

      {failed.length > 0 && (
        <div className="border-t border-current/20 pt-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-bold tracking-[1.5px] uppercase text-current opacity-80">
              Skipped rows ({failed.length})
            </div>
            <button
              type="button"
              onClick={() => onDownloadErrors(failed)}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold underline-offset-2 hover:underline"
            >
              <Download className="size-3.5" />
              Download as CSV
            </button>
          </div>
          <ul className="space-y-1 text-[12px]">
            {failed.slice(0, 10).map((f) => (
              <li key={`${f.rowNumber}-${f.name}`} className="flex gap-2">
                <span className="font-mono opacity-60 shrink-0">
                  Row {f.rowNumber}:
                </span>
                <span className="font-semibold">{f.name}</span>
                <span className="opacity-80">— {f.error}</span>
              </li>
            ))}
            {failed.length > 10 && (
              <li className="opacity-60 italic">
                …{failed.length - 10} more. Download the CSV above for the full list.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function csvEscape(input: string): string {
  if (/[,"\n\r]/.test(input)) {
    return `"${input.replace(/"/g, '""')}"`;
  }
  return input;
}
