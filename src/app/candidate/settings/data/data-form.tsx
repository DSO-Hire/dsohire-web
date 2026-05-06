"use client";

/**
 * Data & Account tab client UI (Phase 4.3.f).
 *
 * Four sections:
 *   1. Download my data — calls exportMyData server action, drops a
 *      JSON file into the browser. v1: synchronous. v2 (future): async
 *      ZIP via background job + 24h email link.
 *   2. Application history — link to /candidate/applications.
 *   3. Withdraw active applications — link to filtered list.
 *   4. Delete account — multi-step confirmation modal with type-DELETE
 *      gate + pre-delete export prompt + soft-delete kicked off; user
 *      is signed out and routed to a confirmation page.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  FileText,
  ArrowRight,
  AlertTriangle,
  Loader2,
  X,
  ShieldAlert,
} from "lucide-react";
import {
  exportMyData,
  softDeleteAccount,
  type ExportPayload,
} from "./actions";

interface DataFormProps {
  candidateEmail: string | null;
  candidateName: string | null;
}

export function DataForm({ candidateEmail, candidateName }: DataFormProps) {
  return (
    <div className="space-y-6">
      <DownloadMyDataSection email={candidateEmail} />
      <ApplicationHistorySection />
      <WithdrawApplicationsSection />
      <DeleteAccountSection name={candidateName} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section 1 — Download my data
// ─────────────────────────────────────────────────────────────────────

function DownloadMyDataSection({ email }: { email: string | null }) {
  const [, startWork] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadedAt, setDownloadedAt] = useState<Date | null>(null);

  const onDownload = () => {
    setError(null);
    setBusy(true);
    startWork(async () => {
      const result = await exportMyData();
      setBusy(false);
      if (!result.ok) return setError(result.error);
      triggerJsonDownload(result.payload, email);
      setDownloadedAt(new Date());
    });
  };

  return (
    <SectionCard
      icon={<Download className="size-5 text-[#4D7A60]" />}
      title="Download my data"
      description="Pull a JSON file with every row tied to your DSO Hire account — profile, work history, education, licenses, certifications, applications, notification preferences, and your block list."
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onDownload}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-[#14233F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d172b] disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Building export…
            </>
          ) : (
            <>
              <Download className="size-4" />
              Download JSON
            </>
          )}
        </button>
        {downloadedAt && (
          <span className="text-xs text-slate-500">
            Downloaded {downloadedAt.toLocaleTimeString()}.
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Coming soon: async ZIP via background job, with a 24-hour
        download link emailed to you. JSON works today and contains the
        same data.
      </p>
    </SectionCard>
  );
}

function triggerJsonDownload(payload: ExportPayload, _email: string | null) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  a.download = `dsohire-export-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────
// Section 2 — Application history (deep link)
// ─────────────────────────────────────────────────────────────────────

function ApplicationHistorySection() {
  return (
    <SectionCard
      icon={<FileText className="size-5 text-[#4D7A60]" />}
      title="Application history"
      description="Every job you've applied to, with the current status."
    >
      <Link
        href="/candidate/applications"
        className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Open my applications
        <ArrowRight className="size-3.5" />
      </Link>
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section 3 — Withdraw applications
// ─────────────────────────────────────────────────────────────────────

function WithdrawApplicationsSection() {
  return (
    <SectionCard
      icon={<X className="size-5 text-[#4D7A60]" />}
      title="Withdraw active applications"
      description="Pulled-in candidates and inactive seekers handle this differently. Use the per-application withdraw on the applications list."
    >
      <Link
        href="/candidate/applications?status=active"
        className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Open active applications
        <ArrowRight className="size-3.5" />
      </Link>
      <p className="mt-2 text-xs text-slate-500">
        Bulk withdraw lands in a follow-up. For now, withdraw
        per-application on the list view.
      </p>
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section 4 — Delete account
// ─────────────────────────────────────────────────────────────────────

function DeleteAccountSection({ name }: { name: string | null }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <section className="border border-red-200 bg-red-50/30 p-6 sm:p-8">
      <header className="mb-3 flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-red-100">
          <ShieldAlert className="size-5 text-red-700" />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-[#14233F]">
            Delete my account
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Soft-deleted immediately, hard-deleted 30 days later. You
            can&apos;t apply to jobs while soft-deleted, and your profile
            is hidden from every employer. Email cam@dsohire.com within
            30 days to undo.
          </p>
        </div>
      </header>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:border-red-400 hover:bg-red-50"
      >
        Delete account
      </button>

      {confirmOpen && (
        <DeleteAccountModal
          name={name}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Multi-step delete confirmation
// ─────────────────────────────────────────────────────────────────────

function DeleteAccountModal({
  name,
  onClose,
}: {
  name: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"export-prompt" | "confirm" | "done">(
    "export-prompt"
  );
  const [confirmText, setConfirmText] = useState("");
  const [, startWork] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hardDeleteOn, setHardDeleteOn] = useState<string | null>(null);

  const onExportFirst = () => {
    setError(null);
    setBusy(true);
    startWork(async () => {
      const result = await exportMyData();
      setBusy(false);
      if (!result.ok) return setError(result.error);
      triggerJsonDownload(result.payload, null);
      setStep("confirm");
    });
  };

  const onSkipExport = () => {
    setStep("confirm");
  };

  const onConfirmDelete = () => {
    setError(null);
    if (confirmText.trim().toUpperCase() !== "DELETE") {
      setError("Please type DELETE to confirm.");
      return;
    }
    setBusy(true);
    startWork(async () => {
      const result = await softDeleteAccount(confirmText);
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
      aria-label="Delete account"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={closeAndRedirectIfDeleted}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        tabIndex={-1}
      />
      <div className="relative z-10 w-full max-w-[480px] overflow-hidden rounded-lg bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-display text-lg font-bold text-[#14233F]">
            {step === "export-prompt"
              ? "First — download a copy?"
              : step === "confirm"
                ? "Last step"
                : "Account scheduled for deletion"}
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
                30-day grace period ends. Want to download a JSON copy
                first?
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onExportFirst}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-md bg-[#14233F] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#0d172b] disabled:opacity-60"
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
                  {name ? `Hi ${name}. ` : ""}
                  Deleting your account hides your profile + applications
                  from every DSO. Hard delete in 30 days.
                </span>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-800">
                  Type <code className="rounded bg-slate-100 px-1 py-0.5 text-xs font-semibold text-red-700">DELETE</code> to confirm
                </span>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoFocus
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
                    "Delete my account"
                  )}
                </button>
              </div>
            </>
          )}

          {step === "done" && hardDeleteOn && (
            <>
              <p className="text-sm text-slate-700">
                Your account is soft-deleted. We&apos;ll hard-delete it on{" "}
                <strong>
                  {new Date(hardDeleteOn).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </strong>
                . Email{" "}
                <a
                  href="mailto:cam@dsohire.com?subject=Restore%20my%20DSO%20Hire%20account"
                  className="font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
                >
                  cam@dsohire.com
                </a>{" "}
                before then to undo.
              </p>
              <button
                type="button"
                onClick={closeAndRedirectIfDeleted}
                className="inline-flex items-center gap-2 rounded-md bg-[#14233F] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#0d172b]"
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

// ─────────────────────────────────────────────────────────────────────
// Shared section card
// ─────────────────────────────────────────────────────────────────────

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[var(--rule)] bg-white p-6 sm:p-8">
      <header className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#4D7A60]/10">
          {icon}
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-[#14233F]">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">{description}</p>
        </div>
      </header>
      <div>{children}</div>
    </section>
  );
}
