"use client";

/**
 * Employer Data & Deletion client form (Phase 4.5.g).
 *
 * Two sections:
 *   1. Download org data — ZIP export, owner-only.
 *   2. Delete this DSO — multi-step confirmation modal:
 *      • Step 1: pre-delete export prompt (highly recommended)
 *      • Step 2: Type DSO name + DELETE gate
 *      • Step 3: Done — Stripe canceled, signed out, redirected
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Loader2,
  X,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import { exportOrgData, softDeleteOrg } from "./actions";

export function DataForm({ dsoName }: { dsoName: string }) {
  return (
    <div className="space-y-6">
      <DownloadOrgDataSection />
      <DeleteOrgSection dsoName={dsoName} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section 1 — Download org data
// ─────────────────────────────────────────────────────────────────────

function DownloadOrgDataSection() {
  const [, startWork] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadedAt, setDownloadedAt] = useState<Date | null>(null);
  const [missingCount, setMissingCount] = useState(0);

  const onDownload = () => {
    setError(null);
    setMissingCount(0);
    setBusy(true);
    startWork(async () => {
      const result = await exportOrgData();
      setBusy(false);
      if (!result.ok) return setError(result.error);
      triggerZipDownload(result.zipBytes, result.filename);
      setMissingCount(result.fetchFailures.length);
      setDownloadedAt(new Date());
    });
  };

  return (
    <section className="border border-[var(--rule)] bg-white p-6 sm:p-8">
      <header className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#4D7A60]/10">
          <Download className="size-5 text-[#4D7A60]" />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-ink">
            Download organization data
          </h2>
          <p className="mt-0.5 text-sm text-slate-body">
            Pull a ZIP with every job posting, application, screening
            response, comment, scorecard, status event, message, team
            member, location, email template, subscription record, and
            invoice — plus your DSO logo + per-location logos + photo
            gallery.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onDownload}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-ivory hover:bg-ink-soft disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Building export…
            </>
          ) : (
            <>
              <Download className="size-4" />
              Download ZIP
            </>
          )}
        </button>
        {downloadedAt && (
          <span className="text-xs text-slate-meta">
            Downloaded {downloadedAt.toLocaleTimeString()}.
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {missingCount > 0 && (
        <p role="status" className="mt-3 text-xs text-amber-700">
          {missingCount} file{missingCount === 1 ? "" : "s"} couldn&apos;t be
          fetched. See MISSING_FILES.txt inside the ZIP for details.
        </p>
      )}
      <p className="mt-3 text-xs text-slate-meta">
        Excluded: candidate-uploaded resumes (those are owned by the
        candidate; they have their own export). Async build via background
        job for very large exports lands in a follow-up.
      </p>
    </section>
  );
}

function triggerZipDownload(zipBytes: ArrayBuffer, filename: string) {
  const blob = new Blob([zipBytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────
// Section 2 — Delete this DSO
// ─────────────────────────────────────────────────────────────────────

function DeleteOrgSection({ dsoName }: { dsoName: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <section className="border border-red-200 bg-red-50/30 p-6 sm:p-8">
      <header className="mb-3 flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-red-100">
          <ShieldAlert className="size-5 text-red-700" />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-ink">
            Delete this organization
          </h2>
          <p className="mt-0.5 text-sm text-slate-body">
            Soft-deleted immediately, hard-deleted 30 days later. Your team
            members lose access right away. Any active Stripe subscription
            cancels at the end of its current period. Email
            cam@dsohire.com within 30 days to undo.
          </p>
        </div>
      </header>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:border-red-400 hover:bg-red-50"
      >
        Delete {dsoName}
      </button>

      {confirmOpen && (
        <DeleteOrgModal
          dsoName={dsoName}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Multi-step delete confirmation
// ─────────────────────────────────────────────────────────────────────

function DeleteOrgModal({
  dsoName,
  onClose,
}: {
  dsoName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"export-prompt" | "confirm" | "done">(
    "export-prompt"
  );
  const [confirmText, setConfirmText] = useState("");
  const [nameTyped, setNameTyped] = useState("");
  const [, startWork] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hardDeleteOn, setHardDeleteOn] = useState<string | null>(null);

  const onExportFirst = () => {
    setError(null);
    setBusy(true);
    startWork(async () => {
      const result = await exportOrgData();
      setBusy(false);
      if (!result.ok) return setError(result.error);
      triggerZipDownload(result.zipBytes, result.filename);
      setStep("confirm");
    });
  };

  const onSkipExport = () => {
    setStep("confirm");
  };

  const onConfirmDelete = () => {
    setError(null);
    if (confirmText.trim().toUpperCase() !== "DELETE") {
      setError("Please type DELETE in the confirm field.");
      return;
    }
    if (nameTyped.trim().toLowerCase() !== dsoName.trim().toLowerCase()) {
      setError(`Type the DSO name exactly ("${dsoName}") to confirm.`);
      return;
    }
    setBusy(true);
    startWork(async () => {
      const result = await softDeleteOrg({
        confirmation: confirmText,
        dsoNameTyped: nameTyped,
      });
      setBusy(false);
      if (!result.ok) return setError(result.error);
      setHardDeleteOn(result.hardDeleteOn);
      setStep("done");
    });
  };

  const closeAndRedirectIfDeleted = () => {
    if (step === "done") {
      router.push("/");
      router.refresh();
    } else {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Delete organization"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={closeAndRedirectIfDeleted}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        tabIndex={-1}
      />
      <div className="relative z-10 w-full max-w-[520px] overflow-hidden rounded-lg bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-display text-lg font-bold text-ink">
            {step === "export-prompt"
              ? "Download a copy first?"
              : step === "confirm"
                ? "Last step"
                : "Organization scheduled for deletion"}
          </h2>
          <button
            type="button"
            onClick={closeAndRedirectIfDeleted}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5">
          {step === "export-prompt" && (
            <>
              <p className="text-sm text-slate-700">
                Once you delete, we can&apos;t restore your data after the
                30-day grace period ends. Strongly recommended: download a
                ZIP copy first.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onExportFirst}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-md bg-ink px-3 py-1.5 text-sm font-semibold text-ivory hover:bg-ink-soft disabled:opacity-60"
                >
                  {busy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Downloading…
                    </>
                  ) : (
                    <>
                      <Download className="size-4" />
                      Download then continue
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onSkipExport}
                  disabled={busy}
                  className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
                >
                  Skip — continue to delete
                </button>
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
            </>
          )}

          {step === "confirm" && (
            <>
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  Deleting <strong>{dsoName}</strong> hides every job posting,
                  removes team access, and cancels your Stripe subscription
                  at the end of the current billing period. Hard delete in
                  30 days.
                </span>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-800">
                  Type the DSO name (
                  <code className="rounded bg-slate-100 px-1 py-0.5 text-xs font-semibold text-ink">
                    {dsoName}
                  </code>
                  ) to confirm
                </span>
                <input
                  type="text"
                  value={nameTyped}
                  onChange={(e) => setNameTyped(e.target.value)}
                  autoFocus
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-800">
                  Type{" "}
                  <code className="rounded bg-slate-100 px-1 py-0.5 text-xs font-semibold text-red-700">
                    DELETE
                  </code>{" "}
                  to confirm
                </span>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeAndRedirectIfDeleted}
                  disabled={busy}
                  className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onConfirmDelete}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-md bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                >
                  {busy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Deleting…
                    </>
                  ) : (
                    "Delete organization"
                  )}
                </button>
              </div>
            </>
          )}

          {step === "done" && hardDeleteOn && (
            <>
              <p className="text-sm text-slate-700">
                <strong>{dsoName}</strong> is soft-deleted. We&apos;ll
                hard-delete it on{" "}
                <strong>
                  {new Date(hardDeleteOn).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </strong>
                . Stripe will charge nothing further; your subscription
                cancels at the end of its current billing period. Email{" "}
                <a
                  href="mailto:cam@dsohire.com?subject=Restore%20my%20DSO%20Hire%20organization"
                  className="font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
                >
                  cam@dsohire.com
                </a>{" "}
                before then to undo.
              </p>
              <button
                type="button"
                onClick={closeAndRedirectIfDeleted}
                className="inline-flex items-center gap-2 rounded-md bg-ink px-3 py-1.5 text-sm font-semibold text-ivory hover:bg-ink-soft"
              >
                Got it — sign me out
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
