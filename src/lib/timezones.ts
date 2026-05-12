/**
 * Timezone utilities for interview scheduling (Phase 5A Day 2 polish).
 *
 * Native JS has no `zonedTimeToUtc` function — `new Date("2026-05-12T13:15")`
 * is always interpreted in the browser's local TZ. This module fills the
 * gap with two helpers that use `Intl.DateTimeFormat` (which DOES know
 * about IANA TZs):
 *
 *   - `zonedTimeToUtc({year,month,day,hour,minute}, tz)` — interprets a
 *     wall-clock time AS IF it were entered in `tz`, returns the UTC Date.
 *   - `formatInTimezone(date, tz)` — renders an ISO date as a localized
 *     string in `tz`, matching the candidate-picker's two-line format.
 *
 * Plus a constant `US_TIMEZONES` list used in both the propose modal
 * (employer picks which TZ they're typing in) and the candidate picker
 * (candidate picks display TZ).
 *
 * Edge case: DST transitions. On the 1-2 hours/year when wall-clock
 * times don't exist (spring forward) or exist twice (fall back),
 * `zonedTimeToUtc` returns the standard-time interpretation. For
 * interview scheduling this is acceptable — users won't propose 2:30am
 * slots, and the candidate-side formatter renders the actual UTC moment
 * the same way either way.
 */

export interface TimezoneOption {
  /** IANA timezone identifier — `Intl.DateTimeFormat` understands this. */
  id: string;
  /** Short label for the dropdown UI. */
  label: string;
  /** Longer description for hover/screen-reader. */
  description: string;
}

/**
 * US-focused timezone list. DSO Hire serves US-only customers (per
 * `feedback_no_practice_count_ceiling.md` posture), so these cover the
 * vast majority of real interview-scheduling cases.
 */
export const US_TIMEZONES: TimezoneOption[] = [
  {
    id: "America/New_York",
    label: "Eastern Time",
    description: "Eastern Time (ET) — New York, Atlanta, Miami",
  },
  {
    id: "America/Chicago",
    label: "Central Time",
    description: "Central Time (CT) — Chicago, Dallas, Houston",
  },
  {
    id: "America/Denver",
    label: "Mountain Time",
    description: "Mountain Time (MT) — Denver, Salt Lake City",
  },
  {
    id: "America/Phoenix",
    label: "Arizona",
    description: "Arizona Time — Phoenix, Tucson (no DST)",
  },
  {
    id: "America/Los_Angeles",
    label: "Pacific Time",
    description: "Pacific Time (PT) — Los Angeles, Seattle, San Francisco",
  },
  {
    id: "America/Anchorage",
    label: "Alaska",
    description: "Alaska Time — Anchorage, Juneau",
  },
  {
    id: "Pacific/Honolulu",
    label: "Hawaii",
    description: "Hawaii Time — Honolulu (no DST)",
  },
];

/**
 * Detect the browser's current IANA timezone via `Intl`. Falls back to
 * Central Time on the off chance the browser doesn't expose it — Central
 * is the geographic middle of the US-only customer base.
 */
export function getBrowserTimezone(): string {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected && typeof detected === "string") return detected;
  } catch {
    /* fall through */
  }
  return "America/Chicago";
}

/**
 * Best-effort: find the matching US_TIMEZONES entry for an IANA id.
 * Returns null when the browser TZ isn't one of the seven options
 * (e.g., America/Toronto, Europe/London) — callers fall back to
 * showing the raw IANA id or to a generic "Other" entry.
 */
export function getUSTimezoneOption(id: string): TimezoneOption | null {
  return US_TIMEZONES.find((t) => t.id === id) ?? null;
}

interface WallClockTime {
  year: number;
  /** 1-indexed (Jan=1). Matches what user input forms typically send. */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/**
 * Convert a wall-clock time interpreted in `timezone` to a UTC Date.
 *
 * Example: zonedTimeToUtc({y:2026,m:5,d:12,h:13,min:15}, "America/Chicago")
 * → Date representing 2026-05-12 18:15 UTC (CDT is UTC-5 in May).
 *
 * Algorithm:
 *   1. Pretend the wall-clock is UTC. That gives an initial guess.
 *   2. Render that guess back into `timezone` via Intl.
 *   3. Diff the resulting wall-clock against the input — that's the
 *      timezone offset.
 *   4. Apply the offset to get the real UTC moment.
 *
 * Why this dance: native JS Date has no "parse this as if it were TZ X"
 * function. The DST-aware way to derive the offset is via Intl.
 */
export function zonedTimeToUtc(
  wallClock: WallClockTime,
  timezone: string
): Date {
  // Step 1: treat the wall-clock as UTC (initial guess).
  const utcGuess = Date.UTC(
    wallClock.year,
    wallClock.month - 1, // Date.UTC is 0-indexed
    wallClock.day,
    wallClock.hour,
    wallClock.minute
  );

  // Step 2: render the UTC guess as wall-clock in `timezone`.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(utcGuess))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );

  // Step 3: rebuild the rendered wall-clock as if it were UTC.
  const tzWallClockAsUtc = Date.UTC(
    parseInt(parts.year, 10),
    parseInt(parts.month, 10) - 1,
    parseInt(parts.day, 10),
    parseInt(parts.hour, 10) % 24, // Some locales render midnight as "24"
    parseInt(parts.minute, 10)
  );

  // Step 4: the offset is the diff. Subtract from initial guess to get
  // the actual UTC moment that, when viewed in `timezone`, shows the
  // user's wall-clock input.
  const offsetMs = utcGuess - tzWallClockAsUtc;
  return new Date(utcGuess + offsetMs);
}

/**
 * Parse the propose-modal's split inputs (`date: "2026-05-12"`,
 * `time: "13:15"`) into the WallClockTime shape `zonedTimeToUtc` wants.
 * Returns null on malformed input so callers can show a user error.
 */
export function parseWallClock(
  date: string,
  time: string
): WallClockTime | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return null;
  return {
    year: parseInt(dm[1], 10),
    month: parseInt(dm[2], 10),
    day: parseInt(dm[3], 10),
    hour: parseInt(tm[1], 10),
    minute: parseInt(tm[2], 10),
  };
}

/**
 * Format an ISO date in a given timezone for display in the candidate
 * picker. Returns the same two-line shape (`line1` = day,
 * `line2` = time + tz) as the existing `formatSlot` helper so the
 * picker can drop this in without restructuring.
 */
export function formatInTimezone(
  iso: string,
  timezone: string
): { line1: string; line2: string } {
  const d = new Date(iso);
  return {
    line1: d.toLocaleDateString("en-US", {
      timeZone: timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
    line2: d.toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }),
  };
}
