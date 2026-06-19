"use client";

/**
 * Saved searches list (Phase 4.3.e v1).
 *
 * v1 supports edit-name + change-frequency + delete. Creation lives on
 * /candidate/jobs (the future "Save this search" button when the
 * candidate-side jobs route lands in Phase 4.6.c). For now the empty
 * state nudges the candidate over to /candidate/jobs to set up filters
 * they'd want saved.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Bell,
  BellOff,
  Pencil,
  Trash2,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import {
  updateSavedSearchFrequency,
  renameSavedSearch,
  deleteSavedSearch,
} from "./actions";

export interface SavedSearch {
  id: string;
  name: string;
  filter_state: Record<string, unknown>;
  frequency: "instant" | "daily" | "weekly" | "off";
  last_dispatched_at: string | null;
  created_at: string;
  updated_at: string;
}

const FREQUENCY_OPTIONS: ReadonlyArray<{
  value: SavedSearch["frequency"];
  label: string;
}> = [
  { value: "instant", label: "Instant" },
  { value: "daily", label: "Daily digest" },
  { value: "weekly", label: "Weekly digest" },
  { value: "off", label: "Off (saved, no alerts)" },
];

export function SavedSearches({ initial }: { initial: SavedSearch[] }) {
  const [items, setItems] = useState(initial);

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-6 text-center">
        <p className="text-sm text-foreground">
          You don&apos;t have any saved searches yet.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Save searches from the jobs list to get alerts when new matching
          jobs land.
        </p>
        <Link
          href="/candidate/jobs"
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Browse jobs
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((search) => (
        <SavedSearchRow
          key={search.id}
          search={search}
          onUpdate={(updated) => {
            setItems((prev) =>
              prev.map((it) => (it.id === updated.id ? updated : it))
            );
          }}
          onRemove={(id) => {
            setItems((prev) => prev.filter((it) => it.id !== id));
          }}
        />
      ))}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────────────

function SavedSearchRow({
  search,
  onUpdate,
  onRemove,
}: {
  search: SavedSearch;
  onUpdate: (updated: SavedSearch) => void;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(search.name);
  const [, startWork] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSaveName = () => {
    setError(null);
    setBusy(true);
    startWork(async () => {
      const result = await renameSavedSearch(search.id, draftName);
      setBusy(false);
      if (!result.ok) return setError(result.error);
      onUpdate({ ...search, name: draftName.trim() });
      setEditing(false);
    });
  };

  const onChangeFrequency = (next: SavedSearch["frequency"]) => {
    setError(null);
    setBusy(true);
    startWork(async () => {
      const result = await updateSavedSearchFrequency(search.id, next);
      setBusy(false);
      if (!result.ok) return setError(result.error);
      onUpdate({ ...search, frequency: next });
    });
  };

  const onDelete = () => {
    if (!confirm(`Remove saved search "${search.name}"?`)) return;
    setError(null);
    setBusy(true);
    startWork(async () => {
      const result = await deleteSavedSearch(search.id);
      setBusy(false);
      if (!result.ok) return setError(result.error);
      onRemove(search.id);
    });
  };

  return (
    <li className="rounded-md border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                autoFocus
                maxLength={80}
                className="flex-1 rounded-md border border-border px-2 py-1 text-sm focus:border-heritage focus:outline-none focus:ring-1 focus:ring-heritage"
              />
              <button
                type="button"
                onClick={onSaveName}
                disabled={busy || !draftName.trim()}
                className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                aria-label="Save name"
              >
                <Check className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraftName(search.name);
                }}
                disabled={busy}
                className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground disabled:opacity-50"
                aria-label="Cancel rename"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">{search.name}</p>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-meta-foreground hover:text-foreground"
                aria-label="Rename"
              >
                <Pencil className="size-3.5" />
              </button>
            </div>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {summarizeFilters(search.filter_state)}
          </p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="text-muted-foreground hover:text-danger disabled:opacity-50"
          aria-label="Delete saved search"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          {search.frequency === "off" ? (
            <BellOff className="size-3.5" />
          ) : (
            <Bell className="size-3.5" />
          )}
          Alerts:
        </span>
        {FREQUENCY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChangeFrequency(opt.value)}
            disabled={busy}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              search.frequency === opt.value
                ? "border-heritage bg-heritage/10 text-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            } disabled:opacity-50`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-2 inline-flex items-center gap-1 text-xs text-danger">
          <AlertCircle className="size-3" /> {error}
        </p>
      )}

      {search.last_dispatched_at && (
        <p className="mt-2 text-xs text-meta-foreground">
          Last alert {new Date(search.last_dispatched_at).toLocaleDateString()}
        </p>
      )}
    </li>
  );
}

function summarizeFilters(state: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(state)) {
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    parts.push(`${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
  }
  return parts.length === 0 ? "All jobs" : parts.join(" · ");
}
