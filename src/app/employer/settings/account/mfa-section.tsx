"use client";

/**
 * MfaSection — 2FA TOTP UI surface on /employer/settings/account
 * (Phase 4.5.d / 2FA TOTP).
 *
 * Three sub-states:
 *   1. Not enrolled — "Set up 2FA" button opens the setup wizard.
 *   2. Enrolled    — Status pill + "Show recovery codes" + "Regenerate
 *                    codes" + "Disable 2FA". Each destructive flow
 *                    re-verifies a TOTP code first.
 *   3. Setting up  — Setup wizard takes over the section (Step 1 QR,
 *                    Step 2 verify, Step 3 recovery codes one-time view).
 *
 * Org-wide toggle (Enterprise) renders below as a separate sub-card.
 */

import { useEffect, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  Loader2,
  Lock,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  enrollTotp,
  verifyEnrollment,
  cancelEnrollment,
  disableMfa,
  regenerateRecoveryCodes,
  setOrgRequireMfa,
} from "./mfa-actions";

interface MfaSectionProps {
  initialEnrolled: boolean;
  remainingRecoveryCodes: number;
  isOwner: boolean;
  isEnterprise: boolean;
  initialRequireMfa: boolean;
  /** Verified factor id when enrolled — used to challenge before destructive actions. */
  initialFactorId: string | null;
}

