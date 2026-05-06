"use client";

/**
 * ResumeImportWizard — three-state client component for Phase 4.1.c.
 *
 *   1. drop      — full-page drag-drop zone with click-to-browse fallback
 *   2. parsing   — friendly loading state while the AI parser runs (3–7 sec)
 *   3. review    — sectioned review form with confidence indicators (R8)
 *
 * Locked rules honored:
 *   • R8 — interactive review, NOT silent fill. Save only happens after
 *     the candidate clicks "Save to my profile" on the review screen.
 *   • R1 — the wizard surfaces a "we ignored these on purpose" disclosure
 *     when `flagged_redactions` is non-empty.
 */

import Link from "next/link";
import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  FileUp,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  parseResumeAction,
  saveParsedResumeAction,
  type ParseResumeActionResult,
} from "./actions";
import type { ParsedResume } from "@/lib/resume/parse";
import { ReviewForm } from "./review-form";

type WizardState =
  | { kind: "drop"; error?: string }
  | { kind: "parsing"; filename: string }
  | { kind: "review"; parsed: ParsedResume; warnings: string[] };

const ACCEPTED_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const ACCEPTED_EXTS = [".pdf", ".docx"];
const MAX_BYTES = 10 * 1024 * 1024;

export function ResumeImportWizard() {
  const router = useRouter();
  const [state, setState] = useState<WizardState>({ kind: "drop" });
  const [isSaving, startSaving] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File selection / drop ──────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    // Client-side prevalidation so we don't burn a server roundtrip on
    // an obviously-bad file. The server still validates everything.
    if (file.size > MAX_BYTES) {
      setState({
        kind: "drop",
        error: `That file is ${(file.size / 1_048_576).toFixed(1)}MB — the limit is 10MB.`,
      });
      return;
    }
    const matchesMime = ACCEPTED_MIMES.includes(file.type);
    const matchesExt = ACCEPTED_EXTS.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    );
    if (!matchesMime && !matchesExt) {
      setState({
        kind: "drop",
        error: "Please drop a PDF or DOCX file.",
      });
      return;
    }

    setState({ kind: "parsing", filename: file.name });

    const formData = new FormData();
    formData.append("resume", file);
    let result: ParseResumeActionResult;
    try {
      result = await parseResumeAction(formData);
    } catch {
      setState({
        kind: "drop",
        error: "Something went wrong. Please try again.",
      });
      return;
    }
    if (!result.ok) {
      setState({ kind: "drop", error: result.error });
      return;
    }
    setState({
      kind: "review",
      parsed: result.parsed,
      // Server doesn't currently return extraction warnings; placeholder
      // for when we wire that through. Empty array renders nothing.
      warnings: [],
    });
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so the same file can be re-selected after an error.
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // ── Save handler from the review form ──────────────────────────────

  const onConfirmSave = (edited: ParsedResume) => {
    startSaving(async () => {
      const result = await saveParsedResumeAction(edited);
      if (!result.ok) {
        // Bubble the failure up by switching to drop state with error.
        setState({ kind: "drop", error: result.error });
        return;
      }
      router.push("/candidate/profile?imported=1");
    });
  };

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href="/candidate/profile"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" />
        Back to profile
      </Link>

      {state.kind === "drop" && (
        <DropState
          error={state.error}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onBrowseClick={() => fileInputRef.current?.click()}
          fileInputRef={fileInputRef}
          onFileChange={onFileChange}
        />
      )}

      {state.kind === "parsing" && <ParsingState filename={state.filename} />}

      {state.kind === "review" && (
        <ReviewForm
          parsed={state.parsed}
          warnings={state.warnings}
          isSaving={isSaving}
          onCancel={() => setState({ kind: "drop" })}
          onConfirm={onConfirmSave}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Drop state
// ─────────────────────────────────────────────────────────────────────

function DropState(props: {
  error?: string;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onBrowseClick: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <>
      <h1 className="font-display text-3xl font-bold text-[#14233F]">
        Import your resume
      </h1>
      <p className="mt-2 text-base text-slate-600">
        Upload your resume and we&apos;ll fill in your profile automatically.
        You&apos;ll review every field before anything is saved.
      </p>

      <div
        onDragOver={props.onDragOver}
        onDrop={props.onDrop}
        onClick={props.onBrowseClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            props.onBrowseClick();
          }
        }}
        role="button"
        tabIndex={0}
        className="mt-8 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#4D7A60]/40 bg-[#F7F4ED] px-6 py-16 text-center transition hover:border-[#4D7A60] hover:bg-[#F7F4ED]/70 focus:outline-none focus:ring-2 focus:ring-[#4D7A60] focus:ring-offset-2"
      >
        <FileUp className="size-10 text-[#4D7A60]" />
        <p className="mt-4 text-lg font-semibold text-[#14233F]">
          Drag your resume here
        </p>
        <p className="mt-1 text-sm text-slate-500">
          or click to browse — PDF or DOCX, up to 10MB
        </p>
        <input
          ref={props.fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={props.onFileChange}
          className="sr-only"
          aria-label="Upload resume file"
        />
      </div>

      {props.error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{props.error}</span>
        </div>
      )}

      <PrivacyDisclosure />
    </>
  );
}

function PrivacyDisclosure() {
  return (
    <div className="mt-8 rounded-lg border border-[#4D7A60]/20 bg-white px-5 py-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#4D7A60]" />
        <div className="text-sm">
          <p className="font-semibold text-[#14233F]">
            Privacy by default
          </p>
          <p className="mt-1 text-slate-600">
            Your resume is parsed by Anthropic&apos;s Claude model. We never
            collect Social Security numbers, dates of birth, or DEA
            registration — even if your resume mentions them. License
            numbers stay hidden by default; you choose whether to display
            them publicly.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Parsing state
// ─────────────────────────────────────────────────────────────────────

function ParsingState({ filename }: { filename: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="relative">
        <Loader2 className="size-12 animate-spin text-[#4D7A60]" />
        <Sparkles className="absolute -right-2 -top-2 size-5 text-[#14233F]" />
      </div>
      <h2 className="mt-6 font-display text-2xl font-bold text-[#14233F]">
        Reading your resume…
      </h2>
      <p className="mt-2 max-w-md text-sm text-slate-600">
        Pulling out work history, education, licenses, and skills. This
        usually takes 3–7 seconds.
      </p>
      <p className="mt-6 text-xs text-slate-400">{filename}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Confidence pill (used by ReviewForm — re-exported here for cohesion)
// ─────────────────────────────────────────────────────────────────────

export function ConfidencePill({
  confidence,
}: {
  confidence: "high" | "medium" | "low";
}) {
  if (confidence === "high") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
        <CheckCircle2 className="size-3" />
        High confidence
      </span>
    );
  }
  if (confidence === "medium") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
        <CircleHelp className="size-3" />
        Please review
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">
      <CircleAlert className="size-3" />
      Low confidence
    </span>
  );
}
