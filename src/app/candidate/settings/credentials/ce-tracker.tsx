"use client";

/**
 * <CeTracker> — CE certificate list + add/edit/delete (Phase 4.3.e).
 *
 * Replaces the "coming soon" stub on /candidate/settings/credentials.
 * Renders a list of existing CE entries grouped by completion year + a
 * compact summary (total hours, most recent year hours). Each row has
 * inline edit + delete; the "+ Add CE" button opens an inline editor card.
 *
 * File upload is two-step: save the row first, then upload the file
 * against the row id. Keeps the form simple + reuses the standard
 * row-aware storage policies.
 */

import { useMemo, useState, useTransition } from "react";
import {
  GraduationCap,
  Plus,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  Sparkles,
  FileText,
  Download,
  Paperclip,
} from "lucide-react";
import { LICENSE_TYPES } from "@/lib/candidate/canonical-lists";
import {
  addCeEntry,
  updateCeEntry,
  deleteCeEntry,
  uploadCeFile,
  removeCeFile,
  getCeFileSignedUrl,
  type CeInput,
} from "./ce-actions";

export interface CeRow {
  id: string;
  course_name: string;
  provider: string | null;
  hours_credit: number;
  category: string | null;
  completion_date: string;
  license_type: string | null;
  file_path: string | null;
  file_size_bytes: number | null;
  created_at: string;
}

const COMMON_CE_CATEGORIES = [
  "Implants",
  "Endodontics",
  "Periodontics",
  "Pediatric",
  "Oral surgery",
  "Restorative",
  "Cosmetic",
  "Orthodontics",
  "Sedation",
  "Infection control",
  "OSHA",
  "HIPAA",
  "CPR / BLS",
  "Practice management",
  "Patient communication",
  "Other",
] as const;