export function MfaSection({
  initialEnrolled,
  remainingRecoveryCodes,
  isOwner,
  isEnterprise,
  initialRequireMfa,
  initialFactorId,
}: MfaSectionProps) {
  const [enrolled, setEnrolled] = useState(initialEnrolled);
  const [factorId, setFactorId] = useState<string | null>(initialFactorId);
  const [remainingCodes, setRemainingCodes] = useState(remainingRecoveryCodes);

  // "wizard" mode shows setup; "disable" mode shows the disable dialog;
  // "regen" mode shows the regenerate dialog. null = idle.
  const [mode, setMode] = useState<"wizard" | "disable" | "regen" | null>(
    null
  );

  return (
    <section className="border border-[var(--rule)] bg-white p-7 sm:p-8 space-y-6">
      <header>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Security
        </div>
        <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink mb-2 inline-flex items-center gap-2">
          <ShieldCheck className="size-5 text-heritage-deep" />
          Two-factor authentication
        </h2>
        <p className="text-[14px] text-slate-body leading-relaxed max-w-[600px]">
          Add a second step at sign-in using an authenticator app like 1Password,
          Authy, or Google Authenticator. We&apos;ll also issue 10 one-time recovery
          codes in case you lose access to your authenticator.
        </p>
      </header>

      {/* Idle states */}
      {mode === null && (
        <>
          {!enrolled ? (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <StatusPill enrolled={false} />
              <button
                type="button"
                onClick={() => setMode("wizard")}
                className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-ivory hover:bg-ink-soft"
              >
                <ShieldCheck className="size-3.5" />
                Set up 2FA
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <StatusPill
                  enrolled
                  remainingRecoveryCodes={remainingCodes}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("regen")}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--rule-strong)] bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-body hover:bg-cream/60 hover:text-ink"
                  >
                    <RotateCcw className="size-3.5" />
                    Regenerate codes
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("disable")}
                    className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="size-3.5" />
                    Disable 2FA
                  </button>
                </div>
              </div>
              {remainingCodes <= 3 && remainingCodes > 0 && (
                <p className="text-[12px] text-amber-700 inline-flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5" />
                  Only {remainingCodes} recovery {remainingCodes === 1 ? "code" : "codes"} left. Regenerate before you run out.
                </p>
              )}
              {remainingCodes === 0 && (
                <p className="text-[12px] text-red-700 inline-flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5" />
                  No recovery codes left. Regenerate now to avoid losing access if your authenticator is lost.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* Setup wizard */}
      {mode === "wizard" && (
        <SetupWizard
          onCancel={() => setMode(null)}
          onComplete={(newFactorId) => {
            setEnrolled(true);
            setFactorId(newFactorId);
            setRemainingCodes(10);
            setMode(null);
          }}
        />
      )}

      {/* Disable dialog */}
      {mode === "disable" && factorId && (
        <DisableDialog
          factorId={factorId}
          onCancel={() => setMode(null)}
          onComplete={() => {
            setEnrolled(false);
            setFactorId(null);
            setRemainingCodes(0);
            setMode(null);
          }}
        />
      )}

      {/* Regenerate dialog */}
      {mode === "regen" && factorId && (
        <RegenerateDialog
          factorId={factorId}
          onCancel={() => setMode(null)}
          onComplete={() => {
            setRemainingCodes(10);
            setMode(null);
          }}
        />
      )}

      {/* Org-wide enforcement (Enterprise + owner) */}
      {isOwner && (
        <OrgRequireMfaToggle
          isEnterprise={isEnterprise}
          initialEnabled={initialRequireMfa}
          ownerEnrolled={enrolled}
        />
      )}
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────
 * Status pill
 * ─────────────────────────────────────────────────────────── */

function StatusPill({
  enrolled,
  remainingRecoveryCodes,
}: {
  enrolled: boolean;
  remainingRecoveryCodes?: number;
}) {
  if (!enrolled) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-[var(--rule)] bg-cream/50 px-3 py-1 text-[12px] font-semibold text-slate-meta">
        <Lock className="size-3" />
        Not set up
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-heritage-deep/10 px-3 py-1 text-[12px] font-semibold text-heritage-deep">
      <ShieldCheck className="size-3" />
      Enabled · {remainingRecoveryCodes} recovery{" "}
      {remainingRecoveryCodes === 1 ? "code" : "codes"} left
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
 * Setup wizard — QR → verify → recovery codes
 * ─────────────────────────────────────────────────────────── */

function SetupWizard({
  onCancel,
  onComplete,
}: {
  onCancel: () => void;
  onComplete: (factorId: string) => void;
}) {
  const [step, setStep] = useState<"loading" | "qr" | "codes">("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();

  // Kick off enrollment on mount. Side effects belong in useEffect, not
  // in render — calling startTransition during render is unreliable in
  // React 19 (the transition can be dropped before the effect commits).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await enrollTotp();
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFactorId(result.factorId);
      setQrCode(result.qrCode);
      setSecret(result.secret);
      setStep("qr");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onVerify = () => {
    if (!factorId) return;
    setError(null);
    startTransition(async () => {
      const result = await verifyEnrollment({ factorId, code });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRecoveryCodes(result.recoveryCodes);
      setStep("codes");
    });
  };

  const onCancelClick = () => {
    if (factorId) {
      void cancelEnrollment({ factorId });
    }
    onCancel();
  };

  const onDoneCodes = () => {
    if (factorId) onComplete(factorId);
  };

  if (step === "loading") {
    if (error) {
      return (
        <div className="rounded border border-red-200 bg-red-50/60 p-5 space-y-3 text-sm">
          <p className="inline-flex items-center gap-2 font-semibold text-red-800">
            <AlertTriangle className="size-4" />
            Couldn&apos;t start 2FA setup
          </p>
          <p className="text-slate-body leading-relaxed">{error}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCancelClick}
              className="rounded-md border border-[var(--rule-strong)] bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-body hover:bg-cream/60 hover:text-ink"
            >
              Close
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-3 rounded border border-[var(--rule)] bg-cream/40 p-6 text-sm text-slate-body">
        <Loader2 className="size-4 animate-spin" />
        Generating your 2FA setup…
      </div>
    );
  }

  if (step === "qr" && qrCode && secret) {
    return (
      <div className="rounded border border-[var(--rule-strong)] bg-cream/40 p-6 space-y-5">
        <div>
          <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep mb-1">
            Step 1 of 2
          </div>
          <h3 className="font-display text-lg font-bold text-ink">
            Scan with your authenticator app
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-[200px_1fr]">
          <div className="rounded border border-[var(--rule)] bg-white p-3">
            {/* Supabase returns the QR as an SVG data URI in `qr_code`. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrCode}
              alt="Scan this QR code with your authenticator app"
              className="block w-full"
            />
          </div>
          <div className="space-y-3">
            <p className="text-[13px] text-slate-body leading-relaxed">
              Open your authenticator app (1Password, Authy, Google
              Authenticator, etc.) and scan the QR code on the left, or
              enter the setup key manually:
            </p>
            <div className="rounded border border-[var(--rule)] bg-white p-3 font-mono text-[12px] text-ink break-all">
              {secret}
            </div>
            <CopyButton value={secret} label="Copy setup key" />
          </div>
        </div>

        <div className="border-t border-[var(--rule)] pt-5 space-y-3">
          <div>
            <label
              htmlFor="totp-code"
              className="mb-1.5 block text-[12px] font-semibold text-ink"
            >
              Enter the 6-digit code from your app
            </label>
            <input
              id="totp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => {
                setError(null);
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
              }}
              maxLength={6}
              placeholder="123456"
              className="w-40 rounded border border-[var(--rule-strong)] bg-white px-3 py-2 font-mono text-[18px] tracking-[4px] text-ink focus:border-heritage focus:outline-none"
            />
          </div>
          {error && (
            <p className="text-[12px] text-red-700 inline-flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" />
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onVerify}
              disabled={pending || code.length !== 6}
              className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-ivory hover:bg-ink-soft disabled:opacity-40"
            >
              {pending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Verifying…
                </>
              ) : (
                "Verify and continue"
              )}
            </button>
            <button
              type="button"
              onClick={onCancelClick}
              className="rounded-md px-3 py-2 text-[12px] font-semibold text-slate-meta hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "codes" && recoveryCodes) {
    return (
      <div className="rounded border-2 border-heritage-deep bg-cream/40 p-6 space-y-5">
        <div>
          <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep mb-1 inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5" />
            Step 2 of 2 · 2FA enabled
          </div>
          <h3 className="font-display text-lg font-bold text-ink">
            Save your recovery codes somewhere safe
          </h3>
          <p className="mt-1.5 text-[13px] text-slate-body leading-relaxed">
            Each code works exactly once if you lose your authenticator.
            <strong className="text-ink"> This is the only time we&apos;ll show them.</strong>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded border border-[var(--rule)] bg-white p-4 sm:grid-cols-2">
          {recoveryCodes.map((c) => (
            <code
              key={c}
              className="font-mono text-[14px] tracking-[1px] text-ink"
            >
              {c}
            </code>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CopyButton value={recoveryCodes.join("\n")} label="Copy all codes" />
          <DownloadButton
            content={buildCodesFile(recoveryCodes)}
            filename="dsohire-recovery-codes.txt"
          />
          <button
            type="button"
            onClick={onDoneCodes}
            className="ml-auto inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-ivory hover:bg-ink-soft"
          >
            I&apos;ve saved my codes
          </button>
        </div>
      </div>
    );
  }

  return null;
}

/* ──────────────────────────────────────────────────────────────
 * Disable dialog
 * ─────────────────────────────────────────────────────────── */

function DisableDialog({
  factorId,
  onCancel,
  onComplete,
}: {
  factorId: string;
  onCancel: () => void;
  onComplete: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = () => {
    setError(null);
    startTransition(async () => {
      const result = await disableMfa({ factorId, code });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onComplete();
    });
  };

  return (
    <div className="rounded border border-red-200 bg-red-50/60 p-5 space-y-3">
      <div>
        <h3 className="font-semibold text-ink">Disable 2FA?</h3>
        <p className="mt-1 text-[13px] text-slate-body leading-relaxed">
          Enter the current 6-digit code from your authenticator to confirm.
          Your recovery codes will also be wiped.
        </p>
      </div>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => {
          setError(null);
          setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
        }}
        placeholder="123456"
        className="w-40 rounded border border-[var(--rule-strong)] bg-white px-3 py-2 font-mono text-[18px] tracking-[4px] text-ink focus:border-heritage focus:outline-none"
      />
      {error && (
        <p className="text-[12px] text-red-700">{error}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending || code.length !== 6}
          className="inline-flex items-center gap-2 rounded-md bg-red-700 px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-white hover:bg-red-800 disabled:opacity-40"
        >
          {pending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Disabling…
            </>
          ) : (
            "Yes, disable"
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-2 text-[12px] font-semibold text-slate-meta hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
 * Regenerate dialog
 * ─────────────────────────────────────────────────────────── */

function RegenerateDialog({
  factorId,
  onCancel,
  onComplete,
}: {
  factorId: string;
  onCancel: () => void;
  onComplete: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  const onSubmit = () => {
    setError(null);
    startTransition(async () => {
      const result = await regenerateRecoveryCodes({ factorId, code });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNewCodes(result.recoveryCodes);
    });
  };

  if (newCodes) {
    return (
      <div className="rounded border-2 border-heritage-deep bg-cream/40 p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-ink inline-flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-heritage-deep" />
            New recovery codes
          </h3>
          <p className="mt-1 text-[13px] text-slate-body leading-relaxed">
            Old codes are now invalid. Save these somewhere safe — this is
            the only time we&apos;ll show them.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded border border-[var(--rule)] bg-white p-4 sm:grid-cols-2">
          {newCodes.map((c) => (
            <code key={c} className="font-mono text-[14px] tracking-[1px] text-ink">
              {c}
            </code>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton value={newCodes.join("\n")} label="Copy all codes" />
          <DownloadButton
            content={buildCodesFile(newCodes)}
            filename="dsohire-recovery-codes.txt"
          />
          <button
            type="button"
            onClick={() => onComplete()}
            className="ml-auto inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-ivory hover:bg-ink-soft"
          >
            I&apos;ve saved them
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-[var(--rule-strong)] bg-cream/40 p-5 space-y-3">
      <div>
        <h3 className="font-semibold text-ink">Regenerate recovery codes?</h3>
        <p className="mt-1 text-[13px] text-slate-body leading-relaxed">
          Your old codes will stop working immediately. Enter the current
          6-digit code from your authenticator to continue.
        </p>
      </div>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => {
          setError(null);
          setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
        }}
        placeholder="123456"
        className="w-40 rounded border border-[var(--rule-strong)] bg-white px-3 py-2 font-mono text-[18px] tracking-[4px] text-ink focus:border-heritage focus:outline-none"
      />
      {error && <p className="text-[12px] text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending || code.length !== 6}
          className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-ivory hover:bg-ink-soft disabled:opacity-40"
        >
          {pending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Regenerating…
            </>
          ) : (
            "Generate new codes"
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-2 text-[12px] font-semibold text-slate-meta hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
 * Org-wide enforcement toggle (owner only — all paid tiers)
 *
 * Day 21 (2026-05-27): Enterprise gate dropped. Security best practice
 * for any DSO that wants its team mandated to enroll. The `isEnterprise`
 * prop is still threaded through for back-compat (parent server
 * component still computes it) but no longer drives UI behavior.
 * ─────────────────────────────────────────────────────────── */

function OrgRequireMfaToggle({
  initialEnabled,
  ownerEnrolled,
}: {
  isEnterprise: boolean;
  initialEnabled: boolean;
  ownerEnrolled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const onToggle = () => {
    if (!enabled && !ownerEnrolled) {
      setError("Enable 2FA on your own account first, then turn this on.");
      return;
    }
    setError(null);
    setFlash(null);
    const next = !enabled;
    startTransition(async () => {
      const result = await setOrgRequireMfa({ enabled: next });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEnabled(next);
      setFlash(
        next
          ? "Org-wide enforcement enabled. Every team member is required at next sign-in."
          : "Org-wide enforcement disabled."
      );
      setTimeout(() => setFlash(null), 3500);
    });
  };

  return (
    <div className="rounded border border-[var(--rule)] bg-cream/30 p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-ink inline-flex items-center gap-1.5">
            <Eye className="size-3.5" />
            Require 2FA for the whole DSO
          </h3>
          <p className="mt-1 text-[13px] text-slate-body leading-relaxed">
            When on, every member of your DSO must enable 2FA before they
            can use the app. Existing sessions are forced through enrollment
            at next sign-in. You can flip this off at any time.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={onToggle}
          disabled={pending}
          className={
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 " +
            (enabled ? "bg-heritage-deep" : "bg-slate-300")
          }
        >
          <span
            className={
              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform " +
              (enabled ? "translate-x-6" : "translate-x-1")
            }
          />
        </button>
      </div>
      {error && (
        <p className="text-[12px] text-red-700 inline-flex items-center gap-1.5">
          <AlertTriangle className="size-3.5" />
          {error}
        </p>
      )}
      {flash && (
        <p className="text-[12px] text-heritage-deep inline-flex items-center gap-1.5 font-semibold">
          <CheckCircle2 className="size-3.5" />
          {flash}
        </p>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
 * Tiny shared utilities
 * ─────────────────────────────────────────────────────────── */

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No-op — older browsers; the user can still select-and-copy.
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--rule-strong)] bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-body hover:bg-cream/60 hover:text-ink"
    >
      {copied ? (
        <>
          <CheckCircle2 className="size-3.5 text-heritage-deep" />
          Copied
        </>
      ) : (
        <>
          <Copy className="size-3.5" />
          {label}
        </>
      )}
    </button>
  );
}

function DownloadButton({
  content,
  filename,
}: {
  content: string;
  filename: string;
}) {
  const onDownload = () => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  return (
    <button
      type="button"
      onClick={onDownload}
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--rule-strong)] bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-body hover:bg-cream/60 hover:text-ink"
    >
      <Download className="size-3.5" />
      Download .txt
    </button>
  );
}

function buildCodesFile(codes: string[]): string {
  return [
    "DSO Hire — 2FA recovery codes",
    "",
    "Each code works exactly once. Use one to sign in if you lose access",
    "to your authenticator. Store these somewhere safe (password manager",
    "or printed copy in a locked location).",
    "",
    ...codes,
    "",
    `Generated: ${new Date().toISOString()}`,
  ].join("\n");
}
