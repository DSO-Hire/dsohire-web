"use client";

/**
 * Account tab additions (Phase 4.3.a v2).
 *
 * Three sub-sections that render alongside the existing PasswordForm:
 *   • EmailChangeForm  — verify-new-before-swap via Supabase Auth
 *   • PhoneForm        — phone capture for future SMS opt-in
 *   • LanguageStub     — coming-soon select; no DB write yet
 *
 * Each section is its own card with its own save button + flash state.
 * Saves are independent so password / email / phone can be touched
 * without forcing a multi-section form submit.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Phone, Languages, Sparkles, AlertCircle, Clock } from "lucide-react";
import {
  requestEmailChange,
  verifyEmailChangeOtp,
  cancelEmailChange,
  updatePhone,
} from "./actions";

export interface PendingEmailChange {
  id: string;
  new_email: string;
  expires_at: string;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────
// Email change
// ─────────────────────────────────────────────────────────────────────

/**
 * EmailChangeForm — OTP-first two-step (Phase 4.3.a rebuild).
 *
 * Step 1: candidate enters new email; we send a 6-digit OTP to the NEW
 *         address + a "this wasn't me" link to the OLD.
 * Step 2: candidate enters the 6-digit code; we look up the pending row,
 *         swap auth.users.email, and mark consumed.
 *
 * If the page loads with an unconsumed/unrevoked/unexpired pending row
 * (passed via `initialPending`), we render Step 2 directly.
 */
