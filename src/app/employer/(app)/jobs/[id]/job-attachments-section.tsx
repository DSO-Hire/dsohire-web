"use client";

/**
 * Job attachments section — the editor UI shared by the wizard
 * and the edit page (E1.10 / Phase 5D, shipped 2026-05-11).
 *
 * Behavior:
 *   - List of existing attachments with display name + size + visibility
 *     pill (Public vs Applicants only).
 *   - Upload form with file picker, display-name input, hide-until-applied
 *     toggle. Cap status reflected in the disabled state + helper copy.
 *   - Delete + reorder (move up / move down). Drag-drop deferred to keep
 *     this surface small for v1; matches the kanban philosophy of "ship
 *     simple, layer DnD later if real demand."
 *   - Optimistic updates with useTransition + simple re-render via
 *     onMutated callback so the parent re-fetches.
 *
 * Layout language matches the other section cards in edit-sections.tsx:
 *   white card · 1px slate-200 border · 6pt rounded · 24px padding.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Paperclip,
  Upload,
  Trash2,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import {
  uploadJobAttachment,
  deleteJobAttachment,
  updateJobAttachment,
  reorderJobAttachments,
} from "./attachments-actions";

export interface JobAttachmentRow {
  id: string;
  display_name: string;
  file_size_bytes: number;
  mime_type: string;
  sort_order: number;
  hide_until_applied: boolean;
  created_at: string;
}

interface JobAttachmentsSectionProps {
  jobId: string;
  initialAttachments: JobAttachmentRow[];
  tierCap: number;
  tierLabel: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeLabel(mime: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("wordprocessingml")) return "DOCX";
  if (mime === "application/msword") return "DOC";
  if (mime.includes("spreadsheetml")) return "XLSX";
  if (mime === "application/vnd.ms-excel") return "XLS";
  if (mime.startsWith("image/")) return mime.split("/")[1].toUpperCase();
  return mime;
}

export function JobAttachmentsSection({
  jobId,
  initialAttachments,
  tierCap,
  tierLabel,
}: JobAttachmentsSectionProps) {
  const router = useRouter();
  const [attachments, setAttachments] =
    useState<JobAttachmentRow[]>(initialAttachments);
  const [displayName, setDisplayName] = useState("");
  const [hideUntilApplied, setHideUntilApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync local list to server source-of-truth when the RSC parent
  // re-renders (after router.refresh()). Without this useEffect, the
  // optimistic state would drift from the server after upload/delete.
  useEffect(() => {
    setAttachments(initialAttachments);
  }, [initialAttachments]);

  const atCap = attachments.length >= tierCap;
  const remaining = Math.max(0, tierCap - attachments.length);

  function handleUpload(formData: FormData) {
    setError(null);
    setSuccess(null);
    formData.set("job_id", jobId);
    formData.set("hide_until_applied", String(hideUntilApplied));
    if (displayName.trim()) {
      formData.set("display_name", displayName.trim());
    }

    startTransition(async () => {
      const result = await uploadJobAttachment(formData);
      if (!result.ok) {
        setError(result.error ?? "Upload failed.");
        return;
      }
      // Reset the form.
      if (fileInputRef.current) fileInputRef.current.value = "";
      setDisplayName("");
      setHideUntilApplied(false);
      setSuccess("Attachment uploaded.");
      // Re-render from server to pick up the canonical row + correct
      // sort_order assignment. router.refresh() re-runs the RSC parent
      // which re-fetches initialAttachments via the page-level loader.
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await deleteJobAttachment(id);
      if (!result.ok) {
        setError(result.error ?? "Delete failed.");
        return;
      }
      setAttachments((prev) => prev.filter((a) => a.id !== id));
      setSuccess("Attachment removed.");
    });
  }

  function handleToggleVisibility(att: JobAttachmentRow) {
    setError(null);
    setSuccess(null);
    const nextValue = !att.hide_until_applied;
    setAttachments((prev) =>
      prev.map((a) =>
        a.id === att.id ? { ...a, hide_until_applied: nextValue } : a
      )
    );
    startTransition(async () => {
      const result = await updateJobAttachment(att.id, {
        hide_until_applied: nextValue,
      });
      if (!result.ok) {
        setError(result.error ?? "Update failed.");
        // Revert.
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === att.id
              ? { ...a, hide_until_applied: att.hide_until_applied }
              : a
          )
        );
      }
    });
  }

  function handleMove(id: string, direction: -1 | 1) {
    const idx = attachments.findIndex((a) => a.id === id);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= attachments.length) return;
    const next = [...attachments];
    [next[idx], next[target]] = [next[target], next[idx]];
    setAttachments(next);
    startTransition(async () => {
      const result = await reorderJobAttachments(
        jobId,
        next.map((a) => a.id)
      );
      if (!result.ok) {
        setError(result.error ?? "Reorder failed.");
        setAttachments(attachments);
      }
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <header className="mb-4 flex items-start gap-3">
        <Paperclip className="mt-0.5 h-5 w-5 text-[#4D7A60]" aria-hidden />
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-[#14233F]">Attachments</h2>
          <p className="mt-1 text-sm text-slate-600">
            Upload supporting documents candidates can review before they
            apply &mdash; pro forma comp models, benefits PDFs, practice
            tour decks, schedule templates. Use the &quot;hidden until
            applied&quot; toggle to gate sensitive files until a candidate
            submits.
          </p>
        </div>
      </header>

      {attachments.length > 0 && (
        <ul className="mb-4 space-y-2">
          {attachments.map((att, idx) => (
            <li
              key={att.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <div className="flex w-8 flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => handleMove(att.id, -1)}
                  disabled={idx === 0 || pending}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-[#14233F] disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(att.id, 1)}
                  disabled={idx === attachments.length - 1 || pending}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-[#14233F] disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium text-[#14233F]">
                  {att.display_name}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                  <span>{mimeLabel(att.mime_type)}</span>
                  <span aria-hidden>&middot;</span>
                  <span>{formatSize(att.file_size_bytes)}</span>
                  <span aria-hidden>&middot;</span>
                  <button
                    type="button"
                    onClick={() => handleToggleVisibility(att)}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors disabled:cursor-not-allowed"
                    disabled={pending}
                    style={
                      att.hide_until_applied
                        ? {
                            color: "#B45309",
                            backgroundColor: "#FEF3C7",
                            boxShadow: "inset 0 0 0 1px #FDE68A",
                          }
                        : {
                            color: "#166534",
                            backgroundColor: "#DCFCE7",
                            boxShadow: "inset 0 0 0 1px #BBF7D0",
                          }
                    }
                  >
                    {att.hide_until_applied ? (
                      <>
                        <EyeOff className="h-3 w-3" /> Applicants only
                      </>
                    ) : (
                      <>
                        <Eye className="h-3 w-3" /> Public
                      </>
                    )}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(att.id)}
                disabled={pending}
                className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                aria-label="Delete attachment"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {atCap ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <strong>{tierLabel}</strong> tier caps at {tierCap} attachments
            per job. Delete an existing attachment to add a new one, or
            upgrade to lift the cap.
          </div>
        </div>
      ) : (
        <form action={handleUpload} className="space-y-3">
          <div>
            <label
              htmlFor="job-attachment-file"
              className="mb-1 block text-sm font-medium text-[#14233F]"
            >
              Add a file
            </label>
            <input
              id="job-attachment-file"
              ref={fileInputRef}
              name="file"
              type="file"
              accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp"
              required
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-[#14233F] file:mr-3 file:rounded-md file:border-0 file:bg-[#14233F] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-[#0e1a30]"
            />
            <p className="mt-1 text-xs text-slate-500">
              PDF, Word, Excel, or image. Up to 20 MB.
            </p>
          </div>

          <div>
            <label
              htmlFor="job-attachment-name"
              className="mb-1 block text-sm font-medium text-[#14233F]"
            >
              Display name <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="job-attachment-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Associate Comp Model 2026"
              maxLength={120}
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-[#14233F] placeholder:text-slate-400"
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-[#14233F]">
            <input
              type="checkbox"
              checked={hideUntilApplied}
              onChange={(e) => setHideUntilApplied(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#4D7A60] focus:ring-[#4D7A60]"
            />
            <span>
              <span className="font-medium">Hide until applied.</span>{" "}
              <span className="text-slate-600">
                Visible only to candidates who&apos;ve submitted an
                application. Use for sensitive comp models or anything
                you&apos;d rather not surface to casual browsers.
              </span>
            </span>
          </label>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-md bg-[#14233F] px-4 py-2 text-sm font-medium text-white hover:bg-[#0e1a30] disabled:opacity-60"
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading&hellip;
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Upload attachment
                </>
              )}
            </button>
            <span className="text-xs text-slate-500">
              {remaining} of {tierCap} {tierLabel} attachments remaining
            </span>
          </div>
        </form>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      {success && !error && (
        <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {success}
        </div>
      )}
    </section>
  );
}
