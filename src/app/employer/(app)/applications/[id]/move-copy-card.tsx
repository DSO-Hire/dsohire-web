"use client";

/**
 * <MoveCopyCard> — move or copy a candidate's application to another job in
 * the same DSO (E3.21). Lazy-loads eligible target jobs on expand. "Move"
 * relocates (original archived, silent to candidate) and navigates to the new
 * application; "Copy" duplicates and keeps the original, linking to the new one.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Copy, ArrowRight } from "lucide-react";
import {
  listMoveCopyTargets,
  transferApplication,
  type MoveCopyTarget,
  type TransferMode,
} from "./move-actions";

export function MoveCopyCard({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [targets, setTargets] = useState<MoveCopyTarget[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleOpen() {
    setOpen(true);
    if (targets === null) {
      setLoading(true);
      const res = await listMoveCopyTargets(applicationId);
      setLoading(false);
      if (res.ok) setTargets(res.targets);
      else setError(res.error);
    }
  }

  function handleTransfer(mode: TransferMode) {
    if (!selected) return;
    setError(null);
    setCopied(null);
    startTransition(async () => {
      const res = await transferApplication(applicationId, selected, mode);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (mode === "move") {
        // Original is archived; the candidate's live record is the clone.
        router.push(`/employer/applications/${res.newApplicationId}`);
      } else {
        setCopied(res.newApplicationId);
      }
    });
  }

  const selectedTaken = targets?.find((t) => t.id === selected)?.taken ?? false;

  return (
    <section className="border border-[var(--rule)] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          Move or copy to another job
        </h3>
        {!open && (
          <button
            type="button"
            onClick={handleOpen}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-heritage hover:text-heritage-deep"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Move / copy
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3">
          <p className="text-[13px] text-slate-body leading-relaxed mb-3">
            Reassign this candidate to another of your jobs. <strong className="font-semibold text-ink">Move</strong>{" "}
            relocates them (the original is closed out, the candidate isn&apos;t
            notified); <strong className="font-semibold text-ink">Copy</strong> keeps them in both pipelines.
          </p>

          {loading ? (
            <p className="text-[13px] text-slate-meta">Loading your jobs…</p>
          ) : targets && targets.length === 0 ? (
            <p className="text-[13px] text-slate-meta">
              No other jobs to move this candidate to yet.
            </p>
          ) : targets ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setError(null);
                  setCopied(null);
                }}
                className="px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[13px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors max-w-full"
              >
                <option value="">Choose a job…</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.taken}>
                    {t.title}
                    {t.taken ? " — already applied" : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleTransfer("move")}
                disabled={pending || !selected || selectedTaken}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-ink text-ivory text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-50"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                {pending ? "Working…" : "Move"}
              </button>
              <button
                type="button"
                onClick={() => handleTransfer("copy")}
                disabled={pending || !selected || selectedTaken}
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-[var(--rule-strong)] text-ink text-[11px] font-bold tracking-[1.5px] uppercase hover:border-ink transition-colors disabled:opacity-50"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
            </div>
          ) : null}

          {error && (
            <p role="alert" className="mt-2 text-[12px] text-red-700">
              {error}
            </p>
          )}
          {copied && (
            <p className="mt-2 text-[12px] text-heritage-deep">
              Copied.{" "}
              <a
                href={`/employer/applications/${copied}`}
                className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:text-ink"
              >
                View the new application <ArrowRight className="h-3 w-3" />
              </a>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
