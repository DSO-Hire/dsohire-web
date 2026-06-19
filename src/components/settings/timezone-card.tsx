"use client";

/**
 * <TimezoneCard /> — shared settings card for setting the user's preferred
 * display timezone. Used on both /candidate/settings/account and
 * /employer/settings/account. The caller passes the side-specific server
 * action via the `action` prop so we have one UI for two storage paths.
 *
 * Why this exists: per Erica's 2026-05-18 testing pass, UTC was leaking
 * into interview emails and notifications because there was no per-user
 * TZ preference. The supporting column is `preferred_timezone` on both
 * `candidates` and `dso_users` (migration 20260518153211). The settings
 * UI here is what users actually touch.
 */

import { useState, useTransition } from "react";
import { Clock } from "lucide-react";
import { US_TIMEZONES, getBrowserTimezone } from "@/lib/timezones";

type Result = { ok: true } | { ok: false; error: string };

export function TimezoneCard({
  initialTimezone,
  action,
}: {
  initialTimezone: string;
  /** Server action that persists the new TZ. Returns Result. */
  action: (tz: string) => Promise<Result>;
}) {
  const [value, setValue] = useState(initialTimezone);
  const [flash, setFlash] = useState<
    | { kind: "ok"; message: string }
    | { kind: "err"; message: string }
    | null
  >(null);
  const [isPending, startTransition] = useTransition();

  // Detect whether the user's browser TZ differs from their stored
  // preference — surfaces the offer-to-match nudge without surprising them.
  const browserTz = typeof window !== "undefined" ? getBrowserTimezone() : null;
  const browserMatchesStored = browserTz === initialTimezone;
  const browserIsInUSList = browserTz
    ? US_TIMEZONES.some((t) => t.id === browserTz)
    : false;
  const showBrowserHint =
    browserTz && !browserMatchesStored && browserIsInUSList;

  function save(next: string) {
    setFlash(null);
    startTransition(async () => {
      const res = await action(next);
      if (res.ok) {
        setFlash({ kind: "ok", message: "Timezone saved." });
      } else {
        setFlash({ kind: "err", message: res.error });
      }
    });
  }

  return (
    <section className="border border-[var(--rule)] bg-card p-6 sm:p-8">
      <header className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-heritage/10">
          <Clock className="size-5 text-heritage" aria-hidden />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">
            Display timezone
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Interview confirmations, slot pickers, and reminder emails will
            show times in this zone. Defaults to Central — change if you're
            elsewhere.
          </p>
        </div>
      </header>

      <div className="space-y-3">
        <label className="block text-sm font-semibold text-foreground">
          Timezone
          <select
            className="mt-2 block w-full border border-[var(--rule)] bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-heritage/40"
            value={value}
            disabled={isPending}
            onChange={(e) => {
              const next = e.target.value;
              setValue(next);
              save(next);
            }}
          >
            {US_TIMEZONES.map((tz) => (
              <option key={tz.id} value={tz.id}>
                {tz.label} — {tz.description}
              </option>
            ))}
            {/* Keep the stored value as a fallback option if it's outside
                the US list, so a previously-set custom TZ doesn't silently
                vanish from the picker. */}
            {!US_TIMEZONES.some((t) => t.id === initialTimezone) && (
              <option value={initialTimezone}>
                {initialTimezone} (current)
              </option>
            )}
          </select>
        </label>

        {showBrowserHint && (
          <button
            type="button"
            onClick={() => {
              if (browserTz) {
                setValue(browserTz);
                save(browserTz);
              }
            }}
            className="text-xs font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
            disabled={isPending}
          >
            Use my browser's timezone ({browserTz})
          </button>
        )}

        {flash && (
          <p
            className={`text-xs font-semibold ${
              flash.kind === "ok" ? "text-heritage-deep" : "text-danger"
            }`}
            role="status"
            aria-live="polite"
          >
            {flash.message}
          </p>
        )}
      </div>
    </section>
  );
}
