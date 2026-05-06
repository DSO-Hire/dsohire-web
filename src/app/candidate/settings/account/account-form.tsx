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
import { Mail, Phone, Languages, Sparkles, AlertCircle } from "lucide-react";
import {
  requestEmailChange,
  updatePhone,
} from "./actions";

// ─────────────────────────────────────────────────────────────────────
// Email change
// ─────────────────────────────────────────────────────────────────────

export function EmailChangeForm({
  currentEmail,
}: {
  currentEmail: string | null;
}) {
  const [email, setEmail] = useState("");
  const [, startWork] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFlash(null);
    setBusy(true);
    startWork(async () => {
      const result = await requestEmailChange(email);
      setBusy(false);
      if (!result.ok) return setError(result.error);
      setFlash(result.message ?? "Confirmation sent.");
      setEmail("");
    });
  };

  return (
    <SectionCard
      icon={<Mail className="size-5 text-[#4D7A60]" />}
      title="Email"
      description={
        currentEmail
          ? `Currently signing in as ${currentEmail}. Change it below — we send a confirmation to the new address before swapping.`
          : "Set or change the email you use to sign in."
      }
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-800">
            New email
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@new-address.com"
            autoComplete="email"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#4D7A60] focus:outline-none focus:ring-1 focus:ring-[#4D7A60]"
          />
        </label>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">
            We&apos;ll send a confirmation link to the new address. Your
            current email stays active until you click it.
          </span>
          <button
            type="submit"
            disabled={busy || email.trim().length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#14233F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0d172b] disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send confirmation"}
          </button>
        </div>
        {error && <FlashError message={error} />}
        {flash && <FlashSuccess message={flash} />}
      </form>
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Phone capture
// ─────────────────────────────────────────────────────────────────────

export function PhoneForm({
  initialPhone,
}: {
  initialPhone: string | null;
}) {
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [, startWork] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const dirty = phone.trim() !== (initialPhone ?? "").trim();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFlash(null);
    setBusy(true);
    startWork(async () => {
      const result = await updatePhone(phone);
      setBusy(false);
      if (!result.ok) return setError(result.error);
      setFlash(result.message ?? "Saved.");
    });
  };

  return (
    <SectionCard
      icon={<Phone className="size-5 text-[#4D7A60]" />}
      title="Phone"
      description="For future SMS notifications when an employer moves you forward. We never call you — only opt-in texts."
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-800">
            Phone number
          </span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(913) 555-0142"
            autoComplete="tel"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#4D7A60] focus:outline-none focus:ring-1 focus:ring-[#4D7A60]"
          />
        </label>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">
            SMS opt-in lands in a follow-up release.
          </span>
          <button
            type="submit"
            disabled={busy || !dirty}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#14233F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0d172b] disabled:opacity-50"
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
      icon={<Languages className="size-5 text-[#4D7A60]" />}
      title="Language"
      description="The platform is English-only at launch. Spanish ships post-launch for our dental-assistant audience."
    >
      <div className="flex items-center gap-3">
        <select
          disabled
          className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500"
        >
          <option>English</option>
          <option disabled>Spanish (coming soon)</option>
        </select>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
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

function FlashError({ message }: { message: string }) {
  return (
    <p role="alert" className="inline-flex items-center gap-1 text-sm text-red-700">
      <AlertCircle className="size-3.5" />
      {message}
    </p>
  );
}

function FlashSuccess({ message }: { message: string }) {
  return (
    <p role="status" className="inline-flex items-center gap-1 text-sm text-[#4D7A60]">
      <Sparkles className="size-3.5" />
      {message}
    </p>
  );
}
