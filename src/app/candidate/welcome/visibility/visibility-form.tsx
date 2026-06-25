"use client";

/**
 * First-run visibility chooser UI (consent-based privacy, Option 3).
 *
 * Three stacked, tappable choices — Stay private (default) · Discoverable with
 * my name · Discoverable but anonymous — plus a plain-language note that
 * contact info + résumé stay hidden until apply and demographic/EEO answers are
 * never shown. One submit stamps the choice and routes onward. Client-safe
 * imports only (no server/site-shell deps), mirroring track-chooser.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Eye, VenetianMask, ArrowRight, ShieldCheck } from "lucide-react";
import { saveVisibilityChoice, type VisibilityChoice } from "./actions";

const OPTIONS: ReadonlyArray<{
  value: VisibilityChoice;
  icon: React.ReactNode;
  label: string;
  description: string;
}> = [
  {
    value: "private",
    icon: <Lock className="h-6 w-6" />,
    label: "Stay private",
    description:
      "You won't show up in any employer browse or search. You can still apply to jobs — applying reveals you to that practice only. Change this anytime.",
  },
  {
    value: "discoverable",
    icon: <Eye className="h-6 w-6" />,
    label: "Discoverable to verified employers, with my name",
    description:
      "Signed-in DSO Hire employers can find your profile by fit and reach out. Your name and photo are visible to them.",
  },
  {
    value: "anonymous",
    icon: <VenetianMask className="h-6 w-6" />,
    label: "Discoverable, but anonymous until I'm interested",
    description:
      "Employers see a generic label like “Dental Hygienist in Denver” — never your name or photo — until you apply to one of their roles. Then your full profile reveals to that practice.",
  },
];

export function VisibilityForm({ initial }: { initial: VisibilityChoice }) {
  const router = useRouter();
  const [choice, setChoice] = useState<VisibilityChoice>(initial);
  const [, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (busy) return;
    setError(null);
    setBusy(true);
    start(async () => {
      const r = await saveVisibilityChoice(choice);
      if (r.ok && r.dest) {
        router.push(r.dest);
      } else {
        setBusy(false);
        setError(r.error ?? "Couldn't save — try again.");
      }
    });
  }

  return (
    <div className="min-h-screen bg-ivory flex flex-col items-center justify-center px-5 py-16">
      <div className="w-full max-w-[680px]">
        <header className="text-center mb-10">
          <span className="inline-flex items-center gap-2 rounded-full bg-heritage/10 px-3.5 py-1.5 text-[13px] font-semibold text-heritage">
            <ShieldCheck className="h-4 w-4" />
            You&apos;re private by default
          </span>
          <h1 className="mt-5 text-[32px] sm:text-[40px] font-extrabold tracking-[-0.5px] text-ink leading-tight">
            Choose who can find you
          </h1>
          <p className="mt-4 text-[16px] sm:text-[17px] text-slate-body max-w-[560px] mx-auto leading-relaxed">
            Right now, no employer can see you. Pick how discoverable you want to
            be — you can change it anytime in Settings.
          </p>
        </header>

        <fieldset className="space-y-3.5">
          <legend className="sr-only">Profile visibility</legend>
          {OPTIONS.map((opt) => {
            const selected = choice === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-4 rounded-xl border-2 p-5 sm:p-6 transition-all ${
                  selected
                    ? "border-heritage bg-heritage/[0.06] shadow-[0_10px_30px_-16px_rgba(47,93,79,0.5)]"
                    : "border-[var(--rule)] bg-card hover:border-heritage/40"
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  checked={selected}
                  onChange={() => setChoice(opt.value)}
                  className="sr-only"
                />
                <span
                  className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                    selected
                      ? "bg-heritage text-primary-foreground"
                      : "bg-heritage/10 text-heritage"
                  }`}
                >
                  {opt.icon}
                </span>
                <span className="flex-1">
                  <span className="block text-[16px] sm:text-[17px] font-bold text-foreground leading-snug">
                    {opt.label}
                  </span>
                  <span className="mt-1 block text-[14px] text-muted-foreground leading-relaxed">
                    {opt.description}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <p className="mt-6 flex items-start gap-2 text-[13px] leading-relaxed text-slate-meta">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-heritage" />
          <span>
            Whatever you choose, your contact info and résumé stay hidden until
            you apply. Your demographic / EEO answers are never shown to anyone.
          </span>
        </p>

        {error && (
          <p className="mt-5 text-center text-[14px] font-semibold text-danger">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full bg-heritage px-6 py-3.5 text-[15px] font-bold tracking-wide text-primary-foreground transition-colors hover:bg-heritage-deep disabled:opacity-60"
        >
          {busy ? "Saving…" : "Continue"}
          {!busy && <ArrowRight className="h-[18px] w-[18px]" />}
        </button>
      </div>
    </div>
  );
}
