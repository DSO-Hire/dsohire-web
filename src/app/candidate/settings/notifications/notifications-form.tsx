"use client";

/**
 * Notification preferences matrix (Phase 4.3.b).
 *
 * Renders one card per event group (Applications / Jobs / Account /
 * Updates) with a row per event kind and toggles per channel. Local
 * state mirrors saved server state; an "Unsaved changes" banner surfaces
 * when the two diverge, and a sticky save bar at the bottom commits via
 * the server action.
 *
 * Save semantics: only changed rows are submitted. Emits one upsert per
 * dirty (event_kind, channel) pair so the dispatch_log audit stays
 * minimal even if the candidate clicks 30 toggles.
 */

import { useMemo, useState, useTransition } from "react";
import { Check, Save, AlertCircle, Sparkles } from "lucide-react";
import {
  CANDIDATE_NOTIFICATION_EVENTS,
  CANDIDATE_NOTIFICATION_GROUP_ORDER,
  type CandidateNotificationEvent,
} from "@/lib/notifications/candidate-events";
import {
  saveNotificationPreferences,
  type PreferenceRow,
} from "./actions";

type PrefsState = Record<string, Record<string, boolean>>; // [event_kind][channel] -> enabled

export interface NotificationsFormProps {
  /** The current saved state for this candidate, sourced from notification_preferences. */
  initial: PrefsState;
}

export function NotificationsForm({ initial }: NotificationsFormProps) {
  const [prefs, setPrefs] = useState<PrefsState>(initial);
  const [, startSaving] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  // Identify changed rows by comparing against `initial`.
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
      const result = await saveNotificationPreferences(dirty);
      setSaving(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedFlash(
        `Saved · ${result.saved} preference${result.saved === 1 ? "" : "s"} updated.`
      );
      // Clear the flash and reset the dirty baseline by lifting `prefs`
      // into `initial` via reload-effect: the page is re-fetched on
      // revalidate, so on re-mount `initial` reflects the new state.
      // For UX immediacy, we also fade the flash after 2.5s.
      window.setTimeout(() => setSavedFlash(null), 2500);
    });
  };

  // Render groups in canonical order; events within each group keep
  // their declaration order for stability.
  const groups = CANDIDATE_NOTIFICATION_GROUP_ORDER.map((group) => ({
    group,
    events: CANDIDATE_NOTIFICATION_EVENTS.filter((e) => e.group === group),
  })).filter((g) => g.events.length > 0);

  return (
    <div className="space-y-6">
      {groups.map(({ group, events }) => (
        <section
          key={group}
          className="border border-[var(--rule)] bg-white p-6 sm:p-8"
        >
          <h2 className="font-display text-lg font-bold text-[#14233F]">
            {group}
          </h2>
          <ul className="mt-4 divide-y divide-slate-100">
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

      {/* Sticky save bar — always visible, even on long pages. */}
      <div className="sticky bottom-4 z-10 flex items-center justify-between rounded-lg border border-[#14233F]/10 bg-white/95 px-5 py-3 shadow-lg backdrop-blur">
        <div className="text-sm">
          {error ? (
            <span className="inline-flex items-center gap-1 text-red-700">
              <AlertCircle className="size-4" /> {error}
            </span>
          ) : savedFlash ? (
            <span className="inline-flex items-center gap-1 text-[#4D7A60]">
              <Sparkles className="size-4" /> {savedFlash}
            </span>
          ) : dirty.length > 0 ? (
            <span className="text-slate-700">
              {dirty.length} unsaved change{dirty.length === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="text-slate-400">All preferences saved.</span>
          )}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || dirty.length === 0}
          className="inline-flex items-center gap-2 rounded-md bg-[#14233F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d172b] disabled:opacity-50"
        >
          {saving ? (
            <>Saving…</>
          ) : (
            <>
              <Save className="size-4" />
              Save changes
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Single row in the matrix
// ─────────────────────────────────────────────────────────────────────

function EventRow({
  event,
  prefs,
  onToggle,
}: {
  event: CandidateNotificationEvent;
  prefs: Record<string, boolean>;
  onToggle: (channel: string) => void;
}) {
  return (
    <li className="flex items-start justify-between gap-6 py-4">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[#14233F]">{event.title}</p>
          {!event.shipped && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
              Coming soon
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{event.description}</p>
      </div>
      <div className="flex shrink-0 gap-4">
        {event.channels.map((channel) => (
          <ChannelToggle
            key={channel}
            channel={channel}
            label={CHANNEL_LABEL[channel]}
            enabled={prefs[channel] ?? true}
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
  onChange,
}: {
  channel: string;
  label: string;
  enabled: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex flex-col items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${label} ${channel} ${enabled ? "on" : "off"}`}
        onClick={onChange}
        className={`relative h-5 w-9 rounded-full transition ${
          enabled ? "bg-[#4D7A60]" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white transition ${
            enabled ? "left-[18px]" : "left-0.5"
          }`}
        />
        {enabled && (
          <Check
            className="absolute left-1 top-0.5 size-4 text-white"
            aria-hidden
          />
        )}
      </button>
    </label>
  );
}
