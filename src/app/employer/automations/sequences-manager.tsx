"use client";

/**
 * N16 v2 — drip sequence builder + list. Lives under the "Sequences" tab on
 * /employer/automations. Owner/admin, Scale+. A sequence is an ordered list
 * of timed nurture emails; candidates are enrolled manually from an
 * application (Phase 1). Built-in exits stop a sequence when the candidate
 * replies, changes stage, or gets an offer.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  GripVertical,
  Loader2,
  AlertCircle,
  Lock,
  Mail,
  X,
  Play,
  Eye,
  CheckCircle2,
} from "lucide-react";
import {
  saveSequence,
  setSequenceEnabled,
  deleteSequence,
  runSequencesNow,
} from "@/lib/sequences/actions";

/** Friendly labels for the auto-exit reasons shown in the Run-now result. */
const EXIT_REASON_LABELS: Record<string, string> = {
  replied: "candidate replied",
  stage_changed: "changed stage",
  offer_sent: "got an offer",
  sequence_disabled: "sequence paused",
  no_candidate_email: "no candidate email",
  application_gone: "application removed",
};

/** Personalization tokens offered as click-to-insert chips. */
const MERGE_TOKENS: ReadonlyArray<{ token: string; label: string }> = [
  { token: "{{first_name}}", label: "First name" },
  { token: "{{last_name}}", label: "Last name" },
  { token: "{{job_title}}", label: "Job title" },
  { token: "{{practice_name}}", label: "Practice name" },
];

/** Sample values for the live preview. */
const PREVIEW_SAMPLE: Record<string, string> = {
  "{{first_name}}": "Maria",
  "{{last_name}}": "Lopez",
  "{{job_title}}": "Dental Hygienist",
  // Generic placeholder — at send time this resolves to the candidate's
  // affiliation-masked practice name. Kept obviously generic so the builder
  // doesn't look like it'll send a wrong/real practice name.
  "{{practice_name}}": "your practice",
};

function fillPreview(s: string): string {
  let out = s;
  for (const { token } of MERGE_TOKENS) {
    out = out.split(token).join(PREVIEW_SAMPLE[token] ?? token);
  }
  return out;
}

export interface SequenceStepView {
  delay_days: number;
  subject: string;
  body: string;
}
export interface SequenceView {
  id: string;
  name: string;
  is_enabled: boolean;
  steps: SequenceStepView[];
  activeCount: number;
  completedCount: number;
}

