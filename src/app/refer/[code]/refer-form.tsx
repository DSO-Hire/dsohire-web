"use client";

/**
 * Public referral form (gap N15) — no auth. Submits to submitLinkReferral
 * which validates the code server-side. Status-tracking only; no bonus.
 */

import { useState, useTransition } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { submitLinkReferral } from "@/lib/referrals/actions";

interface JobOption {
  id: string;
  title: string;
}

export function ReferForm({
  code,
  jobs,
}: {
  code: string;
  jobs: JobOption[];
}) {
  const [referrerName, setReferrerName] = useState("");
  const [referrerEmail, setReferrerEmail] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [candidatePhone, setCandidatePhone] = useState("");
  const [jobId, setJobId] = useState("");
  const [note, setNote] = useState("");
  const [saving, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const inputCls =
    "w-full h-11 px-3.5 bg-card border border-[var(--rule-strong)] text-ink text-[15px] focus:outline-none focus:border-heritage";

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await submitLinkReferral(code, {
        referrerName,
        referrerEmail,
        candidateName,
        candidateEmail,
        candidatePhone,
        jobId,
        note,
      });
      if (res.ok) setDone(true);
      else setError(res.error ?? "Couldn't submit. Please try again.");
    });
  };

  if (done) {
    return (
      <div className="border border-heritage/30 bg-heritage/5 p-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-heritage-deep mx-auto mb-3" />
        <h2 className="text-xl font-bold text-ink mb-1">Thank you!</h2>
        <p className="text-[14px] text-slate-body leading-relaxed max-w-[420px] mx-auto">
          Your referral for{" "}
          <span className="font-semibold text-ink">{candidateName}</span> has
          been sent to the hiring team. We appreciate you passing along a great
          name.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep mb-2">
          About you
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input placeholder="Your name *" value={referrerName} onChange={(e) => setReferrerName(e.target.value)} className={inputCls} />
          <input placeholder="Your email" type="email" value={referrerEmail} onChange={(e) => setReferrerEmail(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div>
        <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep mb-2">
          Who you&apos;re referring
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input placeholder="Their name *" value={candidateName} onChange={(e) => setCandidateName(e.target.value)} className={inputCls} />
          <input placeholder="Their email" type="email" value={candidateEmail} onChange={(e) => setCandidateEmail(e.target.value)} className={inputCls} />
          <input placeholder="Their phone" value={candidatePhone} onChange={(e) => setCandidatePhone(e.target.value)} className={inputCls} />
          {jobs.length > 0 && (
            <select value={jobId} onChange={(e) => setJobId(e.target.value)} className={inputCls}>
              <option value="">For a specific job? (optional)</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
            </select>
          )}
        </div>
        <textarea
          placeholder="Why are they a great fit? (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="mt-3 w-full px-3.5 py-2.5 bg-card border border-[var(--rule-strong)] text-ink text-[15px] focus:outline-none focus:border-heritage resize-y"
        />
      </div>

      {error && <p role="alert" className="text-[14px] text-danger">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={saving || !referrerName.trim() || !candidateName.trim()}
        className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground text-[13px] font-bold tracking-[1px] uppercase hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Submit referral
      </button>
    </div>
  );
}
