"use client";

/**
 * ForcedSetupWizard — slim setup flow for /auth/mfa/setup (Phase 4.5.d).
 *
 * Same QR + verify + recovery codes flow as the Account page wizard, but
 * with no Cancel button (this page is gated behind dso.require_mfa = true,
 * so cancelling would just bounce them back here). After the user saves
 * their recovery codes, we route to the dashboard.
 *
 * Reuses the same server actions as the Account page wizard.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { enrollTotp, verifyEnrollment } from "@/app/employer/settings/account/mfa-actions";

export function ForcedSetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState<"loading" | "error" | "qr" | "codes" | "done">(
    "loading"
  );
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();

  // Kick off enrollment. Called on mount and from the retry button.
  // calling startTransition during render isn't reliable in React 19,
  // so this runs via useEffect / an onClick handler instead.
  const runEnroll = useCallback(async () => {
    setError(null);
    setStep("loading");
    const result = await enrollTotp();
    if (!result.ok) {
      setError(result.error);
      setStep("error");
      return;
    }
    setFactorId(result.factorId);
    setQrCode(result.qrCode);
    setSecret(result.secret);
    setStep("qr");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await enrollTotp();
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setStep("error");
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

  const onDone = () => {
    setStep("done");
    router.replace("/employer/dashboard");
  };

  if (step === "loading") {
    return (
      <div className="flex items-center gap-3 border border-[var(--rule)] bg-cream/40 p-6 text-sm text-slate-body">
        <Loader2 className="size-4 animate-spin" />
        Generating your 2FA setup…
      </div>
    );
  }

  if (step === "error") {
    return (
      <div
        role="alert"
        className="border border-red-200 bg-red-50 p-6 space-y-3"
      >
        <div className="flex items-start gap-2 text-[13px] text-red-800">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">We couldn&apos;t start your 2FA setup.</p>
            <p className="mt-0.5 leading-relaxed">
              {error ?? "Something went wrong. Please try again."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => startTransition(runEnroll)}
          disabled={pending}
          className="inline-flex items-center gap-2 bg-ink px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-ivory hover:bg-ink-soft disabled:opacity-40"
        >
          {pending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Retrying…
            </>
          ) : (
            <>
              <RotateCcw className="size-3.5" />
              Try again
            </>
          )}
        </button>
      </div>
    );
  }

  if (step === "qr" && qrCode && secret) {
    return (
      <div className="space-y-6">
        <div>
          <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep mb-1">
            Step 1 of 2
          </div>
          <h2 className="font-display text-lg font-bold text-ink">
            Scan with your authenticator app
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-[200px_1fr]">
          <div className="border border-[var(--rule)] bg-white p-3">
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
              Authenticator, etc.) and scan the QR code, or enter this
              setup key manually:
            </p>
            <div className="border border-[var(--rule)] bg-cream/40 p-3 font-mono text-[12px] text-ink break-all">
              {secret}
            </div>
            <CopyButton value={secret} label="Copy setup key" />
          </div>
        </div>

        <div className="border-t border-[var(--rule)] pt-5 space-y-3">
          <label
            htmlFor="totp-code"
            className="block text-[12px] font-semibold text-ink"
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
            className="w-40 border border-[var(--rule-strong)] bg-white px-3 py-2 font-mono text-[18px] tracking-[4px] text-ink focus:border-heritage focus:outline-none"
          />
          {error && (
            <p
              role="alert"
              className="text-[12px] text-red-700 inline-flex items-center gap-1.5"
            >
              <AlertTriangle className="size-3.5" />
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={onVerify}
            disabled={pending || code.length !== 6}
            className="inline-flex items-center gap-2 bg-ink px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-ivory hover:bg-ink-soft disabled:opacity-40"
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
        </div>
      </div>
    );
  }

  if (step === "codes" && recoveryCodes) {
    return (
      <div className="space-y-5">
        <div>
          <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep mb-1 inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5" />
            Step 2 of 2 · 2FA enabled
          </div>
          <h2 className="font-display text-lg font-bold text-ink">
            Save your recovery codes somewhere safe
          </h2>
          <p className="mt-1.5 text-[13px] text-slate-body leading-relaxed">
            Each code works exactly once if you lose your authenticator.
            <strong className="text-ink"> This is the only time we&apos;ll show them.</strong>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 border border-[var(--rule)] bg-cream/40 p-4 sm:grid-cols-2">
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
            onClick={onDone}
            className="ml-auto inline-flex items-center gap-2 bg-ink px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-ivory hover:bg-ink-soft"
          >
            I&apos;ve saved my codes
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* select-and-copy fallback */
        }
      }}
      className="inline-flex items-center gap-1.5 border border-[var(--rule-strong)] bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-body hover:bg-cream/60 hover:text-ink"
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
  return (
    <button
      type="button"
      onClick={() => {
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }}
      className="inline-flex items-center gap-1.5 border border-[var(--rule-strong)] bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-body hover:bg-cream/60 hover:text-ink"
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
    "Each code works exactly once. Store somewhere safe.",
    "",
    ...codes,
    "",
    `Generated: ${new Date().toISOString()}`,
  ].join("\n");
}
