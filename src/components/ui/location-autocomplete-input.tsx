"use client";

/**
 * LocationAutocompleteInput — typo-proof "City, ST" chip input.
 *
 * A drop-in alternative to ChipArrayInput for location lists. Instead of
 * free-typing a city/state (which lets "Prairie Village, KSS" through and
 * silently breaks location matching), the user types and PICKS from a
 * Mapbox-powered suggestion list. We store the CANONICAL "City, ST" (e.g.
 * "Prairie Village, KS") derived from the Mapbox feature, so every stored
 * value is consistent + matchable.
 *
 * Uses NEXT_PUBLIC_MAPBOX_TOKEN directly client-side (it's the same public
 * token the public /jobs map already exposes). Debounced; US places only.
 * If the token is missing or Mapbox is unreachable, it degrades to letting
 * the user add the raw typed value on Enter so they're never hard-blocked.
 */

import * as React from "react";
import { X, MapPin, Loader2 } from "lucide-react";

interface Suggestion {
  /** Canonical "City, ST" we store. */
  value: string;
  /** Display label, e.g. "Prairie Village, Kansas". */
  label: string;
}

interface MapboxFeature {
  text?: string;
  place_name?: string;
  context?: Array<{ id?: string; short_code?: string; text?: string }>;
}

function toSuggestion(f: MapboxFeature): Suggestion | null {
  const city = (f.text ?? "").trim();
  if (!city) return null;
  const region = (f.context ?? []).find((c) => (c.id ?? "").startsWith("region"));
  const short = region?.short_code ?? ""; // e.g. "US-KS"
  const stateAbbr = short.includes("-") ? short.split("-")[1].toUpperCase() : "";
  if (!stateAbbr) return null;
  const regionName = region?.text ?? stateAbbr;
  return { value: `${city}, ${stateAbbr}`, label: `${city}, ${regionName}` };
}

// ─────────────────────────────────────────────────────────────────────
// Single-select variant — for the many "one city" surfaces (job search
// "Near", candidate current location, employer location/HQ forms). Emits
// the chosen city/state as hidden inputs (form-native surfaces) and/or via
// an onSelect callback (client-state surfaces). Selection-only → typo-proof.
// ─────────────────────────────────────────────────────────────────────

