"use client";

/**
 * AutomationsManager — list + full builder for N13 automation rules.
 *
 * Renders each rule as a plain-English sentence with an enable/disable toggle
 * + run count. The builder is a 3-part form (trigger → conditions → actions)
 * with a live sentence preview and, for the stage-change trigger, a "test
 * against recent moves" dry-run. Custom-rule create/edit is gated to
 * canManage (Scale+); the seeded default rule is editable but not deletable.
 *
 * Triggers wired: application.stage_changed + application.received (additive —
 * received offers internal actions only, since the ack email already sends).
 */

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Workflow, Lock, Sparkles, Plus, Trash2, Pencil, FlaskConical } from "lucide-react";
import { STAGE_KINDS, KIND_DEFAULT_LABELS, type StageKind } from "@/lib/applications/stages";
import {
  createAutomationRule,
  updateAutomationRule,
  deleteAutomationRule,
  setRuleEnabled,
  dryRunStageChangedRule,
} from "@/lib/automations/actions";
import type { RuleCondition } from "@/lib/automations/types";
import type { RuleView } from "./page";

interface JobOpt {
  id: string;
  title: string;
}
interface TeammateOpt {
  id: string;
  name: string;
}

interface Props {
  rules: RuleView[];
  jobs: JobOpt[];
  teammates: TeammateOpt[];
  canManage: boolean;
}

type TriggerKind =
  | "application.stage_changed"
  | "application.received"
  | "application.idle_in_stage";

type DraftAction =
  | { action_kind: "email_candidate"; config: { template_kind: string } }
  | { action_kind: "inbox_system_message"; config: Record<string, never> }
  | { action_kind: "add_tag"; config: { label: string; color: string } }
  | { action_kind: "notify_teammate"; config: { target_dso_user_id: string } }
  | { action_kind: "assign"; config: { target_dso_user_id: string } };

interface Draft {
  name: string;
  trigger_kind: TriggerKind;
  conditions: RuleCondition[];
  actions: DraftAction[];
}

const STAGE_OPTS = STAGE_KINDS.map((k) => ({ value: k, label: KIND_DEFAULT_LABELS[k] }));
const TAG_COLORS = ["slate", "green", "blue", "amber", "rose", "purple"];

const TRIGGER_OPTS: Array<{ value: TriggerKind; label: string }> = [
  { value: "application.stage_changed", label: "An application changes stage" },
  { value: "application.received", label: "A new application arrives" },
  { value: "application.idle_in_stage", label: "An application sits too long in a stage" },
];

// Which actions + (generic) condition fields each trigger allows. The idle
// trigger's day threshold is handled by its own field, not the generic rows.
const ACTIONS_FOR_TRIGGER: Record<TriggerKind, DraftAction["action_kind"][]> = {
  "application.stage_changed": ["email_candidate", "inbox_system_message", "add_tag", "notify_teammate", "assign"],
  "application.received": ["add_tag", "notify_teammate", "assign"],
  "application.idle_in_stage": ["add_tag", "notify_teammate", "assign"],
};
const FIELDS_FOR_TRIGGER: Record<TriggerKind, RuleCondition["field"][]> = {
  "application.stage_changed": ["to_kind", "from_kind", "job_id"],
  "application.received": ["job_id"],
  "application.idle_in_stage": ["to_kind", "job_id"],
};

