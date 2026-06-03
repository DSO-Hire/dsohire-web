"use client";

/**
 * N16 v2 — drip sequence builder + list. Lives under the "Sequences" tab on
 * /employer/automations. Owner/admin, Scale+. A sequence is an ordered list
 * of timed nurture emails; candidates are enrolled manually from an
 * application (Phase 1). Built-in exits stop a sequence when the candidate
 * replies, changes stage, or gets an offer.
 */

import { useState, useTransition } from "react";
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
} from "lucide-react";
import {
  saveSequence,
  setSequenceEnabled,
  deleteSequence,
} from "@/lib/sequences/actions";

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

  return (
    <div className="max-w-[860px]">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <p className="text-[14px] text-slate-body leading-relaxed max-w-[620px]">
          Drip sequences send a series of timed re-engagement emails to a
          candidate. Enroll a candidate from their application; the sequence
          stops automatically if they reply, change stage, or receive an offer.
        </p>
        {canManage && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-2 bg-[#14233F] text-[#F7F4ED] px-4 py-2 text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-[#070F1C] shrink-0"
          >
            <Plus className="h-3.5 w-3.5" /> New sequence
          </button>
        )}
      </div>

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
              <div key={i} className="border border-[var(--rule)] bg-cream/30 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 text-[11px] font-bold tracking-[1px] uppercase text-heritage-deep">
                    <GripVertical className="h-3.5 w-3.5 text-slate-meta" />
                    Step {i + 1}
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || pending}
                      className="px-1.5 text-slate-meta hover:text-ink disabled:opacity-30 text-[12px]">↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1 || pending}
                      className="px-1.5 text-slate-meta hover:text-ink disabled:opacity-30 text-[12px]">↓</button>
                    <button type="button" onClick={() => removeStep(i)} disabled={steps.length <= 1 || pending}
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
                    onChange={(e) => updateStep(i, { delay_days: Number(e.target.value) })}
                    className="w-16 px-2 py-1 bg-white border border-[var(--rule-strong)] text-ink text-[13px] focus:outline-none focus:border-heritage"
                  />
                  <span>
                    {i === 0
                      ? "day(s) after enrolling, then email:"
                      : "day(s) after the previous step, then email:"}
                  </span>
                </div>
                <input
                  type="text"
                  value={step.subject}
                  onChange={(e) => updateStep(i, { subject: e.target.value })}
                  maxLength={200}
                  placeholder="Subject — e.g. {{first_name}}, still interested in {{job_title}}?"
                  className="w-full px-3 py-2 mb-2 bg-white border border-[var(--rule-strong)] text-ink text-[13px] focus:outline-none focus:border-heritage"
                />
                <textarea
                  value={step.body}
                  onChange={(e) => updateStep(i, { body: e.target.value })}
                  rows={4}
                  maxLength={4000}
                  placeholder="Message body. Use {{first_name}} and {{job_title}} to personalize."
                  className="w-full px-3 py-2 bg-white border border-[var(--rule-strong)] text-ink text-[13px] focus:outline-none focus:border-heritage resize-y"
                />
              </div>
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
