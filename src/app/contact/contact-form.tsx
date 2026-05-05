"use client";

/**
 * ContactForm — client-side form component using React's useActionState.
 *
 * Posts to the `submitContact` server action which sends an email via Resend.
 * Includes a hidden honeypot field (`website`) to catch bots.
 */

import { useActionState } from "react";
import { Send } from "lucide-react";
import { submitContact, type ContactFormState } from "./actions";

const initialState: ContactFormState = { ok: false };

export function ContactForm() {
  const [state, formAction, pending] = useActionState(submitContact, initialState);

  if (state.ok) {
    return (
      <div className="bg-cream border-l-4 border-heritage p-6">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Sent
        </div>
        <p className="text-[15px] text-ink leading-relaxed">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {/* Honeypot — real users won't see/fill this. Bots will. */}
      <div className="hidden" aria-hidden="true">
        <label>
          Website (leave blank)
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Field label="Name" name="name" required />
      <Field label="Email" name="email" type="email" required />
      <Field label="Company / DSO (optional)" name="company" />
      <Field label="Subject (optional)" name="subject" />

      <div>
        <label
          htmlFor="contact-message"
          className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
        >
          Message <span className="text-heritage">*</span>
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={6}
          maxLength={5000}
          placeholder="What's on your mind?"
          className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] leading-relaxed placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors resize-vertical"
        />
      </div>

      {state.error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <p className="text-[14px] text-red-900">{state.error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "Sending…" : "Send Message"}
        {!pending && <Send className="h-3.5 w-3.5" />}
      </button>

      <p className="text-[13px] text-slate-meta leading-relaxed">
        We&apos;ll only use your email to reply. Read our{" "}
        <a
          href="/legal/privacy"
          className="text-heritage underline underline-offset-2 hover:text-heritage-deep"
        >
          privacy policy
        </a>
        .
      </p>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={`contact-${name}`}
        className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
      >
        {label} {required && <span className="text-heritage">*</span>}
      </label>
      <input
        id={`contact-${name}`}
        type={type}
        name={name}
        required={required}
        autoComplete={
          name === "name"
            ? "name"
            : name === "email"
              ? "email"
              : name === "company"
                ? "organization"
                : "off"
        }
        className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
      />
    </div>
  );
}
