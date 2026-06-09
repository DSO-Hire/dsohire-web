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
    <div className="min-h-screen bg-ivory flex flex-col items-center px-5 py-12">
      <div className="w-full max-w-[920px]">
        <header className="text-center mb-9">
          <h1 className="text-[26px] sm:text-[30px] font-extrabold tracking-tight text-ink">
            Which side of dental are you?
          </h1>
          <p className="mt-2 text-[15px] text-slate-body max-w-[560px] mx-auto leading-relaxed">
            We match two very different kinds of talent. Pick the one that fits
            you best — it tailors your assessment and your matches. You can switch
            anytime in Settings.
          </p>
        </header>

        <div className="grid gap-5 sm:grid-cols-2">
          <Panel
            tone="navy"
            wordmark={<PracticeFitWordmark surface="dark" className="text-2xl" tm />}
            tagline="You work IN a dental practice — chairside or front office."
            examples={PRACTICE_EXAMPLES}
            cta="This is me"
            busy={busy === "practicefit"}
            disabled={busy !== null && busy !== "practicefit"}
            onClick={() => choose("practicefit")}
          />
          <Panel
            tone="heritage"
            wordmark={<DsoFitWordmark surface="dark" className="text-2xl" tm />}
            tagline="You work at the DSO / corporate level — running the business."
            examples={DSO_EXAMPLES}
            cta="This is me"
            busy={busy === "dsofit"}
            disabled={busy !== null && busy !== "dsofit"}
            onClick={() => choose("dsofit")}
          />
        </div>

        {error && (
          <p className="mt-5 text-center text-[13px] font-semibold text-red-700">
            {error}
          </p>
        )}
        <p className="mt-8 text-center text-[12px] text-slate-meta">
          Not sure? Pick your closest fit — you can always explore the other side later.
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
  const bg = tone === "navy" ? "bg-ink" : "bg-heritage-deep";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex flex-col text-left ${bg} text-ivory rounded-lg p-7 transition-all ${
        disabled ? "opacity-50" : "hover:shadow-[0_12px_40px_-16px_rgba(20,35,63,0.5)] hover:-translate-y-0.5"
      }`}
    >
      <div className="mb-4">{wordmark}</div>
      <p className="text-[14px] text-ivory/85 leading-relaxed mb-5">{tagline}</p>
      <ul className="list-none space-y-2 mb-7 flex-1">
        {examples.map((e) => (
          <li key={e} className="flex items-start gap-2 text-[13.5px] text-ivory/90">
            <Check className="h-4 w-4 flex-shrink-0 mt-0.5 text-ivory/60" />
            <span>{e}</span>
          </li>
        ))}
      </ul>
      <span className="inline-flex items-center gap-2 self-start rounded-full bg-ivory/15 px-4 py-2 text-[13px] font-bold tracking-wide group-hover:bg-ivory/25 transition-colors">
        {busy ? "Setting up…" : cta}
        {!busy && <ArrowRight className="h-4 w-4" />}
      </span>
    </button>
  );
}
