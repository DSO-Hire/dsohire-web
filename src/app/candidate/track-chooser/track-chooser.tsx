"use client";

/**
 * Two-tone track chooser (#53). Navy PracticeFit | heritage DSOFit, each a big
 * tappable panel with real role examples. One tap saves the track and routes to
 * the matching assessment. Client-safe imports only (no server/site-shell deps).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ArrowRight } from "lucide-react";
import { PracticeFitWordmark } from "@/components/practice-fit/brand/practice-fit-wordmark";
import { DsoFitWordmark } from "@/components/practice-fit/brand/dsofit-wordmark";
import { saveTrackChoice } from "./actions";

type Track = "practicefit" | "dsofit";

const PRACTICE_EXAMPLES = [
  "Dentist & Specialists",
  "Dental Hygienist",
  "Dental Assistant",
  "Front Desk / Coordinators",
  "Office Manager",
];
const DSO_EXAMPLES = [
  "Regional / Area Manager",
  "Finance · RCM · Credentialing",
  "IT · Marketing · HR",
  "Business Development · M&A",
  "Clinical Leadership (CCO / CDO)",
  "Operations & C-suite",
];

export function TrackChooser() {
  const router = useRouter();
  const [, start] = useTransition();
  const [busy, setBusy] = useState<Track | null>(null);
  const [error, setError] = useState<string | null>(null);

  function choose(product: Track) {
    if (busy) return;
    setError(null);
    setBusy(product);
    start(async () => {
      const r = await saveTrackChoice(product);
      if (r.ok && r.dest) {
        router.push(r.dest);
      } else {
        setBusy(null);
        setError(r.error ?? "Couldn't save — try again.");
      }
    });
  }

  return (
    <div className="min-h-screen bg-ivory flex flex-col items-center justify-center px-5 py-16">
      <div className="w-full max-w-[1080px]">
        <header className="text-center mb-12">
          <h1 className="text-[34px] sm:text-[44px] font-extrabold tracking-[-0.5px] text-ink leading-tight">
            Which side of dental are you?
          </h1>
          <p className="mt-4 text-[17px] sm:text-[18px] text-slate-body max-w-[640px] mx-auto leading-relaxed">
            We match two very different kinds of talent. Pick the one that fits
            you best. It tailors your assessment and your matches, and you can
            switch anytime in Settings.
          </p>
        </header>

        <div className="grid gap-6 sm:grid-cols-2">
          <Panel
            tone="navy"
            wordmark={
              <PracticeFitWordmark surface="dark" className="text-[34px] sm:text-[40px]" tm />
            }
            tagline="You work IN a dental practice, chairside or front office."
            examples={PRACTICE_EXAMPLES}
            cta="This is me"
            busy={busy === "practicefit"}
            disabled={busy !== null && busy !== "practicefit"}
            onClick={() => choose("practicefit")}
          />
          <Panel
            tone="heritage"
            wordmark={
              <DsoFitWordmark surface="heritage" className="text-[34px] sm:text-[40px]" tm />
            }
            tagline="You work at the DSO / corporate level, running the business."
            examples={DSO_EXAMPLES}
            cta="This is me"
            busy={busy === "dsofit"}
            disabled={busy !== null && busy !== "dsofit"}
            onClick={() => choose("dsofit")}
          />
        </div>

        {error && (
          <p className="mt-6 text-center text-[14px] font-semibold text-danger">
            {error}
          </p>
        )}
        <p className="mt-9 text-center text-[13px] text-slate-meta">
          Not sure? Pick your closest fit. You can always explore the other side later.
        </p>
      </div>
    </div>
  );
}

function Panel({
  tone,
  wordmark,
  tagline,
  examples,
  cta,
  busy,
  disabled,
  onClick,
}: {
  tone: "navy" | "heritage";
  wordmark: React.ReactNode;
  tagline: string;
  examples: string[];
  cta: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const bg = tone === "navy" ? "bg-hero" : "bg-heritage";
  // Per-tone foreground: the navy panel stays navy in both modes (light text);
  // the heritage panel flips to light-green in dark, so its text inverts to
  // dark. hero-foreground = light both; primary-foreground = light→dark.
  const fg = tone === "navy" ? "text-hero-foreground" : "text-primary-foreground";
  const fgFaint = tone === "navy" ? "text-hero-foreground/90" : "text-primary-foreground/90";
  const fgCheck = tone === "navy" ? "text-hero-foreground/55" : "text-primary-foreground/55";
  // The CTA pill is always a light/white surface, so its text is fixed dark in
  // both modes (the ink/heritage-deep tokens would flip light and vanish).
  const ctaText = tone === "navy" ? "text-[#14233F]" : "text-[#2F5D4F]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex flex-col text-left ${bg} ${fg} rounded-xl p-9 sm:p-10 transition-all ${
        disabled
          ? "opacity-50"
          : "hover:shadow-[0_18px_50px_-18px_rgba(20,35,63,0.55)] hover:-translate-y-1"
      }`}
    >
      <div className="mb-5">{wordmark}</div>
      <p className={`text-[19px] sm:text-[21px] font-bold ${fg} leading-snug mb-7`}>
        {tagline}
      </p>
      <ul className="list-none space-y-3 mb-9 flex-1">
        {examples.map((e) => (
          <li key={e} className={`flex items-start gap-2.5 text-[15px] sm:text-[16px] ${fgFaint}`}>
            <Check className={`h-5 w-5 flex-shrink-0 mt-0.5 ${fgCheck}`} />
            <span>{e}</span>
          </li>
        ))}
      </ul>
      <span
        className={`inline-flex items-center gap-2 self-start rounded-full bg-white px-6 py-3 text-[15px] font-bold tracking-wide ${ctaText} group-hover:bg-white/90 transition-colors`}
      >
        {busy ? "Setting up…" : cta}
        {!busy && <ArrowRight className="h-[18px] w-[18px]" />}
      </span>
    </button>
  );
}
