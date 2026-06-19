"use client";

/**
 * Employer notification preferences matrix (Phase 4.5.c).
 *
 * One section card per event group (Pipeline / Team / Performance /
 * Account / Updates) with a row per event kind and a toggle per channel
 * (email + in_app in v1; SMS deferred). Local state mirrors saved server
 * state; sticky save bar at the bottom commits via the server action.
 *
 * Save semantics: only changed rows are submitted as one upsert batch
 * so the dispatch_log audit stays minimal even if the user clicks 30
 * toggles before saving.
 *
 * Forced events (`employer.team_invite`) render with the toggle locked
 * "on" and a small lock icon. The dispatcher's ALWAYS_DISPATCH_EVENTS
 * set is the source of truth — this UI is just visual transparency.
 */

import { useMemo, useState, useTransition } from "react";
import { Check, Save, AlertCircle, Sparkles, Lock } from "lucide-react";
import {
  EMPLOYER_NOTIFICATION_EVENTS,
  EMPLOYER_NOTIFICATION_GROUP_ORDER,
  type EmployerNotificationEvent,
} from "@/lib/notifications/employer-events";
import {
  saveEmployerNotificationPreferences,
  type PreferenceRow,
} from "./actions";

type PrefsState = Record<string, Record<string, boolean>>;

export interface EmployerNotificationsFormProps {
  /** Current saved state, sourced from notification_preferences. */
  initial: PrefsState;
}

export function EmployerNotificationsForm({
  initial,
}: EmployerNotificationsFormProps) {
  const [prefs, setPrefs] = useState<PrefsState>(initial);
  const [, startSaving] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const dirty = useMemo(() => {
    const out: PreferenceRow[] = [];
    for (const [event_kind, channels] of Object.entries(prefs)) {
      for (const [channel, enabled] of Object.entries(channels)) {
        if (initial[event_kind]?.[channel] !== enabled) {
          out.push({ event_kind, channel, enabled });
        }
      }
    }
    return out;
  }, [prefs, initial]);

  const toggle = (eventKind: string, channel: string) => {
    setPrefs((prev) => ({
      ...prev,
      [eventKind]: {
        ...(prev[eventKind] ?? {}),
        [channel]: !(prev[eventKind]?.[channel] ?? true),
      },
    }));
  };

  const onSave = () => {
    if (dirty.length === 0) return;
    setError(null);
    setSavedFlash(null);
    setSaving(true);
    startSaving(async () => {
      const result = await saveEmployerNotificationPreferences(dirty);
      setSaving(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedFlash(
        `Saved · ${result.saved} preference${result.saved === 1 ? "" : "s"} updated.`
      );
      window.setTimeout(() => setSavedFlash(null), 2500);
    });
  };

  const groups = EMPLOYER_NOTIFICATION_GROUP_ORDER.map((group) => ({
    group,
    events: EMPLOYER_NOTIFICATION_EVENTS.filter((e) => e.group === group),
  })).filter((g) => g.events.length > 0);

  return (
    <div className="space-y-5 max-w-[760px]">
      {groups.map(({ group, events }) => (
        <section
          key={group}
          className="border border-[var(--rule)] bg-card p-6 sm:p-8"
        >
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
            {group}
          </div>
          <ul className="divide-y divide-[var(--rule)]">
            {events.map((event) => (
              <EventRow
                key={event.event_kind}
                event={event}
                prefs={prefs[event.event_kind] ?? {}}
                onToggle={(channel) => toggle(event.event_kind, channel)}
              />
            ))}
          </ul>
        </section>
      ))}

      {/* Sticky save bar */}
      <div className="sticky bottom-4 z-10 flex items-center justify-between border border-[var(--rule-strong)] bg-card/95 px-5 py-3 backdrop-blur shadow-md">
        <div className="text-[13px]">
          {error ? (
            <span className="inline-flex items-center gap-1.5 text-danger">
              <AlertCircle className="h-3.5 w-3.5" /> {error}
            </span>
          ) : savedFlash ? (
            <span className="inline-flex items-center gap-1.5 text-heritage-deep font-semibold">
              <Sparkles className="h-3.5 w-3.5" /> {savedFlash}
            </span>
          ) : dirty.length > 0 ? (
            <span className="text-ink">
              <strong className="font-bold">{dirty.length}</strong> unsaved
              change{dirty.length === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="text-slate-meta">All preferences saved.</span>
          )}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || dirty.length === 0}
          className="inline-flex items-center gap-2 bg-primary px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? (
            "Saving…"
          ) : (
            <>
              <Save className="h-3.5 w-3.5" />
              Save changes
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Event row
 * ───────────────────────────────────────────────────────────────────── */

function EventRow({
  event,
  prefs,
  onToggle,
}: {
  event: EmployerNotificationEvent;
  prefs: Record<string, boolean>;
  onToggle: (channel: string) => void;
}) {
  return (
    <li className="flex items-start justify-between gap-6 py-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[14px] font-bold text-ink">{event.title}</p>
          {event.forced && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-cream border border-[var(--rule-strong)] px-2 py-0.5 text-[9px] font-bold tracking-[1px] uppercase text-slate-body"
              title="Required — needed for the platform to function"
            >
              <Lock className="h-2.5 w-2.5" />
              Required
            </span>
          )}
          {!event.shipped && !event.forced && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold tracking-[1px] uppercase text-slate-meta">
              Coming soon
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[13px] text-slate-body leading-relaxed">
          {event.description}
        </p>
      </div>
      <div className="flex shrink-0 gap-4">
        {event.channels.map((channel) => (
          <ChannelToggle
            key={channel}
            channel={channel}
            label={CHANNEL_LABEL[channel]}
            enabled={event.forced ? true : (prefs[channel] ?? true)}
            disabled={event.forced}
            onChange={() => onToggle(channel)}
          />
        ))}
      </div>
    </li>
  );
}

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  in_app: "In-app",
};

function ChannelToggle({
  channel,
  label,
  enabled,
  disabled,
  onChange,
}: {
  channel: string;
  label: string;
  enabled: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex flex-col items-center gap-1 text-[10px] uppercase tracking-[1px] text-slate-meta">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${label} ${channel} ${enabled ? "on" : "off"}`}
        onClick={disabled ? undefined : onChange}
        disabled={disabled}
        className={`relative h-5 w-9 rounded-full transition ${
          enabled ? "bg-heritage" : "bg-slate-300"
        } ${disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-card transition ${
            enabled ? "left-[18px]" : "left-0.5"
          }`}
        />
        {enabled && (
          <Check
            className="absolute left-1 top-0.5 size-4 text-primary-foreground"
            aria-hidden
          />
        )}
      </button>
    </label>
  );
}
