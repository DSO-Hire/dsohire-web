"use client";

/**
 * OfferApprovalsSettings — N12 Phase 2 policy + per-teammate grants UI.
 *
 * COPY MANDATE (Cam): every toggle carries a plain-English description of
 * exactly what it does and what each person experiences, so an admin never
 * has to ask. That's why each control is paired with a real explanation.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Lock,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import type { OfferApprovalPolicy } from "@/lib/offers/approval-policy";
import {
  updateOfferApprovalPolicy,
  setTeammateCanSendDirectly,
} from "./actions";
import { HelpDisclosure } from "@/components/help/help-disclosure";

export interface TeammateRow {
  id: string;
  name: string;
  role: string;
  canSendDirectly: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  recruiter: "Recruiter",
  hiring_manager: "Hiring manager",
};

export function OfferApprovalsSettings({
  approvalsEnabled,
  policy,
  teammates,
}: {
  approvalsEnabled: boolean;
  policy: OfferApprovalPolicy;
  teammates: TeammateRow[];
}) {
  const disabled = !approvalsEnabled;

  return (
    <div className="max-w-[720px] space-y-8">
      <header>
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Offer approvals
        </div>
        <h2 className="text-2xl font-extrabold tracking-[-0.6px] text-ink">
          Who can send offers, and when sign-off is required
        </h2>
        <p className="mt-2 text-[14px] text-slate-body leading-relaxed">
          Offer letters are legally meaningful, so DSO Hire lets you put a
          checkpoint between &ldquo;a teammate drafts an offer&rdquo; and
          &ldquo;it reaches the candidate.&rdquo; Owners and admins always send
          directly. Recruiters and hiring managers need an owner or admin to
          approve each offer — unless you grant them direct authority below.
        </p>
      </header>

      <HelpDisclosure helpKey="offers.approvals" />

      {disabled && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 flex items-start gap-2">
          <Lock className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Approval routing is part of the <strong>Scale</strong> plan. On your
            current plan everyone who can send an offer sends it directly, with
            no approval step. Upgrade to turn on the controls below.
          </span>
        </div>
      )}

      {/* How it works — the plain-English model. */}
      <section className="rounded-md border border-[var(--rule)] bg-cream/40 p-5">
        <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-2">
          How approvals work
        </div>
        <ul className="space-y-2 text-[13px] text-slate-body leading-relaxed">
          <li className="flex gap-2">
            <span className="text-heritage-deep font-bold">•</span>
            <span>
              <strong>Owners &amp; admins</strong> send offers straight to the
              candidate — no approval needed.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-heritage-deep font-bold">•</span>
            <span>
              <strong>Recruiters &amp; hiring managers</strong> have their offers
              held for sign-off. An owner/admin gets notified, reviews the exact
              letter in the approvals queue, and approves it (which sends it) or
              sends it back with a note.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-heritage-deep font-bold">•</span>
            <span>
              Grant a specific recruiter or hiring manager{" "}
              <strong>direct authority</strong> below and their offers stop
              needing approval — except where the pay rules in this section still
              require it.
            </span>
          </li>
        </ul>
      </section>

      <PolicyForm policy={policy} disabled={disabled} />

      <TeammateGrants teammates={teammates} disabled={disabled} />
    </div>
  );
}