export function EmailChangeForm({
  currentEmail,
  initialPending,
}: {
  currentEmail: string | null;
  initialPending?: PendingEmailChange | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingEmailChange | null>(
    initialPending ?? null
  );
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [, startWork] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const onRequest = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFlash(null);
    setBusy(true);
    startWork(async () => {
      const result = await requestEmailChange(email);
      setBusy(false);
      if (!result.ok) return setError(result.error);
      const trimmed = email.trim().toLowerCase();
      // Synthesize the pending row so the UI flips to Step 2 immediately.
      setPending({
        id: result.requestId,
        new_email: trimmed,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      });
      setFlash(`Code sent to ${trimmed}. Enter it below.`);
      setEmail("");
    });
  };

  const onVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pending) return;
    setError(null);
    setFlash(null);
    setBusy(true);
    startWork(async () => {
      const result = await verifyEmailChangeOtp({
        requestId: pending.id,
        code,
      });
      setBusy(false);
      if (!result.ok) return setError(result.error);
      setPending(null);
      setCode("");
      setFlash(`Email changed to ${result.newEmail}.`);
      // Pull a fresh server payload so the heading reflects the new email.
      router.refresh();
    });
  };

  const onCancel = () => {
    if (!pending) return;
    if (
      !confirm("Cancel this email-change request? You can start over after.")
    ) {
      return;
    }
    setError(null);
    setFlash(null);
    setBusy(true);
    startWork(async () => {
      const result = await cancelEmailChange(pending.id);
      setBusy(false);
      if (!result.ok) return setError(result.error);
      setPending(null);
      setCode("");
      setFlash("Email-change request canceled.");
    });
  };

  return (
    <SectionCard
      icon={<Mail className="size-5 text-heritage" />}
      title="Email"
      description={
        currentEmail
          ? `Currently signing in as ${currentEmail}. We send a 6-digit code to the new address before swapping.`
          : "Set or change the email you use to sign in."
      }
    >
      {pending ? (
        <form onSubmit={onVerify} className="space-y-3">
          <div className="rounded-md border border-heritage/30 bg-card p-3 text-sm">
            <p className="font-medium text-foreground">
              Code sent to{" "}
              <span className="font-semibold">{pending.new_email}</span>
            </p>
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3" />
              Expires{" "}
              {new Date(pending.expires_at).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">
              6-digit code
            </span>
            <input
              type="text"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="• • • • • •"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-center font-mono text-lg tracking-[8px] shadow-sm focus:border-heritage focus:outline-none focus:ring-1 focus:ring-heritage"
            />
          </label>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="text-xs font-medium text-muted-foreground hover:text-danger disabled:opacity-50"
            >
              Cancel this request
            </button>
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Verify and swap"}
            </button>
          </div>
          {error && <FlashError message={error} />}
          {flash && <FlashSuccess message={flash} />}
        </form>
      ) : (
        <form onSubmit={onRequest} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">
              New email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@new-address.com"
              autoComplete="email"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm focus:border-heritage focus:outline-none focus:ring-1 focus:ring-heritage"
            />
          </label>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              We&apos;ll send a 6-digit code to the new address. Your current
              email stays active until you verify it.
            </span>
            <button
              type="submit"
              disabled={busy || email.trim().length === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send code"}
            </button>
          </div>
          {error && <FlashError message={error} />}
          {flash && <FlashSuccess message={flash} />}
        </form>
      )}
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Phone capture
// ─────────────────────────────────────────────────────────────────────

/**
 * Format raw input as a US phone number.
 *   ""         → ""
 *   "9"        → "(9"
 *   "913"      → "(913"
 *   "9139"     → "(913) 9"
 *   "9139723000" → "(913) 972-3000"
 * Strips anything that isn't a digit; caps at 10 digits. Persisted value
 * keeps the formatting (recognizable in DB rows + future SMS lookups can
 * normalize).
 */
function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function PhoneForm({
  initialPhone,
}: {
  initialPhone: string | null;
}) {
  // Re-format any saved value so existing rows that were stored as raw
  // digits (pre-formatter) display nicely on first render.
  const [phone, setPhone] = useState(formatPhoneInput(initialPhone ?? ""));
  const [, startWork] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const dirty =
    phone.trim() !== formatPhoneInput(initialPhone ?? "").trim();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFlash(null);
    setBusy(true);
    startWork(async () => {
      const result = await updatePhone(phone);
      setBusy(false);
      if (!result.ok) return setError(result.error);
      setFlash(
        phone.trim().length > 0
          ? "Phone number saved."
          : "Phone number cleared."
      );
    });
  };

  return (
    <SectionCard
      icon={<Phone className="size-5 text-heritage" />}
      title="Phone"
      description="For future SMS notifications when an employer moves you forward. We never call you — only opt-in texts."
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">
            Phone number
          </span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
            placeholder="(913) 555-0142"
            autoComplete="tel"
            inputMode="tel"
            maxLength={14}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm focus:border-heritage focus:outline-none focus:ring-1 focus:ring-heritage"
          />
        </label>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            SMS opt-in lands in a follow-up release.
          </span>
          <button
            type="submit"
            disabled={busy || !dirty}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
        {error && <FlashError message={error} />}
        {flash && <FlashSuccess message={flash} />}
      </form>
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Language stub
// ─────────────────────────────────────────────────────────────────────

export function LanguageStub() {
  return (
    <SectionCard
      icon={<Languages className="size-5 text-heritage" />}
      title="Language"
      description="DSO Hire is English-only today. Additional languages are on the roadmap."
    >
      <div className="flex items-center gap-3">
        <select
          disabled
          className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
        >
          <option>English</option>
        </select>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Coming soon
        </span>
      </div>
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared
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
    <section className="border border-[var(--rule)] bg-card p-6 sm:p-8">
      <header className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-heritage/10">
          {icon}
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </header>
      <div>{children}</div>
    </section>
  );
}

function FlashError({ message }: { message: string }) {
  return (
    <p role="alert" className="inline-flex items-center gap-1 text-sm text-danger">
      <AlertCircle className="size-3.5" />
      {message}
    </p>
  );
}

function FlashSuccess({ message }: { message: string }) {
  return (
    <p role="status" className="inline-flex items-center gap-1 text-sm text-heritage">
      <Sparkles className="size-3.5" />
      {message}
    </p>
  );
}