export function LocationAutocompleteField({
  label,
  helper,
  placeholder = "Start typing a city…",
  defaultCity = "",
  defaultState = "",
  cityName,
  stateName,
  combinedName,
  onSelect,
  disabled,
  id,
}: {
  label?: string;
  helper?: string;
  placeholder?: string;
  defaultCity?: string;
  defaultState?: string;
  /** Hidden input name to emit the chosen city (separate-field surfaces). */
  cityName?: string;
  /** Hidden input name to emit the chosen state abbreviation. */
  stateName?: string;
  /** Hidden input name to emit a combined "City, ST" (e.g. /jobs ?near=). */
  combinedName?: string;
  /** Callback for client-state surfaces; ("","") on clear. */
  onSelect?: (city: string, state: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  const initial =
    defaultCity && defaultState ? { city: defaultCity, state: defaultState } : null;
  const [selected, setSelected] = React.useState<{ city: string; state: string } | null>(initial);
  const [draft, setDraft] = React.useState(initial ? `${defaultCity}, ${defaultState}` : "");
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  React.useEffect(() => {
    const q = draft.trim();
    if (selected && q === `${selected.city}, ${selected.state}`) {
      setSuggestions([]);
      return;
    }
    if (q.length < 2 || !token) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
          `?country=us&types=place&autocomplete=true&limit=5&access_token=${encodeURIComponent(token)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { features?: MapboxFeature[] };
        if (cancelled) return;
        setSuggestions(
          (json.features ?? []).map(toSuggestion).filter((s): s is Suggestion => s !== null)
        );
        setActiveIdx(0);
        setOpen(true);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [draft, token, selected]);

  function choose(s: Suggestion) {
    const [city, state] = s.value.split(", ");
    setSelected({ city: city ?? "", state: state ?? "" });
    setDraft(s.value);
    setSuggestions([]);
    setOpen(false);
    onSelect?.(city ?? "", state ?? "");
  }
  function clear() {
    setSelected(null);
    setDraft("");
    setSuggestions([]);
    setOpen(false);
    onSelect?.("", "");
  }
  function onDraft(v: string) {
    setDraft(v);
    if (selected) {
      setSelected(null);
      onSelect?.("", "");
    }
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(suggestions.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions[activeIdx]) choose(suggestions[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div>
      {label && <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>}
      {helper && <span className="mb-1.5 block text-xs text-muted-foreground">{helper}</span>}

      {combinedName && selected && (
        <input type="hidden" name={combinedName} value={`${selected.city}, ${selected.state}`} />
      )}
      {cityName && <input type="hidden" name={cityName} value={selected?.city ?? ""} />}
      {stateName && <input type="hidden" name={stateName} value={selected?.state ?? ""} />}

      <div className="relative">
        <div className="flex items-center gap-2 rounded border border-[var(--rule-strong,#cbd5e1)] bg-card px-3 py-2 focus-within:border-heritage">
          <MapPin className="size-4 shrink-0 text-meta-foreground" aria-hidden />
          <input
            id={id}
            type="text"
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-meta-foreground focus:outline-none disabled:opacity-60"
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
          />
          {selected && !disabled && (
            <button
              type="button"
              onClick={clear}
              className="shrink-0 text-meta-foreground hover:text-foreground"
              aria-label="Clear location"
            >
              <X className="size-3.5" />
            </button>
          )}
          {loading && <Loader2 className="size-3.5 shrink-0 animate-spin text-meta-foreground" />}
        </div>

        {open && suggestions.length > 0 && (
          <ul
            role="listbox"
            className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded border border-border bg-popover py-1 shadow-lg"
          >
            {suggestions.map((s, idx) => (
              <li
                key={s.value}
                role="option"
                aria-selected={idx === activeIdx}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
                className={
                  "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm " +
                  (idx === activeIdx ? "bg-heritage/10 text-foreground" : "text-foreground")
                }
              >
                <MapPin className="size-3.5 shrink-0 text-heritage" aria-hidden />
                {s.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface Props {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  helper?: string;
}

export function LocationAutocompleteInput({
  label,
  values,
  onChange,
  placeholder = "Start typing a city…",
  helper,
}: Props) {
  const [draft, setDraft] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // Debounced Mapbox autocomplete.
  React.useEffect(() => {
    const q = draft.trim();
    if (q.length < 2 || !token) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
          `?country=us&types=place&autocomplete=true&limit=5&access_token=${encodeURIComponent(token)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { features?: MapboxFeature[] };
        if (cancelled) return;
        const next = (json.features ?? [])
          .map(toSuggestion)
          .filter((s): s is Suggestion => s !== null)
          .filter((s) => !values.includes(s.value));
        setSuggestions(next);
        setActiveIdx(0);
        setOpen(true);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [draft, token, values]);

  function addValue(v: string) {
    const clean = v.trim();
    if (!clean || values.includes(clean)) {
      setDraft("");
      setSuggestions([]);
      setOpen(false);
      return;
    }
    onChange([...values, clean]);
    setDraft("");
    setSuggestions([]);
    setOpen(false);
  }

  function remove(idx: number) {
    onChange(values.filter((_, i) => i !== idx));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(suggestions.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions[activeIdx]) addValue(suggestions[activeIdx].value);
      // Fallback only when Mapbox returned nothing (token missing / offline):
      // let the raw typed value through so the user isn't hard-blocked.
      else if (!token && draft.trim()) addValue(draft);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      {helper && <span className="mb-1.5 block text-xs text-muted-foreground">{helper}</span>}

      <div className="mb-2 flex flex-wrap gap-2">
        {values.length === 0 ? (
          <span className="text-xs italic text-meta-foreground">None added yet.</span>
        ) : (
          values.map((v, i) => (
            <span
              key={`${v}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-heritage/10 px-3 py-1 text-sm text-foreground"
            >
              <MapPin className="size-3" aria-hidden />
              {v}
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-heritage hover:text-foreground"
                aria-label={`Remove ${v}`}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))
        )}
      </div>

      <div className="relative">
        <div className="flex items-center gap-2 rounded border border-[var(--rule-strong,#cbd5e1)] bg-card px-3 py-2 focus-within:border-heritage">
          <MapPin className="size-4 shrink-0 text-meta-foreground" aria-hidden />
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            placeholder={placeholder}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-meta-foreground focus:outline-none"
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
          />
          {loading && <Loader2 className="size-3.5 shrink-0 animate-spin text-meta-foreground" />}
        </div>

        {open && suggestions.length > 0 && (
          <ul
            role="listbox"
            className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded border border-border bg-popover py-1 shadow-lg"
          >
            {suggestions.map((s, idx) => (
              <li
                key={s.value}
                role="option"
                aria-selected={idx === activeIdx}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addValue(s.value);
                }}
                className={
                  "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm " +
                  (idx === activeIdx ? "bg-heritage/10 text-foreground" : "text-foreground")
                }
              >
                <MapPin className="size-3.5 shrink-0 text-heritage" aria-hidden />
                {s.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      {!token && (
        <span className="mt-1 block text-[11px] text-meta-foreground">
          Type a full “City, ST” and press Enter.
        </span>
      )}
    </div>
  );
}
