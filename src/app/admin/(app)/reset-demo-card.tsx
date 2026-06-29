"use client";

/**
 * Founder-only "Reset demo data" card. Confirm-gated; reflects pending + result
 * state. Rendered on /admin only when the viewer is a superadmin (the page
 * gates it; the server action re-checks).
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { RotateCcw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { resetDemoData, type ResetDemoState } from "./reset-demo-actions";

const initial: ResetDemoState = { ok: false, message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm("Wipe and reseed ALL demo data to pristine? This only touches demo-marked rows. Continue?")) {
          e.preventDefault();
        }
      }}
      className="inline-flex items-center gap-2 bg-heritage px-4 py-2.5 text-[13px] font-bold text-white hover:bg-heritage-deep disabled:opacity-60 transition-colors"
    >
      <RotateCcw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Resetting…" : "Reset demo data"}
    </button>
  );
}

export function ResetDemoCard() {
  const [state, formAction] = useActionState(resetDemoData, initial);
  return (
    <section className="mt-12 border border-[var(--rule)] bg-card p-6">
      <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
        Demo controls · founder-only
      </div>
      <h2 className="text-[16px] font-extrabold text-ink">Reset demo data</h2>
      <p className="mt-1.5 mb-4 text-[13px] text-slate-body leading-relaxed max-w-[560px]">
        Wipes and reseeds the curated demo set (DSOs, candidates, pipelines, sourcing, analytics,
        pre-warmed fit scores) back to pristine between demos. Scoped to{" "}
        <code className="text-[12px]">seed_batch=&apos;demo_v1&apos;</code> rows only — never touches real data.
        Takes ~30–60s.
      </p>
      <form action={formAction}>
        <SubmitButton />
      </form>
      {state.message && (
        <div
          className={`mt-4 flex items-start gap-2 text-[13px] ${
            state.ok ? "text-heritage-deep" : "text-danger"
          }`}
        >
          {state.ok ? (
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          <span>{state.message}</span>
        </div>
      )}
    </section>
  );
}