function PolicyForm({
  policy,
  disabled,
}: {
  policy: OfferApprovalPolicy;
  disabled: boolean;
}) {
  const router = useRouter();
  const [requireOOR, setRequireOOR] = useState(policy.require_when_out_of_range);
  const [ceiling, setCeiling] = useState(
    policy.require_above_amount != null ? String(policy.require_above_amount) : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    const raw = ceiling.replace(/[^0-9.]/g, "");
    const parsed = raw ? Number(raw) : null;
    if (raw && (!Number.isFinite(parsed) || (parsed as number) <= 0)) {
      setError("Enter a positive dollar amount for the ceiling, or leave it blank.");
      return;
    }
    startTransition(async () => {
      const res = await updateOfferApprovalPolicy({
        require_when_out_of_range: requireOOR,
        require_above_amount: parsed,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  return (
    <section className="space-y-4">
      <h3 className="text-[15px] font-extrabold tracking-[-0.3px] text-ink">
        Pay-based rules
      </h3>

      <ToggleRow
        checked={requireOOR}
        onChange={setRequireOOR}
        disabled={disabled || pending}
        title="Out-of-range offers always need approval"
        description="When on, any offer whose base pay falls outside the job's posted range is routed for sign-off — even for owners, admins, and teammates you've given direct authority. This is the guardrail that stops an off-band offer from going out by mistake. When off, those people get a heads-up banner but can still send."
      />

      <div className="rounded-md border border-[var(--rule)] p-4">
        <div className="text-[13px] font-bold text-ink">Approval ceiling (optional)</div>
        <p className="mt-1 text-[12px] text-slate-body leading-relaxed">
          Require approval for any offer whose <strong>annualized base</strong>{" "}
          is above this amount — even for people who normally send directly. An
          hourly base is annualized at 2,080 hours/year for the comparison.
          Leave blank for no ceiling.
        </p>
        <div className="mt-2.5 relative max-w-[240px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-meta text-sm">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={ceiling}
            onChange={(e) => setCeiling(e.target.value)}
            disabled={disabled || pending}
            placeholder="e.g. 200000"
            className="w-full pl-6 pr-3 py-2 border border-[var(--rule-strong)] bg-white text-ink text-sm focus:outline-none focus:border-heritage disabled:bg-cream/60 disabled:text-slate-meta"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={disabled || pending}
          className="inline-flex items-center gap-2 bg-[#14233F] text-[#F7F4ED] px-5 py-2 text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-[#070F1C] disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          Save pay rules
        </button>
        {savedAt && !pending && (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-heritage-deep font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5" /> Saved
          </span>
        )}
      </div>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800 flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}

function TeammateGrants({
  teammates,
  disabled,
}: {
  teammates: TeammateRow[];
  disabled: boolean;
}) {
  const grantable = teammates.filter(
    (t) => t.role === "recruiter" || t.role === "hiring_manager"
  );
  const alwaysOn = teammates.filter((t) => t.role === "owner" || t.role === "admin");

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-[15px] font-extrabold tracking-[-0.3px] text-ink">
          Per-teammate authority
        </h3>
        <p className="mt-1 text-[13px] text-slate-body leading-relaxed">
          Turn a teammate&apos;s direct-send authority on or off. People with
          authority skip the approval step (the pay rules above still apply to
          everyone).
        </p>
      </div>

      <ul className="border border-[var(--rule)] divide-y divide-[var(--rule)] bg-white">
        {grantable.map((t) => (
          <TeammateGrantRow key={t.id} teammate={t} disabled={disabled} />
        ))}
        {alwaysOn.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-ink">{t.name}</div>
              <div className="text-[12px] text-slate-meta">{ROLE_LABELS[t.role] ?? t.role}</div>
            </div>
            <span className="text-[11px] font-bold tracking-[1px] uppercase text-heritage-deep shrink-0">
              Always — full authority
            </span>
          </li>
        ))}
        {grantable.length === 0 && alwaysOn.length === 0 && (
          <li className="px-4 py-6 text-[13px] text-slate-meta text-center">
            No teammates yet.
          </li>
        )}
      </ul>
      {grantable.length === 0 && (
        <p className="text-[12px] text-slate-meta">
          You have no recruiters or hiring managers to grant. Invite teammates
          from the Team page.
        </p>
      )}
    </section>
  );
}

function TeammateGrantRow({
  teammate,
  disabled,
}: {
  teammate: TeammateRow;
  disabled: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(teammate.canSendDirectly);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setError(null);
    const prev = on;
    setOn(next); // optimistic
    startTransition(async () => {
      const res = await setTeammateCanSendDirectly(teammate.id, next);
      if (!res.ok) {
        setOn(prev);
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-ink">{teammate.name}</div>
        <div className="text-[12px] text-slate-meta">
          {ROLE_LABELS[teammate.role] ?? teammate.role}
          {on ? " · sends offers directly" : " · offers need approval"}
        </div>
        {error && <div className="text-[11px] text-red-700 mt-0.5">{error}</div>}
      </div>
      <Switch checked={on} onChange={toggle} disabled={disabled || pending} />
    </li>
  );
}

/* ── small controls ── */

function ToggleRow({
  checked,
  onChange,
  disabled,
  title,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-md border border-[var(--rule)] p-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13px] font-bold text-ink">{title}</div>
        <p className="mt-1 text-[12px] text-slate-body leading-relaxed">{description}</p>
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 " +
        (checked ? "bg-[#14233F]" : "bg-slate-300")
      }
    >
      <span
        className={
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform " +
          (checked ? "translate-x-6" : "translate-x-1")
        }
      />
    </button>
  );
}
