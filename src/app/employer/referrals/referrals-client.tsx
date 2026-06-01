"use client";

/**
 * Client pieces for the Referrals page (gap N15):
 *   • ShareLinkBox      — copy the public /refer/<code> link.
 *   • ReferralComposer  — teammate submits a referral.
 *   • StatusSelect      — advance a referral's status inline.
 * Status-tracking only; no bonus/payout anywhere.
 */

import { useState, useTransition } from "react";
import { Copy, Check, UserPlus, Loader2 } from "lucide-react";
import { submitTeammateReferral, updateReferralStatus } from "@/lib/referrals/actions";

interface JobOption {
  id: string;
  title: string;
}

export function ShareLinkBox({ code }: { code: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!code) {
    return (
      <p className="text-[13px] text-slate-meta">
        Your shareable link will appear here once it&apos;s generated.
      </p>
    );
  }
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/refer/${code}`
      : `/refer/${code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the input is selectable as a fallback */
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="flex-1 h-9 px-3 bg-cream border border-[var(--rule-strong)] text-[13px] text-ink focus:outline-none"
      />
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 h-9 px-3 bg-ink text-ivory text-[11px] font-bold tracking-[1px] uppercase hover:bg-ink-soft transition-colors"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function ReferralComposer({ jobs }: { jobs: JobOption[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobId, setJobId] = useState("");
  const [note, setNote] = useState("");
  const [saving, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const reset = () => {
    setName(""); setEmail(""); setPhone(""); setJobId(""); setNote("");
  };

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await submitTeammateReferral({
        candidateName: name,
        candidateEmail: email,
        candidatePhone: phone,
        jobId,
        note,
      });
      if (res.ok) {
        reset();
        setOpen(false);
        setFlash("Referral added.");
        setTimeout(() => setFlash(null), 2500);
      } else {
        setError(res.error ?? "Couldn't save.");
      }
    });
  };

  const inputCls =
    "w-full h-10 px-3 bg-white border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage";

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-heritage text-ivory text-[12px] font-bold tracking-[1px] uppercase hover:bg-heritage-deep transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Refer someone
        </button>
        {flash && (
          <span role="status" className="text-[13px] font-medium text-heritage-deep">
            {flash}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="border border-[var(--rule-strong)] bg-white p-5 space-y-4 max-w-[680px]">
      <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep">
        Refer someone
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
        <select value={jobId} onChange={(e) => setJobId(e.target.value)} className={inputCls}>
          <option value="">For a specific job? (optional)</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>{j.title}</option>
          ))}
        </select>
      </div>
      <textarea
        placeholder="Why are they a great fit? (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        className="w-full px-3 py-2 bg-white border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage resize-y"
      />
      {error && <p role="alert" className="text-[13px] text-red-700">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={saving || !name.trim()}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink text-ivory text-[12px] font-bold tracking-[1px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Add referral
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="text-[12px] font-semibold text-slate-body hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const STATUS_OPTIONS = [
  { value: "submitted", label: "Submitted" },
  { value: "contacted", label: "Contacted" },
  { value: "interviewing", label: "Interviewing" },
  { value: "hired", label: "Hired" },
  { value: "closed", label: "Closed" },
];

export function StatusSelect({
  referralId,
  current,
}: {
  referralId: string;
  current: string;
}) {
  const [value, setValue] = useState(current);
  const [pending, start] = useTransition();

  const onChange = (next: string) => {
    const prev = value;
    setValue(next);
    start(async () => {
      const res = await updateReferralStatus(referralId, next);
      if (!res.ok) setValue(prev);
    });
  };

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => onChange(e.target.value)}
      className="text-[12px] px-2 py-1 bg-white border border-[var(--rule-strong)] text-ink focus:outline-none focus:border-heritage"
    >
      {STATUS_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
