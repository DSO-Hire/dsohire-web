"use client";

/**
 * OfferApprovalsManager — the owner/admin queue of offers awaiting sign-off
 * (N12 Phase 2). Each card shows who submitted what, lets the approver read
 * the exact draft, and Approve (sends it) or Reject (returns it with a note).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Clock,
  ShieldCheck,
  ThumbsDown,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import { approveOffer, rejectOffer } from "../applications/[id]/offer-approval-actions";
import type { OfferChange } from "@/lib/offers/diff";
import { HelpDisclosure } from "@/components/help/help-disclosure";

export interface PendingOffer {
  id: string;
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  subject: string;
  bodyHtml: string;
  baseAmount: number | null;
  basePeriod: "hourly" | "annual" | null;
  submittedAt: string;
  senderName: string | null;
  /** N12 Phase 3 — diff vs the offer this one supersedes (empty if first). */
  changes: OfferChange[];
  revisedFromDate: string | null;
}

function fmtBase(amount: number | null, period: "hourly" | "annual" | null): string | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  const pretty =
    amount % 1 === 0
      ? amount.toLocaleString("en-US")
      : amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$${pretty}/${period === "annual" ? "yr" : "hr"}`;
}

export function OfferApprovalsManager({
  pending,
  approvalsEnabled,
}: {
  pending: PendingOffer[];
  approvalsEnabled: boolean;
}) {
  return (
    <div className="max-w-[860px]">
      <header className="mb-6">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Offer approvals
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-[-1.2px] leading-[1.05] text-ink">
          {pending.length > 0
            ? `${pending.length} offer${pending.length === 1 ? "" : "s"} waiting on you`
            : "Offer approvals"}
        </h1>
        <p className="mt-3 text-[14px] text-slate-body leading-relaxed max-w-[640px]">
          When a teammate prepares an offer that needs sign-off — because of who
          they are or because the pay falls outside policy — it lands here.
          Approving sends the exact letter to the candidate; rejecting returns it
          to the sender with your note. You can set who needs approval in{" "}
          <Link href="/employer/settings/offer-approvals" className="text-heritage-deep underline">
            offer-approval settings
          </Link>
          .
        </p>
      </header>

      <div className="mb-5">
        <HelpDisclosure helpKey="offers.approvals" />
      </div>

      {!approvalsEnabled && (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Approval routing is a Scale feature and is currently off for your
            plan. Any offers already in the queue can still be resolved below,
            but new offers won&apos;t be routed for approval.
          </span>
        </div>
      )}

      {pending.length === 0 ? (
        <div className="border border-[var(--rule)] bg-cream/40 px-6 py-12 text-center">
          <ShieldCheck className="h-8 w-8 text-heritage-deep mx-auto mb-3" />
          <p className="text-[15px] font-semibold text-ink">You&apos;re all caught up</p>
          <p className="mt-1 text-[13px] text-slate-meta">
            No offers are waiting for approval right now.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {pending.map((o) => (
            <li key={o.id}>
              <PendingOfferCard offer={o} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PendingOfferCard({ offer }: { offer: PendingOffer }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submittedAt = new Date(offer.submittedAt);
  const baseLabel = fmtBase(offer.baseAmount, offer.basePeriod);

  function doApprove() {
    setError(null);
    startTransition(async () => {
      const res = await approveOffer(offer.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }
  function doReject() {
    setError(null);
    if (!note.trim()) {
      setError("Add a short note so the sender knows why.");
      return;
    }
    startTransition(async () => {
      const res = await rejectOffer(offer.id, note.trim());
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="border border-amber-300 bg-amber-50/40">
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <Clock className="h-3.5 w-3.5 text-amber-700 shrink-0" />
          <span className="text-[10px] font-bold tracking-[2px] uppercase text-amber-800">
            Awaiting approval
          </span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[16px] font-extrabold tracking-[-0.3px] text-ink">
              {offer.candidateName}
            </h2>
            <div className="text-[13px] text-slate-body">{offer.jobTitle}</div>
            <div className="text-[12px] text-slate-meta mt-1">
              Submitted {submittedAt.toLocaleDateString()} at{" "}
              {submittedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              {offer.senderName ? ` by ${offer.senderName}` : ""}
              {baseLabel ? ` · Base ${baseLabel}` : ""}
            </div>
            <div className="text-[12px] text-slate-meta mt-0.5">Subject: {offer.subject}</div>
          </div>
          <Link
            href={`/employer/applications/${offer.applicationId}`}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[1px] uppercase text-heritage-deep hover:underline shrink-0"
          >
            Open application
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-[1.5px] uppercase border border-[var(--rule-strong)] text-ink bg-white hover:bg-cream"
        >
          {open ? (
            <>
              <ChevronUp className="h-3 w-3" /> Hide draft
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" /> View draft text
            </>
          )}
        </button>
      </div>

      {offer.revisedFromDate && (
        <div className="border-t border-amber-200 bg-white px-5 py-3">
          <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep mb-2">
            What changed from the previous offer
            <span className="text-slate-meta font-semibold normal-case tracking-normal">
              {" "}· revised from {offer.revisedFromDate}
            </span>
          </div>
          {offer.changes.length === 0 ? (
            <p className="text-[12px] text-slate-meta italic">
              No tracked terms changed — only the letter wording was edited.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {offer.changes.map((c) => (
                <li key={c.label} className="text-[12px] leading-snug">
                  <span className="font-semibold text-ink">{c.label}: </span>
                  <span className="text-slate-meta line-through">{c.from}</span>
                  <span className="text-slate-meta"> → </span>
                  <span className="font-semibold text-heritage-deep">{c.to}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {open && (
        <div className="border-t border-amber-200 bg-white">
          <iframe
            title={`Draft offer to ${offer.candidateName}`}
            srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:18px;font-family:'Manrope','Helvetica Neue',Arial,sans-serif;color:#14233F;font-size:14px;line-height:1.6;}p{margin:0 0 12px;}h2{font-size:18px;margin:22px 0 10px;}h3{font-size:16px;margin:18px 0 8px;}ul{margin:12px 0 16px;padding-left:22px;}</style></head><body>${offer.bodyHtml}</body></html>`}
            sandbox=""
            className="w-full"
            style={{ height: "420px", border: "0" }}
          />
        </div>
      )}

      <div className="border-t border-amber-200 bg-white px-5 py-4">
        {rejecting ? (
          <div className="space-y-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Why are you sending this back? (the sender sees this)"
              className="w-full px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[13px] focus:outline-none focus:border-heritage resize-y"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={doReject}
                disabled={pending}
                className="inline-flex items-center gap-2 bg-[#7c2d12] text-[#F7F4ED] px-4 py-2 text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-[#5b210d] disabled:opacity-60"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsDown className="h-3.5 w-3.5" />}
                Send back
              </button>
              <button
                type="button"
                onClick={() => {
                  setRejecting(false);
                  setError(null);
                }}
                disabled={pending}
                className="px-3 py-2 text-[11px] font-bold tracking-[1.5px] uppercase text-slate-body hover:text-ink disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={doApprove}
              disabled={pending}
              className="inline-flex items-center gap-2 bg-[#14233F] text-[#F7F4ED] px-4 py-2 text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-[#070F1C] disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              Approve &amp; send
            </button>
            <button
              type="button"
              onClick={() => setRejecting(true)}
              disabled={pending}
              className="inline-flex items-center gap-2 border border-[var(--rule-strong)] text-ink bg-white px-4 py-2 text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-cream disabled:opacity-60"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
              Reject
            </button>
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800 flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
