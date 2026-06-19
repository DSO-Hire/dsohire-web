"use client";

/**
 * <RowActionsMenu> — overflow menu on each per-row card on
 * /candidate/applications (Phase 4.4 row actions).
 *
 * Three actions:
 *   • Withdraw (opens reason-chip modal)
 *   • Update my status (opens self-report mini-picker)
 *   • Hide (one-click; flash confirmation)
 *
 * Mounted inline inside the per-row link card — uses stopPropagation()
 * on the trigger so a click on the menu doesn't navigate to the
 * application detail page.
 */

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  MoreVertical,
  X,
  Loader2,
  Sparkles,
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  XCircle,
  TrendingUp,
} from "lucide-react";
import {
  withdrawApplication,
  updateSelfReportedStatus,
  toggleHideApplication,
} from "./row-actions";
import {
  WITHDRAW_REASON_CHIPS,
  SELF_REPORTED_OPTIONS,
  type SelfReportedStatus,
} from "./row-actions-data";

interface RowActionsMenuProps {
  applicationId: string;
  /** Current stage kind — controls which actions are enabled. */
  currentStatus: string;
  /** Whether the row is currently hidden (drives Hide / Restore label). */
  isHidden: boolean;
  /** Current self-reported status, if any. */
  currentSelfReported: SelfReportedStatus | null;
}

type OpenSheet = "withdraw" | "self-report" | null;

