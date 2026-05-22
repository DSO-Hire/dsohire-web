"use client";

/**
 * AccentColorPicker — lets a candidate personalize their profile header band
 * (2026-05-22). Auto-saves on change (debounced for the native color wheel),
 * with a reset-to-default option. Mirrors the inline-autosave pattern of the
 * avatar upload. Persists candidates.profile_accent_color via a server action;
 * null = the default heritage green.
 */

import { useRef, useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { setCandidateProfileAccentColor } from "./actions";

const DEFAULT_GREEN = "#4D7A60";
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function AccentColorPicker({ initial }: { initial: string | null }) {
  const [color, setColor] = useState<string>(initial ?? "");
  const [, startSaving] = useTransition();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = (value: string | null) => {
    setError(null);
    setSaved(false);
    setSaving(true);
    startSaving(async () => {
      const result = await setCandidateProfileAccentColor(value);
      setSaving(false);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  // Debounced save — the native color input fires continuously while dragging.
  const onColorChange = (next: string) => {
    setColor(next);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => persist(next.toLowerCase()), 450);
  };

  // Hex text field: update live, save on blur if valid.
  const onHexBlur = () => {
    const v = color.trim().toLowerCase();
    if (v === "") {
      persist(null);
      return;
    }
    if (!HEX_RE.test(v)) {
      setError("Use a 6-digit hex like #4D7A60.");
      return;
    }
    setColor(v);
    persist(v);
  };

  const reset = () => {
    setColor("");
    persist(null);
  };

  const swatch = color && HEX_RE.test(color) ? color : DEFAULT_GREEN;

  return (
    <div>
      <h3 className="text-[12px] font-semibold text-ink">
        Profile header color
      </h3>
      <p className="mt-0.5 mb-2.5 text-[12px] text-slate-500 leading-snug">
        Personalize the banner at the top of your profile. Leave it blank for
        our default green.
      </p>
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className="h-9 w-12 flex-shrink-0 rounded border border-slate-300"
          style={{ backgroundColor: swatch }}
          aria-hidden
        />
        <input
          type="color"
          aria-label="Pick header color"
          value={HEX_RE.test(color) ? color : DEFAULT_GREEN}
          onChange={(e) => onColorChange(e.target.value)}
          className="h-9 w-10 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
        />
        <input
          type="text"
          aria-label="Header color hex"
          value={color}
          placeholder={DEFAULT_GREEN}
          maxLength={7}
          onChange={(e) => {
            setSaved(false);
            setError(null);
            setColor(e.target.value);
          }}
          onBlur={onHexBlur}
          className="w-28 rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm shadow-sm focus:border-[#4D7A60] focus:outline-none focus:ring-1 focus:ring-[#4D7A60]"
        />
        {color && (
          <button
            type="button"
            onClick={reset}
            className="text-[12px] font-medium text-slate-500 underline-offset-2 hover:text-ink hover:underline"
          >
            Reset to default
          </button>
        )}
        {saving && (
          <span className="inline-flex items-center gap-1 text-[12px] text-slate-500">
            <Loader2 className="size-3.5 animate-spin" /> Saving…
          </span>
        )}
        {saved && !saving && (
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#4D7A60]">
            <Check className="size-3.5" /> Saved
          </span>
        )}
        {error && (
          <span className="text-[12px] text-red-700">{error}</span>
        )}
      </div>
    </div>
  );
}