const DEFAULT_IDLE_DAYS = 7;
function idleDaysFromConditions(conditions: RuleCondition[]): number {
  const c = conditions.find((x) => x.field === "days_in_stage" && x.op === "gte");
  const n = c ? Number(c.value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_IDLE_DAYS;
}

const ACTION_LABELS: Record<string, string> = {
  email_candidate: "Email the candidate",
  inbox_system_message: "Post an inbox update",
  add_tag: "Add a tag",
  notify_teammate: "Notify a teammate",
  assign: "Assign to a teammate",
};

// ── plain-English sentence ───────────────────────────────────────────
function kindLabel(k: string): string {
  return KIND_DEFAULT_LABELS[k as StageKind] ?? k;
}

function conditionsPhrase(conditions: RuleCondition[], jobs: JobOpt[]): string {
  if (!conditions.length) return "";
  const parts: string[] = [];
  for (const c of conditions) {
    const vals = Array.isArray(c.value) ? c.value : [c.value];
    if (c.field === "to_kind") parts.push(`moves to ${vals.map((v) => kindLabel(String(v))).join(" or ")}`);
    else if (c.field === "from_kind") parts.push(`moves from ${vals.map((v) => kindLabel(String(v))).join(" or ")}`);
    else if (c.field === "job_id") {
      const titles = vals.map((v) => jobs.find((j) => j.id === v)?.title ?? "a job");
      parts.push(`for ${titles.join(" or ")}`);
    }
  }
  return ", " + parts.join(", ");
}

function actionsPhrase(
  actions: Array<{ action_kind: string; config: Record<string, unknown> }>,
  teammates: TeammateOpt[]
): string {
  if (!actions.length) return "do nothing";
  return actions
    .map((a) => {
      if (a.action_kind === "add_tag") {
        const label = String((a.config?.label as string | undefined) ?? "").trim();
        return label ? `add the tag "${label}"` : "add a tag";
      }
      if (a.action_kind === "notify_teammate" || a.action_kind === "assign") {
        const id = String((a.config?.target_dso_user_id as string | undefined) ?? "");
        const who = teammates.find((t) => t.id === id)?.name;
        const verb = a.action_kind === "assign" ? "assign to" : "notify";
        return who ? `${verb} ${who}` : `${verb} a teammate`;
      }
      return (ACTION_LABELS[a.action_kind] ?? a.action_kind).toLowerCase();
    })
    .join(", then ");
}

function ruleSentence(
  trigger: string,
  conditions: RuleCondition[],
  actions: Array<{ action_kind: string; config: Record<string, unknown> }>,
  jobs: JobOpt[],
  teammates: TeammateOpt[]
): string {
  const act = actionsPhrase(actions, teammates);
  if (trigger === "application.idle_in_stage") {
    const days = idleDaysFromConditions(conditions);
    const parts: string[] = [];
    for (const c of conditions) {
      const vals = Array.isArray(c.value) ? c.value : [c.value];
      if (c.field === "to_kind") parts.push(`in ${vals.map((v) => kindLabel(String(v))).join(" or ")}`);
      else if (c.field === "job_id")
        parts.push(`for ${vals.map((v) => jobs.find((j) => j.id === v)?.title ?? "a job").join(" or ")}`);
    }
    const where = parts.length ? " " + parts.join(", ") : " a stage";
    return `When an application sits${where} for ${days}+ days → ${act}.`;
  }
  const cond = conditionsPhrase(conditions, jobs);
  if (trigger === "application.received") {
    return `When a new application arrives${cond} → ${act}.`;
  }
  return `When an application${cond} changes stage → ${act}.`;
}

// ── component ────────────────────────────────────────────────────────
export function AutomationsManager({ rules, jobs, teammates, canManage }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
            <Workflow className="size-5 text-heritage" />
            Automations
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            Run actions automatically when something happens in your pipeline — like emailing a
            candidate, tagging an application, or pinging a teammate.
          </p>
        </div>
        {canManage && editing === null && (
          <button
            onClick={() => setEditing("new")}
            className="inline-flex shrink-0 items-center gap-1.5 rounded bg-heritage px-3 py-2 text-sm font-semibold text-white hover:bg-heritage/90"
          >
            <Plus className="size-4" /> New automation
          </button>
        )}
      </header>

      {!canManage && (
        <div className="mb-6 border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 size-4 shrink-0 text-amber-700" />
            <div className="flex-1">
              <strong className="inline-flex items-center gap-1.5 font-semibold">
                <Sparkles className="size-3.5" /> Scale feature
              </strong>
              <p className="mt-1.5 leading-relaxed">
                Building custom automations is part of the Scale and Enterprise tiers. Your default
                stage-change notification still runs below — you can turn it on or off any time.
              </p>
              <a
                href="/employer/billing"
                className="mt-2 inline-block font-semibold text-amber-900 underline-offset-2 hover:underline"
              >
                Upgrade to Scale →
              </a>
            </div>
          </div>
        </div>
      )}

      {editing === "new" && (
        <RuleForm
          jobs={jobs}
          teammates={teammates}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      <ul className="space-y-3">
        {rules.map((rule) => (
          <li key={rule.id}>
            {editing === rule.id ? (
              <RuleForm
                jobs={jobs}
                teammates={teammates}
                existing={rule}
                onClose={() => setEditing(null)}
                onSaved={() => {
                  setEditing(null);
                  router.refresh();
                }}
              />
            ) : (
              <RuleRow
                rule={rule}
                jobs={jobs}
                teammates={teammates}
                canManage={canManage}
                onEdit={() => setEditing(rule.id)}
                onChanged={() => router.refresh()}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── one rule row ─────────────────────────────────────────────────────
function RuleRow({
  rule,
  jobs,
  teammates,
  canManage,
  onEdit,
  onChanged,
}: {
  rule: RuleView;
  jobs: JobOpt[];
  teammates: TeammateOpt[];
  canManage: boolean;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function toggle() {
    setErr(null);
    start(async () => {
      const res = await setRuleEnabled(rule.id, !rule.is_enabled);
      if (!res.ok) setErr(res.error);
      else onChanged();
    });
  }
  function remove() {
    if (!confirm("Delete this automation? This can't be undone.")) return;
    setErr(null);
    start(async () => {
      const res = await deleteAutomationRule(rule.id);
      if (!res.ok) setErr(res.error);
      else onChanged();
    });
  }

  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-ink">{rule.name}</span>
            {rule.is_system && (
              <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[11px] font-medium text-ink/60">
                Default
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] leading-snug text-ink/60">
            {ruleSentence(rule.trigger_kind, rule.conditions, rule.actions, jobs, teammates)}
          </p>
          <p className="mt-1.5 text-[11px] text-ink/40">
            Fired {rule.firedCount} {rule.firedCount === 1 ? "time" : "times"}
          </p>
          {err && <p className="mt-1 text-[12px] text-rose-600">{err}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canManage && (
            <button
              onClick={onEdit}
              className="rounded p-1.5 text-ink/50 hover:bg-ink/5 hover:text-ink"
              title="Edit"
            >
              <Pencil className="size-4" />
            </button>
          )}
          {canManage && !rule.is_system && (
            <button
              onClick={remove}
              disabled={pending}
              className="rounded p-1.5 text-ink/50 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
              title="Delete"
            >
              <Trash2 className="size-4" />
            </button>
          )}
          <button
            onClick={toggle}
            disabled={pending}
            role="switch"
            aria-checked={rule.is_enabled}
            className={
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 " +
              (rule.is_enabled ? "bg-heritage" : "bg-ink/20")
            }
            title={rule.is_enabled ? "Enabled" : "Disabled"}
          >
            <span
              className={
                "inline-block size-4 transform rounded-full bg-white transition-transform " +
                (rule.is_enabled ? "translate-x-4" : "translate-x-0.5")
              }
            />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── builder form ─────────────────────────────────────────────────────
function RuleForm({
  jobs,
  teammates,
  existing,
  onClose,
  onSaved,
}: {
  jobs: JobOpt[];
  teammates: TeammateOpt[];
  existing?: RuleView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [dry, setDry] = useState<{ sampled: number; matched: number } | null>(null);

  const [draft, setDraft] = useState<Draft>(() => ({
    name: existing?.name ?? "",
    trigger_kind: (existing?.trigger_kind as TriggerKind) ?? "application.stage_changed",
    conditions: existing?.conditions ?? [],
    actions: (existing?.actions ?? [
      { action_kind: "email_candidate", config: { template_kind: "candidate.stage_changed" } },
    ]).map((a) => normalizeAction(a)),
  }));

  const sentence = useMemo(
    () => ruleSentence(draft.trigger_kind, draft.conditions, draft.actions, jobs, teammates),
    [draft, jobs, teammates]
  );

  function changeTrigger(trigger: TriggerKind) {
    // Switching trigger resets conditions + actions to valid defaults for it.
    let conditions: RuleCondition[] = [];
    let defaultAction: DraftAction;
    if (trigger === "application.received") {
      defaultAction = { action_kind: "add_tag", config: { label: "", color: "slate" } };
    } else if (trigger === "application.idle_in_stage") {
      conditions = [{ field: "days_in_stage", op: "gte", value: DEFAULT_IDLE_DAYS }];
      defaultAction = { action_kind: "notify_teammate", config: { target_dso_user_id: "" } };
    } else {
      defaultAction = { action_kind: "email_candidate", config: { template_kind: "candidate.stage_changed" } };
    }
    setDraft((d) => ({ ...d, trigger_kind: trigger, conditions, actions: [defaultAction] }));
    setDry(null);
  }

  const isIdle = draft.trigger_kind === "application.idle_in_stage";
  const otherConditions = isIdle
    ? draft.conditions.filter((c) => c.field !== "days_in_stage")
    : draft.conditions;
  function setOtherConditions(next: RuleCondition[]) {
    if (isIdle) {
      const days = draft.conditions.find((c) => c.field === "days_in_stage") ?? {
        field: "days_in_stage",
        op: "gte" as const,
        value: DEFAULT_IDLE_DAYS,
      };
      setDraft((d) => ({ ...d, conditions: [days, ...next] }));
    } else {
      setDraft((d) => ({ ...d, conditions: next }));
    }
    setDry(null);
  }
  function setIdleDays(n: number) {
    setDraft((d) => ({
      ...d,
      conditions: [
        { field: "days_in_stage", op: "gte", value: n },
        ...d.conditions.filter((c) => c.field !== "days_in_stage"),
      ],
    }));
  }

  function save() {
    setErr(null);
    const payload = {
      name: draft.name,
      trigger_kind: draft.trigger_kind,
      conditions: draft.conditions,
      actions: draft.actions.map((a) => ({ action_kind: a.action_kind, config: a.config })),
    };
    start(async () => {
      const res = existing
        ? await updateAutomationRule(existing.id, payload)
        : await createAutomationRule(payload);
      if (!res.ok) setErr(res.error);
      else onSaved();
    });
  }

  function runDry() {
    setErr(null);
    start(async () => {
      const res = await dryRunStageChangedRule(draft.conditions);
      if (!res.ok) setErr(res.error);
      else setDry({ sampled: res.sampled, matched: res.matched });
    });
  }

  const isStageTrigger = draft.trigger_kind === "application.stage_changed";

  return (
    <div className="rounded-lg border-2 border-heritage/40 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">
          {existing ? "Edit automation" : "New automation"}
        </h2>
      </div>

      {/* name */}
      <label className="mb-1 block text-[12px] font-medium text-ink/70">Name</label>
      <input
        value={draft.name}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        placeholder="e.g. Ping the office manager on new hygienist applications"
        className="mb-4 w-full rounded border border-ink/15 px-3 py-2 text-sm focus:border-heritage focus:outline-none"
      />

      {/* trigger */}
      <div className="mb-4">
        <label className="mb-1 block text-[12px] font-medium text-ink/70">When</label>
        {existing ? (
          <div className="rounded border border-ink/10 bg-ink/[0.02] px-3 py-2 text-sm text-ink/80">
            {TRIGGER_OPTS.find((t) => t.value === draft.trigger_kind)?.label}
            <span className="ml-2 text-[11px] text-ink/40">A rule's trigger can't be changed</span>
          </div>
        ) : (
          <select
            value={draft.trigger_kind}
            onChange={(e) => changeTrigger(e.target.value as TriggerKind)}
            className="w-full rounded border border-ink/15 px-3 py-2 text-sm"
          >
            {TRIGGER_OPTS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {isIdle && (
        <div className="mb-4">
          <label className="mb-1 block text-[12px] font-medium text-ink/70">
            After how many days in a stage
          </label>
          <div className="flex items-center gap-2 text-sm text-ink/70">
            <input
              type="number"
              min={1}
              max={365}
              value={idleDaysFromConditions(draft.conditions)}
              onChange={(e) => setIdleDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
              className="w-20 rounded border border-ink/15 px-2 py-1.5 text-sm focus:border-heritage focus:outline-none"
            />
            <span>days with no stage change</span>
          </div>
        </div>
      )}

      <ConditionsEditor
        trigger={draft.trigger_kind}
        jobs={jobs}
        conditions={otherConditions}
        onChange={setOtherConditions}
      />

      <ActionsEditor
        trigger={draft.trigger_kind}
        teammates={teammates}
        actions={draft.actions}
        onChange={(actions) => setDraft((d) => ({ ...d, actions }))}
      />

      {/* live sentence */}
      <div className="mt-4 rounded bg-heritage/5 px-3 py-2 text-[13px] text-ink/75">{sentence}</div>

      {/* dry run — stage-change trigger only */}
      {isStageTrigger && (
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={runDry}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded border border-ink/15 px-2.5 py-1.5 text-[12px] font-medium text-ink/70 hover:bg-ink/5 disabled:opacity-50"
          >
            <FlaskConical className="size-3.5" /> Test against recent moves
          </button>
          {dry && (
            <span className="text-[12px] text-ink/60">
              Would have fired on <strong className="text-ink">{dry.matched}</strong> of your last{" "}
              {dry.sampled} stage move{dry.sampled === 1 ? "" : "s"}.
            </span>
          )}
        </div>
      )}

      {err && <p className="mt-3 text-[12px] text-rose-600">{err}</p>}

      <div className="mt-5 flex items-center gap-2">
        <button
          onClick={save}
          disabled={pending}
          className="rounded bg-heritage px-3 py-2 text-sm font-semibold text-white hover:bg-heritage/90 disabled:opacity-50"
        >
          {existing ? "Save changes" : "Create automation"}
        </button>
        <button
          onClick={onClose}
          disabled={pending}
          className="rounded px-3 py-2 text-sm font-medium text-ink/60 hover:bg-ink/5"
        >
          Cancel
        </button>
        {!existing && (
          <span className="ml-auto text-[11px] text-ink/40">New automations start turned off.</span>
        )}
      </div>
    </div>
  );
}

function normalizeAction(a: { action_kind: string; config: Record<string, unknown> }): DraftAction {
  if (a.action_kind === "add_tag") {
    return {
      action_kind: "add_tag",
      config: {
        label: String((a.config?.label as string | undefined) ?? ""),
        color: String((a.config?.color as string | undefined) ?? "slate"),
      },
    };
  }
  if (a.action_kind === "notify_teammate" || a.action_kind === "assign") {
    return {
      action_kind: a.action_kind,
      config: { target_dso_user_id: String((a.config?.target_dso_user_id as string | undefined) ?? "") },
    };
  }
  if (a.action_kind === "inbox_system_message") {
    return { action_kind: "inbox_system_message", config: {} };
  }
  return { action_kind: "email_candidate", config: { template_kind: "candidate.stage_changed" } };
}

// ── conditions editor ────────────────────────────────────────────────
function ConditionsEditor({
  trigger,
  jobs,
  conditions,
  onChange,
}: {
  trigger: TriggerKind;
  jobs: JobOpt[];
  conditions: RuleCondition[];
  onChange: (c: RuleCondition[]) => void;
}) {
  const allowedFields = FIELDS_FOR_TRIGGER[trigger];

  function addCondition() {
    const field = allowedFields[0];
    onChange([...conditions, { field, op: "in", value: [] }]);
  }
  function update(idx: number, next: RuleCondition) {
    onChange(conditions.map((c, i) => (i === idx ? next : c)));
  }
  function remove(idx: number) {
    onChange(conditions.filter((_, i) => i !== idx));
  }

  return (
    <div className="mb-4">
      <label className="mb-1 block text-[12px] font-medium text-ink/70">
        Only if <span className="font-normal text-ink/40">(optional — leave empty for every one)</span>
      </label>
      <div className="space-y-2">
        {conditions.map((c, idx) => (
          <div key={idx} className="flex flex-wrap items-center gap-2 rounded border border-ink/10 p-2">
            <select
              value={c.field}
              onChange={(e) => update(idx, { field: e.target.value, op: "in", value: [] })}
              className="rounded border border-ink/15 px-2 py-1.5 text-[13px]"
            >
              {allowedFields.includes("to_kind") && (
                <option value="to_kind">
                  {trigger === "application.idle_in_stage" ? "in stage" : "moves to"}
                </option>
              )}
              {allowedFields.includes("from_kind") && <option value="from_kind">moves from</option>}
              {allowedFields.includes("job_id") && <option value="job_id">for job</option>}
            </select>

            {c.field === "job_id" ? (
              <select
                multiple
                value={(Array.isArray(c.value) ? c.value : []).map(String)}
                onChange={(e) =>
                  update(idx, { ...c, value: Array.from(e.target.selectedOptions).map((o) => o.value) })
                }
                className="min-w-[12rem] flex-1 rounded border border-ink/15 px-2 py-1.5 text-[13px]"
              >
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex flex-1 flex-wrap gap-1.5">
                {STAGE_OPTS.map((opt) => {
                  const selected = (Array.isArray(c.value) ? c.value : []).map(String).includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        const cur = (Array.isArray(c.value) ? c.value : []).map(String);
                        const next = selected ? cur.filter((v) => v !== opt.value) : [...cur, opt.value];
                        update(idx, { ...c, value: next });
                      }}
                      className={
                        "rounded-full px-2.5 py-1 text-[12px] font-medium " +
                        (selected ? "bg-heritage text-white" : "bg-ink/5 text-ink/60 hover:bg-ink/10")
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => remove(idx)}
              className="rounded p-1 text-ink/40 hover:bg-rose-50 hover:text-rose-600"
              title="Remove condition"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addCondition}
        className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-heritage hover:underline"
      >
        <Plus className="size-3.5" /> Add condition
      </button>
    </div>
  );
}

// ── actions editor ───────────────────────────────────────────────────
function ActionsEditor({
  trigger,
  teammates,
  actions,
  onChange,
}: {
  trigger: TriggerKind;
  teammates: TeammateOpt[];
  actions: DraftAction[];
  onChange: (a: DraftAction[]) => void;
}) {
  const allowed = ACTIONS_FOR_TRIGGER[trigger];

  function defaultAction(): DraftAction {
    return allowed.includes("add_tag")
      ? { action_kind: "add_tag", config: { label: "", color: "slate" } }
      : { action_kind: "notify_teammate", config: { target_dso_user_id: "" } };
  }
  function add() {
    onChange([...actions, defaultAction()]);
  }
  function update(idx: number, next: DraftAction) {
    onChange(actions.map((a, i) => (i === idx ? next : a)));
  }
  function remove(idx: number) {
    onChange(actions.filter((_, i) => i !== idx));
  }
  function changeKind(idx: number, kind: DraftAction["action_kind"]) {
    if (kind === "add_tag") update(idx, { action_kind: "add_tag", config: { label: "", color: "slate" } });
    else if (kind === "inbox_system_message") update(idx, { action_kind: "inbox_system_message", config: {} });
    else if (kind === "notify_teammate") update(idx, { action_kind: "notify_teammate", config: { target_dso_user_id: "" } });
    else if (kind === "assign") update(idx, { action_kind: "assign", config: { target_dso_user_id: "" } });
    else update(idx, { action_kind: "email_candidate", config: { template_kind: "candidate.stage_changed" } });
  }

  return (
    <div className="mb-2">
      <label className="mb-1 block text-[12px] font-medium text-ink/70">Then</label>
      <div className="space-y-2">
        {actions.map((a, idx) => (
          <div key={idx} className="flex flex-wrap items-center gap-2 rounded border border-ink/10 p-2">
            <select
              value={a.action_kind}
              onChange={(e) => changeKind(idx, e.target.value as DraftAction["action_kind"])}
              className="rounded border border-ink/15 px-2 py-1.5 text-[13px]"
            >
              {allowed.map((k) => (
                <option key={k} value={k}>
                  {ACTION_LABELS[k]}
                </option>
              ))}
            </select>

            {a.action_kind === "add_tag" && (
              <>
                <input
                  value={a.config.label}
                  onChange={(e) =>
                    update(idx, { action_kind: "add_tag", config: { ...a.config, label: e.target.value } })
                  }
                  placeholder="Tag label"
                  maxLength={40}
                  className="flex-1 rounded border border-ink/15 px-2 py-1.5 text-[13px]"
                />
                <select
                  value={a.config.color}
                  onChange={(e) =>
                    update(idx, { action_kind: "add_tag", config: { ...a.config, color: e.target.value } })
                  }
                  className="rounded border border-ink/15 px-2 py-1.5 text-[13px]"
                >
                  {TAG_COLORS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </>
            )}
            {(a.action_kind === "notify_teammate" || a.action_kind === "assign") && (
              <select
                value={a.config.target_dso_user_id}
                onChange={(e) =>
                  update(idx, { action_kind: a.action_kind, config: { target_dso_user_id: e.target.value } })
                }
                className="flex-1 rounded border border-ink/15 px-2 py-1.5 text-[13px]"
              >
                <option value="">Choose a teammate…</option>
                {teammates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            {a.action_kind === "email_candidate" && (
              <span className="text-[12px] text-ink/45">uses your “Stage moved” template</span>
            )}
            {a.action_kind === "inbox_system_message" && (
              <span className="text-[12px] text-ink/45">drops a “moved to …” note in their inbox</span>
            )}

            {actions.length > 1 && (
              <button
                type="button"
                onClick={() => remove(idx)}
                className="ml-auto rounded p-1 text-ink/40 hover:bg-rose-50 hover:text-rose-600"
                title="Remove action"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-heritage hover:underline"
      >
        <Plus className="size-3.5" /> Add action
      </button>
    </div>
  );
}