export function RowActionsMenu({
  applicationId,
  currentStatus,
  isHidden,
  currentSelfReported,
}: RowActionsMenuProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);
  const [, startWork] = useTransition();
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const onHide = (hide: boolean) => {
    setMenuOpen(false);
    setBusy(true);
    startWork(async () => {
      const result = await toggleHideApplication({
        applicationId,
        hide,
      });
      setBusy(false);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      router.refresh();
    });
  };

  const isClosed =
    currentStatus === "hired" ||
    currentStatus === "rejected" ||
    currentStatus === "withdrawn";

  return (
    <>
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          disabled={busy}
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          aria-label="Application actions"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MoreVertical className="size-4" />
          )}
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-md border border-border bg-popover shadow-xl"
            onClick={(e) => {
              // Stop the menu's click from bubbling up to the link card.
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {/* Update my status — disabled for closed applications */}
            <MenuItem
              icon={<TrendingUp className="size-4" />}
              label={
                currentSelfReported
                  ? "Update my status"
                  : "Update my status…"
              }
              onClick={() => {
                setMenuOpen(false);
                setOpenSheet("self-report");
              }}
              disabled={isClosed && currentStatus !== "withdrawn"}
            />

            {/* Withdraw — only when not already withdrawn/closed */}
            {!isClosed && (
              <MenuItem
                icon={<XCircle className="size-4 text-danger" />}
                label="Withdraw application"
                tone="danger"
                onClick={() => {
                  setMenuOpen(false);
                  setOpenSheet("withdraw");
                }}
              />
            )}

            <div className="border-t border-border" />

            {/* Hide / Restore */}
            <MenuItem
              icon={
                isHidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />
              }
              label={isHidden ? "Restore from Hidden" : "Hide from my list"}
              onClick={() => onHide(!isHidden)}
            />
          </div>
        )}
      </div>

      {openSheet === "withdraw" && (
        <WithdrawSheet
          applicationId={applicationId}
          onClose={() => setOpenSheet(null)}
        />
      )}
      {openSheet === "self-report" && (
        <SelfReportSheet
          applicationId={applicationId}
          current={currentSelfReported}
          onClose={() => setOpenSheet(null)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Menu item
// ─────────────────────────────────────────────────────────────────────

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(e) => {
        // Defensive — the parent menu div also stops propagation, but
        // belt-and-suspenders here in case React's event ordering
        // surprises us. Never let a menu click navigate the row's Link.
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
        tone === "danger"
          ? "text-danger hover:bg-danger-bg"
          : "text-foreground hover:bg-muted"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <span className="text-muted-foreground">{icon}</span>
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Withdraw sheet
// ─────────────────────────────────────────────────────────────────────

function WithdrawSheet({
  applicationId,
  onClose,
}: {
  applicationId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [chips, setChips] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [, startWork] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleChip = (value: string) => {
    setChips((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]
    );
  };

  const onConfirm = () => {
    setError(null);
    setBusy(true);
    startWork(async () => {
      const result = await withdrawApplication({
        applicationId,
        reasonChips: chips,
        reasonText: text,
      });
      setBusy(false);
      if (!result.ok) return setError(result.error);
      router.refresh();
      onClose();
    });
  };

  return (
    <Sheet onClose={busy ? () => {} : onClose} title="Withdraw application">
      <p className="text-sm text-muted-foreground">
        The DSO will see your application moved to{" "}
        <strong className="text-foreground">Withdrawn</strong>. Your reason
        below stays private — they never see why.
      </p>
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">
          Why are you withdrawing? <span className="text-meta-foreground">(optional)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {WITHDRAW_REASON_CHIPS.map((chip) => {
            const selected = chips.includes(chip.value);
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => toggleChip(chip.value)}
                disabled={busy}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  selected
                    ? "border-heritage bg-heritage/10 text-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted"
                } disabled:opacity-50`}
              >
                {selected && <Check className="mr-1 inline size-3" />}
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-foreground">
          Anything else? <span className="text-meta-foreground">(optional)</span>
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Helps us improve the platform — never shared with the DSO."
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm focus:border-heritage focus:outline-none focus:ring-1 focus:ring-heritage"
        />
      </label>
      <div className="rounded-md bg-warning-bg px-3 py-2 text-xs text-warning">
        <AlertCircle className="mr-1 inline size-3.5" />
        Re-applying to the same job is locked for 30 days after you withdraw.
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-danger px-4 py-2 text-sm font-semibold text-danger-foreground hover:bg-danger/90 disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Withdrawing…
            </>
          ) : (
            "Withdraw"
          )}
        </button>
      </div>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Self-report sheet
// ─────────────────────────────────────────────────────────────────────

function SelfReportSheet({
  applicationId,
  current,
  onClose,
}: {
  applicationId: string;
  current: SelfReportedStatus | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<SelfReportedStatus | null>(current);
  const [, startWork] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConfirm = () => {
    setError(null);
    setBusy(true);
    startWork(async () => {
      const result = await updateSelfReportedStatus({
        applicationId,
        status: selected,
      });
      setBusy(false);
      if (!result.ok) return setError(result.error);
      router.refresh();
      onClose();
    });
  };

  return (
    <Sheet onClose={busy ? () => {} : onClose} title="Update my status">
      <p className="text-sm text-muted-foreground">
        Tell us where you are — the employer&apos;s view of your status
        doesn&apos;t change. Useful when you&apos;ve heard back outside the
        platform.
      </p>
      <div className="space-y-2">
        {SELF_REPORTED_OPTIONS.map((opt) => (
          <label
            key={String(opt.value)}
            className={`block cursor-pointer rounded-md border p-3 text-sm transition ${
              selected === opt.value
                ? "border-heritage bg-heritage/10 text-foreground"
                : "border-border bg-card hover:border-border-2"
            }`}
          >
            <input
              type="radio"
              name="self_status"
              checked={selected === opt.value}
              onChange={() => setSelected(opt.value)}
              className="sr-only"
            />
            <span className="font-medium">{opt.label}</span>
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              Save
            </>
          )}
        </button>
      </div>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Lightweight sheet (mobile full-viewport, desktop centered)
// ─────────────────────────────────────────────────────────────────────

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Lock body scroll while sheet is open.
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:p-6"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        tabIndex={-1}
      />
      <div className="relative z-10 flex h-full w-full flex-col overflow-hidden bg-card shadow-2xl sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-[520px] sm:rounded-lg">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
          <h2 className="font-display text-lg font-bold text-foreground">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}