export function CeTracker({ initial }: { initial: CeRow[] }) {
  const [items, setItems] = useState<CeRow[]>(initial);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const summary = useMemo(() => {
    const totalHours = items.reduce(
      (acc, ce) => acc + Number(ce.hours_credit ?? 0),
      0
    );
    const thisYear = new Date().getFullYear();
    const yearHours = items
      .filter((ce) => ce.completion_date.startsWith(`${thisYear}-`))
      .reduce((acc, ce) => acc + Number(ce.hours_credit ?? 0), 0);
    return { totalHours, yearHours, thisYear };
  }, [items]);

  const grouped = useMemo(() => {
    const byYear = new Map<string, CeRow[]>();
    for (const ce of items) {
      const yr = ce.completion_date.slice(0, 4);
      const list = byYear.get(yr) ?? [];
      list.push(ce);
      byYear.set(yr, list);
    }
    return Array.from(byYear.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([year, rows]) => ({
        year,
        rows: rows.sort((a, b) =>
          b.completion_date.localeCompare(a.completion_date)
        ),
      }));
  }, [items]);

  return (
    <div className="space-y-4">
      <SummaryCard
        totalHours={summary.totalHours}
        yearHours={summary.yearHours}
        thisYear={summary.thisYear}
        count={items.length}
      />

      {grouped.length === 0 && !adding ? (
        <div className="rounded-md border border-slate-200 bg-slate-50/40 p-6 text-center">
          <p className="text-sm text-slate-700">
            No CE entries yet. Track your continuing-education hours and
            attach certificates as you complete them.
          </p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-[#14233F] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#0d172b]"
          >
            <Plus className="size-4" />
            Add your first CE
          </button>
        </div>
      ) : null}

      {grouped.length > 0 && (
        <div className="space-y-5">
          {grouped.map(({ year, rows }) => (
            <div key={year}>
              <h3 className="mb-2 text-[11px] font-bold tracking-wider uppercase text-slate-500">
                {year}
              </h3>
              <ul className="space-y-2">
                {rows.map((ce) =>
                  editingId === ce.id ? (
                    <CeEditor
                      key={ce.id}
                      initial={ce}
                      onCancel={() => setEditingId(null)}
                      onSaved={(next) => {
                        setItems((prev) =>
                          prev.map((row) => (row.id === next.id ? next : row))
                        );
                        setEditingId(null);
                      }}
                    />
                  ) : (
                    <CeRowDisplay
                      key={ce.id}
                      row={ce}
                      onEdit={() => setEditingId(ce.id)}
                      onDelete={(id) =>
                        setItems((prev) => prev.filter((r) => r.id !== id))
                      }
                      onFileUpdate={(updated) =>
                        setItems((prev) =>
                          prev.map((r) => (r.id === updated.id ? updated : r))
                        )
                      }
                    />
                  )
                )}
              </ul>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <CeEditor
          initial={null}
          onCancel={() => setAdding(false)}
          onSaved={(next) => {
            setItems((prev) => [next, ...prev]);
            setAdding(false);
          }}
        />
      )}

      {!adding && grouped.length > 0 && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={items.length >= 50}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-[#4D7A60] hover:text-[#14233F] disabled:opacity-50"
        >
          <Plus className="size-4" />
          Add CE entry
        </button>
      )}

      {items.length >= 50 && (
        <p className="text-xs text-amber-700">
          You&apos;re at the 50-CE storage cap. Delete an old entry to add another.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Summary tile
// ─────────────────────────────────────────────────────────────────────

function SummaryCard({
  totalHours,
  yearHours,
  thisYear,
  count,
}: {
  totalHours: number;
  yearHours: number;
  thisYear: number;
  count: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 rounded-md border border-[#4D7A60]/30 bg-[#F7F4ED] p-4 text-center">
      <Stat label="Total CE hours" value={totalHours.toFixed(1)} />
      <Stat label={`${thisYear} hours`} value={yearHours.toFixed(1)} />
      <Stat label="Entries" value={String(count)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-2xl font-bold text-[#14233F]">{value}</p>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[#4D7A60]">
        {label}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Display row
// ─────────────────────────────────────────────────────────────────────

function CeRowDisplay({
  row,
  onEdit,
  onDelete,
  onFileUpdate,
}: {
  row: CeRow;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onFileUpdate: (updated: CeRow) => void;
}) {
  const [, startWork] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDeleteClick = () => {
    if (!confirm(`Delete "${row.course_name}"? This can't be undone.`)) return;
    setError(null);
    setBusy(true);
    startWork(async () => {
      const r = await deleteCeEntry(row.id);
      setBusy(false);
      if (!r.ok) return setError(r.error);
      onDelete(row.id);
    });
  };

  const onFileChosen = (file: File) => {
    setError(null);
    setBusy(true);
    startWork(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const r = await uploadCeFile(row.id, fd);
      setBusy(false);
      if (!r.ok) return setError(r.error);
      onFileUpdate({
        ...row,
        file_path: r.filePath,
        file_size_bytes: file.size,
      });
    });
  };

  const onFileRemove = () => {
    setError(null);
    setBusy(true);
    startWork(async () => {
      const r = await removeCeFile(row.id);
      setBusy(false);
      if (!r.ok) return setError(r.error);
      onFileUpdate({ ...row, file_path: null, file_size_bytes: null });
    });
  };

  const onView = () => {
    setError(null);
    startWork(async () => {
      const r = await getCeFileSignedUrl(row.id);
      if (!r.ok) return setError(r.error);
      window.open(r.url, "_blank", "noopener,noreferrer");
    });
  };

  const licenseTypeLabel = row.license_type
    ? LICENSE_TYPES.find((o) => o.value === row.license_type)?.label ??
      row.license_type
    : null;

  return (
    <li className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#14233F]">
            {row.course_name}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
            <span className="font-medium text-[#4D7A60]">
              {Number(row.hours_credit).toFixed(1)} hrs
            </span>
            <span className="text-slate-300">·</span>
            <span>
              {new Date(`${row.completion_date}T00:00:00Z`).toLocaleDateString(
                "en-US",
                {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                }
              )}
            </span>
            {row.provider && (
              <>
                <span className="text-slate-300">·</span>
                <span>{row.provider}</span>
              </>
            )}
            {row.category && (
              <>
                <span className="text-slate-300">·</span>
                <span>{row.category}</span>
              </>
            )}
            {licenseTypeLabel && (
              <>
                <span className="text-slate-300">·</span>
                <span>{licenseTypeLabel}</span>
              </>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {row.file_path ? (
              <>
                <button
                  type="button"
                  onClick={onView}
                  className="inline-flex items-center gap-1 rounded-md border border-[#4D7A60]/30 bg-[#F7F4ED] px-2 py-1 text-xs font-medium text-[#14233F] hover:border-[#4D7A60]"
                >
                  <Download className="size-3.5" />
                  View certificate
                </button>
                <button
                  type="button"
                  onClick={onFileRemove}
                  disabled={busy}
                  className="text-xs text-slate-500 hover:text-red-700 disabled:opacity-50"
                >
                  Remove file
                </button>
              </>
            ) : (
              <FilePicker onPick={onFileChosen} disabled={busy} />
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#14233F]"
            aria-label="Edit"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={onDeleteClick}
            disabled={busy}
            className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            aria-label="Delete"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 inline-flex items-center gap-1 text-xs text-red-700">
          <AlertCircle className="size-3.5" />
          {error}
        </p>
      )}
    </li>
  );
}

function FilePicker({
  onPick,
  disabled,
}: {
  onPick: (file: File) => void;
  disabled: boolean;
}) {
  return (
    <label
      className={`inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:border-[#4D7A60] hover:text-[#14233F] ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
    >
      <Paperclip className="size-3.5" />
      Attach certificate
      <input
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.currentTarget.value = "";
        }}
      />
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Editor (add + edit)
// ─────────────────────────────────────────────────────────────────────

function CeEditor({
  initial,
  onCancel,
  onSaved,
}: {
  initial: CeRow | null;
  onCancel: () => void;
  onSaved: (next: CeRow) => void;
}) {
  const [courseName, setCourseName] = useState(initial?.course_name ?? "");
  const [provider, setProvider] = useState(initial?.provider ?? "");
  const [hours, setHours] = useState<string>(
    initial ? String(initial.hours_credit) : ""
  );
  const [category, setCategory] = useState(initial?.category ?? "");
  const [completionDate, setCompletionDate] = useState(
    initial?.completion_date ?? new Date().toISOString().slice(0, 10)
  );
  const [licenseType, setLicenseType] = useState<string | "">(
    initial?.license_type ?? ""
  );
  const [, startSaving] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = () => {
    setError(null);
    const hoursNum = Number.parseFloat(hours);
    if (!Number.isFinite(hoursNum) || hoursNum <= 0) {
      setError("Enter a valid CE hours value.");
      return;
    }

    const input: CeInput = {
      course_name: courseName,
      provider: provider.trim() || null,
      hours_credit: hoursNum,
      category: category.trim() || null,
      completion_date: completionDate,
      license_type: licenseType || null,
    };

    setSaving(true);
    startSaving(async () => {
      if (initial) {
        const r = await updateCeEntry(initial.id, input);
        setSaving(false);
        if (!r.ok) return setError(r.error);
        onSaved({
          ...initial,
          course_name: input.course_name.trim(),
          provider: input.provider,
          hours_credit: input.hours_credit,
          category: input.category,
          completion_date: input.completion_date,
          license_type: input.license_type,
        });
      } else {
        const r = await addCeEntry(input);
        setSaving(false);
        if (!r.ok) return setError(r.error);
        onSaved({
          id: r.id,
          course_name: input.course_name.trim(),
          provider: input.provider,
          hours_credit: input.hours_credit,
          category: input.category,
          completion_date: input.completion_date,
          license_type: input.license_type,
          file_path: null,
          file_size_bytes: null,
          created_at: new Date().toISOString(),
        });
      }
    });
  };

  return (
    <div className="rounded-md border border-[#4D7A60]/40 bg-[#F7F4ED] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-[#14233F]">
          {initial ? "Edit CE entry" : "Add CE entry"}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-[#14233F]"
          aria-label="Cancel"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-700">
            Course name <span className="text-red-600">*</span>
          </span>
          <input
            type="text"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            placeholder="e.g. Implant placement masterclass"
            maxLength={200}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#4D7A60] focus:outline-none focus:ring-1 focus:ring-[#4D7A60]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-700">
            CE hours <span className="text-red-600">*</span>
          </span>
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0.5"
            max="100"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="2"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#4D7A60] focus:outline-none focus:ring-1 focus:ring-[#4D7A60]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-700">
            Completion date <span className="text-red-600">*</span>
          </span>
          <input
            type="date"
            value={completionDate}
            onChange={(e) => setCompletionDate(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#4D7A60] focus:outline-none focus:ring-1 focus:ring-[#4D7A60]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-700">
            Provider
          </span>
          <input
            type="text"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder="AGD PACE · CE Zoom · …"
            maxLength={120}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#4D7A60] focus:outline-none focus:ring-1 focus:ring-[#4D7A60]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-700">
            Category
          </span>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            list="ce-categories"
            placeholder="Implants · Endo · Infection control · …"
            maxLength={80}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#4D7A60] focus:outline-none focus:ring-1 focus:ring-[#4D7A60]"
          />
          <datalist id="ce-categories">
            {COMMON_CE_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-700">
            Counts toward (optional)
          </span>
          <select
            value={licenseType}
            onChange={(e) => setLicenseType(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#4D7A60] focus:outline-none focus:ring-1 focus:ring-[#4D7A60]"
          >
            <option value="">Not tied to a specific license</option>
            {LICENSE_TYPES.map((lt) => (
              <option key={lt.value} value={lt.value}>
                {lt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p
          role="alert"
          className="mt-3 inline-flex items-center gap-1 text-xs text-red-700"
        >
          <AlertCircle className="size-3.5" />
          {error}
        </p>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-md bg-[#14233F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0d172b] disabled:opacity-50"
        >
          {saving ? (
            "Saving…"
          ) : (
            <>
              <Sparkles className="size-3.5" />
              {initial ? "Save changes" : "Add CE entry"}
            </>
          )}
        </button>
      </div>
      {!initial && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500">
          <FileText className="size-3.5" />
          Add the entry first, then attach the certificate file from the row
          actions.
        </p>
      )}
    </div>
  );
}