export function SequencesManager({
  sequences,
  canManage,
}: {
  sequences: SequenceView[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<SequenceView | "new" | null>(null);
  const router = useRouter();
  const [running, startRun] = useTransition();
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const hasActive = sequences.some((s) => s.activeCount > 0);

  function runNow() {
    setRunMsg(null);
    startRun(async () => {
      const res = await runSequencesNow();
      if (!res.ok) {
        setRunMsg(res.error);
        return;
      }
      if (res.due === 0) {
        setRunMsg("Nothing was due to send right now.");
      } else {
        const reasons = Object.entries(res.exitReasons || {})
          .map(([k, n]) => `${EXIT_REASON_LABELS[k] ?? k} ×${n}`)
          .join(", ");
        const stoppedPart =
          res.exited > 0
            ? ` · stopped ${res.exited}${reasons ? ` (${reasons})` : ""}`
            : "";
        setRunMsg(
          `Sent ${res.sent} · completed ${res.completed}${stoppedPart} · of ${res.due} due.`
        );
      }
      router.refresh();
    });
  }

  return (
    <div className="max-w-[860px]">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <p className="text-[14px] text-slate-body leading-relaxed max-w-[560px]">
          Drip sequences send a series of timed re-engagement emails to a
          candidate. Enroll a candidate from their application; the sequence
          stops automatically if they reply, change stage, or receive an offer.
        </p>
        {canManage && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={runNow}
              disabled={running || !hasActive}
              title={
                hasActive
                  ? "Send any steps due now instead of waiting for the hourly run"
                  : "No active enrollments to process"
              }
              className="inline-flex items-center gap-2 border border-[var(--rule-strong)] text-ink bg-white px-3 py-2 text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-cream disabled:opacity-50"
            >
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Run now
            </button>
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="inline-flex items-center gap-2 bg-[#14233F] text-[#F7F4ED] px-4 py-2 text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-[#070F1C]"
            >
              <Plus className="h-3.5 w-3.5" /> New sequence
            </button>
          </div>
        )}
      </div>

      {runMsg && (
        <div className="mb-4 inline-flex items-center gap-2 rounded border border-heritage/30 bg-heritage/[0.06] px-3 py-2 text-[12px] text-heritage-deep">
          <CheckCircle2 className="h-3.5 w-3.5" /> {runMsg}
        </div>
      )}

      {!canManage && (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 flex items-start gap-2">
          <Lock className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Drip sequences are part of the <strong>Scale</strong> plan. Upgrade
            to build sequences and enroll candidates.
          </span>
        </div>
      )}

      {sequences.length === 0 ? (
        <div className="border border-[var(--rule)] bg-cream/40 px-6 py-12 text-center">
          <Mail className="h-8 w-8 text-heritage-deep mx-auto mb-3" />
          <p className="text-[15px] font-semibold text-ink">No sequences yet</p>
          <p className="mt-1 text-[13px] text-slate-meta">
            {canManage
              ? "Create a sequence, then enroll candidates from their application."
              : "Once on Scale, you can build re-engagement sequences here."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {sequences.map((s) => (
            <li key={s.id}>
              <SequenceRow
                sequence={s}
                canManage={canManage}
                onEdit={() => setEditing(s)}
              />
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <SequenceEditor
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function SequenceRow({
  sequence,
  canManage,
  onEdit,
}: {
  sequence: SequenceView;
  canManage: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function toggle() {
    startTransition(async () => {
      await setSequenceEnabled(sequence.id, !sequence.is_enabled);
      router.refresh();
    });
  }
  function remove() {
    startTransition(async () => {
      await deleteSequence(sequence.id);
      router.refresh();
    });
  }

  return (
    <div className="border border-[var(--rule)] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-extrabold tracking-[-0.3px] text-ink">
            {sequence.name}
            {!sequence.is_enabled && (
              <span className="ml-2 text-[9px] font-bold tracking-[1.5px] uppercase text-slate-meta">
                · paused
              </span>
            )}
          </div>
          <div className="text-[12px] text-slate-meta mt-0.5">
            {sequence.steps.length} step{sequence.steps.length === 1 ? "" : "s"} ·{" "}
            {sequence.activeCount} active · {sequence.completedCount} completed
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggle}
              disabled={pending}
              className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-body hover:text-ink disabled:opacity-60"
            >
              {sequence.is_enabled ? "Pause" : "Enable"}
            </button>
            <button
              type="button"
              onClick={onEdit}
              disabled={pending}
              className="px-3 py-1.5 border border-[var(--rule-strong)] text-ink text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-cream disabled:opacity-60"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={pending}
              className="p-1.5 text-slate-meta hover:text-red-700 disabled:opacity-60"
              aria-label="Delete sequence"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      {confirmDelete && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-900">
          Delete &ldquo;{sequence.name}&rdquo;? Active enrollments stop immediately.
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="inline-flex items-center gap-1.5 bg-[#7c2d12] text-[#F7F4ED] px-3 py-1.5 text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-[#5b210d] disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={pending}
              className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-body hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SequenceEditor({
  initial,
  onClose,
}: {
  initial: SequenceView | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [steps, setSteps] = useState<SequenceStepView[]>(
    initial?.steps.length
      ? initial.steps.map((s) => ({ ...s }))
      : [{ delay_days: 0, subject: "", body: "" }]
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function updateStep(i: number, patch: Partial<SequenceStepView>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addStep() {
    setSteps((prev) => [...prev, { delay_days: 3, subject: "", body: "" }]);
  }
  function removeStep(i: number) {
    setSteps((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }
  function move(i: number, dir: -1 | 1) {
    setSteps((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveSequence({
        id: initial?.id,
        name: name.trim(),
        steps: steps.map((s) => ({
          delay_days: Math.max(0, Math.trunc(Number(s.delay_days) || 0)),
          subject: s.subject,
          body: s.body,
        })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#14233F]/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="w-full max-w-[680px] max-h-[92vh] bg-white border border-[var(--rule)] shadow-xl flex flex-col">
        <header className="flex items-start justify-between p-5 border-b border-[var(--rule)]">
          <div>
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1">
              Drip sequence
            </div>
            <h2 className="text-[18px] font-extrabold tracking-[-0.4px] text-ink">
              {initial ? "Edit sequence" : "New sequence"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="p-1 text-slate-meta hover:text-ink disabled:opacity-60"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <label className="block">
            <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1.5">
              Sequence name
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="e.g. Hygienist re-engagement"
              className="w-full px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage"
            />
          </label>

          <div className="space-y-3">
            {steps.map((step, i) => (
              <StepEditor
                key={i}
                index={i}
                total={steps.length}
                step={step}
                pending={pending}
                onUpdate={(patch) => updateStep(i, patch)}
                onRemove={() => removeStep(i)}
                onMove={(dir) => move(i, dir)}
              />
            ))}
            <button
              type="button"
              onClick={addStep}
              disabled={steps.length >= 12 || pending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-[var(--rule-strong)] text-ink text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-cream disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add step
            </button>
          </div>

          <p className="text-[11px] text-slate-meta leading-relaxed">
            Personalize with <code>{"{{first_name}}"}</code> and{" "}
            <code>{"{{job_title}}"}</code>. Every running sequence stops
            automatically if the candidate replies, changes stage, or gets an
            offer — you never have to clean up after a hire.
          </p>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 p-4 border-t border-[var(--rule)] bg-cream/40">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-slate-body hover:text-ink disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-2 bg-[#14233F] text-[#F7F4ED] px-5 py-2 text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-[#070F1C] disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save sequence
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ── A single step: wait input + subject/body with insert-field chips +
 *    a live preview toggle (no more typing {{tokens}} by hand). ── */
function StepEditor({
  index,
  total,
  step,
  pending,
  onUpdate,
  onRemove,
  onMove,
}: {
  index: number;
  total: number;
  step: SequenceStepView;
  pending: boolean;
  onUpdate: (patch: Partial<SequenceStepView>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  function insertSubject(token: string) {
    const el = subjectRef.current;
    const cur = step.subject ?? "";
    if (!el) return onUpdate({ subject: cur + token });
    const s = el.selectionStart ?? cur.length;
    const e = el.selectionEnd ?? cur.length;
    onUpdate({ subject: cur.slice(0, s) + token + cur.slice(e) });
    requestAnimationFrame(() => {
      el.focus();
      const p = s + token.length;
      el.setSelectionRange(p, p);
    });
  }
  function insertBody(token: string) {
    const el = bodyRef.current;
    const cur = step.body ?? "";
    if (!el) return onUpdate({ body: cur + token });
    const s = el.selectionStart ?? cur.length;
    const e = el.selectionEnd ?? cur.length;
    onUpdate({ body: cur.slice(0, s) + token + cur.slice(e) });
    requestAnimationFrame(() => {
      el.focus();
      const p = s + token.length;
      el.setSelectionRange(p, p);
    });
  }

  return (
    <div className="border border-[var(--rule)] bg-cream/30 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-[11px] font-bold tracking-[1px] uppercase text-heritage-deep">
          <GripVertical className="h-3.5 w-3.5 text-slate-meta" />
          Step {index + 1}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            disabled={pending}
            className={
              "inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold tracking-[1px] uppercase border disabled:opacity-40 " +
              (preview
                ? "border-heritage text-heritage-deep bg-heritage/[0.06]"
                : "border-[var(--rule-strong)] text-slate-body hover:text-ink")
            }
          >
            <Eye className="h-3 w-3" /> {preview ? "Edit" : "Preview"}
          </button>
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0 || pending}
            className="px-1.5 text-slate-meta hover:text-ink disabled:opacity-30 text-[12px]">↑</button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1 || pending}
            className="px-1.5 text-slate-meta hover:text-ink disabled:opacity-30 text-[12px]">↓</button>
          <button type="button" onClick={onRemove} disabled={total <= 1 || pending}
            className="p-1 text-slate-meta hover:text-red-700 disabled:opacity-30" aria-label="Remove step">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2 text-[12px] text-slate-body">
        <span>Wait</span>
        <input
          type="number"
          min={0}
          max={365}
          value={step.delay_days}
          onChange={(e) => onUpdate({ delay_days: Number(e.target.value) })}
          disabled={pending}
          className="w-16 px-2 py-1 bg-white border border-[var(--rule-strong)] text-ink text-[13px] focus:outline-none focus:border-heritage"
        />
        <span>
          {index === 0
            ? "day(s) after enrolling, then email:"
            : "day(s) after the previous step, then email:"}
        </span>
      </div>

      {preview ? (
        <div className="rounded border border-[var(--rule)] bg-white p-3">
          <div className="text-[9px] font-bold tracking-[1.5px] uppercase text-slate-meta">Subject</div>
          <div className="text-[13px] font-semibold text-ink mb-2">
            {fillPreview(step.subject) || "—"}
          </div>
          <div className="text-[9px] font-bold tracking-[1.5px] uppercase text-slate-meta">Body</div>
          <div className="text-[13px] text-slate-body whitespace-pre-wrap leading-relaxed">
            {fillPreview(step.body) || "—"}
          </div>
          <div className="mt-2 text-[11px] text-slate-meta">
            Preview with sample values (Maria · Dental Hygienist).
          </div>
        </div>
      ) : (
        <>
          <TokenChips onInsert={insertSubject} disabled={pending} target="subject" />
          <input
            ref={subjectRef}
            type="text"
            value={step.subject}
            onChange={(e) => onUpdate({ subject: e.target.value })}
            maxLength={200}
            placeholder="Subject line"
            disabled={pending}
            className="w-full px-3 py-2 mb-2 bg-white border border-[var(--rule-strong)] text-ink text-[13px] focus:outline-none focus:border-heritage"
          />
          <TokenChips onInsert={insertBody} disabled={pending} target="message" />
          <textarea
            ref={bodyRef}
            value={step.body}
            onChange={(e) => onUpdate({ body: e.target.value })}
            rows={4}
            maxLength={4000}
            placeholder="Message body"
            disabled={pending}
            className="w-full px-3 py-2 bg-white border border-[var(--rule-strong)] text-ink text-[13px] focus:outline-none focus:border-heritage resize-y"
          />
        </>
      )}
    </div>
  );
}

/** Click-to-insert personalization chips — beats typing {{tokens}} by hand. */
function TokenChips({
  onInsert,
  disabled,
  target,
}: {
  onInsert: (token: string) => void;
  disabled: boolean;
  target: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-1">
      <span className="text-[10px] text-slate-meta">Insert into {target}:</span>
      {MERGE_TOKENS.map((t) => (
        <button
          key={t.token}
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()} // keep caret in the field
          onClick={() => onInsert(t.token)}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-heritage-deep border border-heritage/30 bg-heritage/[0.06] rounded hover:bg-heritage/10 disabled:opacity-50"
        >
          <Plus className="h-2.5 w-2.5" /> {t.label}
        </button>
      ))}
    </div>
  );
}
