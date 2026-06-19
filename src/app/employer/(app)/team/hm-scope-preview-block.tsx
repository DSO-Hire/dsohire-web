"use client";

/**
 * HmScopePreviewBlock — live "Will see X jobs and Y candidates" preview
 * for the HM invite + rescope flows (Phase 4.5.a — final piece).
 *
 * Mounted inside InviteForm (under the location checkbox grid) and inside
 * HmRescopeButton (inside the modal). Re-fetches whenever the selected
 * location set changes; debounced ~150ms so a rapid checkbox spree doesn't
 * fire one DB query per click.
 *
 * Sales-demo lever: when a DSO buyer asks "wait, will my dentist owner see
 * her competitor's candidates?" — we can show this preview live during the
 * pitch. That's the punch-above-weight answer.
 *
 * Edge cases handled:
 *  - Empty selection: shows the "no jobs except corporate-scoped" empty
 *    state (matches the AlertCircle copy in the rescope modal).
 *  - Stale response race: an in-flight request whose selected set has
 *    since changed is dropped. We track a per-fetch token.
 *  - Errors: falls back to a soft "preview unavailable" line; the form
 *    can still submit.
 */

import { useEffect, useRef, useState } from "react";
import { Briefcase, Users, MapPin } from "lucide-react";
import { previewHmScope } from "@/lib/employer/hm-scope-preview";
import type { HmScopePreview } from "@/lib/employer/hm-scope-preview";

interface HmScopePreviewBlockProps {
  /** Currently selected dso_locations.id values. */
  selectedLocationIds: string[];
  /**
   * Visual variant — "form" matches the cream-card invite form; "modal"
   * matches the white-on-cream rescope dialog body. The two surfaces
   * have different surrounding chrome.
   */
  variant?: "form" | "modal";
}

const DEBOUNCE_MS = 150;

const EMPTY_PREVIEW: HmScopePreview = {
  ok: true,
  activeJobs: 0,
  totalJobs: 0,
  openApplications: 0,
  locationNames: [],
  regionalOrCorporateJobs: 0,
};

export function HmScopePreviewBlock({
  selectedLocationIds,
  variant = "form",
}: HmScopePreviewBlockProps) {
  const [preview, setPreview] = useState<HmScopePreview | null>(null);
  const [pending, setPending] = useState(false);
  const fetchTokenRef = useRef(0);

  // Stable join-key for the dependency array — avoids re-firing when the
  // parent re-renders with the same set in a different array reference.
  const cacheKey = selectedLocationIds.slice().sort().join(",");

  useEffect(() => {
    const myToken = ++fetchTokenRef.current;

    // No locations selected → render the empty state immediately, but
    // also fire the call to pick up regional/corporate counts that exist
    // independently of the location scope.
    setPending(true);

    const handle = window.setTimeout(async () => {
      try {
        const result = await previewHmScope(selectedLocationIds);
        if (myToken !== fetchTokenRef.current) return; // stale, ignore
        setPreview(result);
      } catch {
        if (myToken !== fetchTokenRef.current) return;
        setPreview({ ...EMPTY_PREVIEW, ok: false, error: "preview unavailable" });
      } finally {
        if (myToken === fetchTokenRef.current) setPending(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  const data = preview ?? EMPTY_PREVIEW;
  const hasSelection = selectedLocationIds.length > 0;
  const showEmpty = !hasSelection && data.regionalOrCorporateJobs === 0;

  // Container styling adapts to surface — form-card sits on cream/60, modal
  // sits on white. Heritage-tinted left border in both for the "this is
  // computed live" cue.
  const wrapper =
    variant === "form"
      ? "mt-4 border-l-2 border-heritage bg-ivory/80 px-4 py-3"
      : "mt-4 border-l-2 border-heritage bg-cream/60 px-4 py-3";

  if (showEmpty) {
    return (
      <div className={wrapper}>
        <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep mb-1">
          Preview
        </div>
        <p className="text-[13px] text-slate-body leading-relaxed">
          With no locations checked, this hiring manager will see{" "}
          <strong className="text-ink font-semibold">no jobs</strong> at this
          DSO. Pick at least one location.
        </p>
      </div>
    );
  }

  return (
    <div className={wrapper}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep">
          Preview
          {pending && (
            <span className="ml-2 text-slate-meta lowercase tracking-normal font-normal">
              updating…
            </span>
          )}
        </div>
        {data.locationNames.length > 0 && (
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-meta">
            <MapPin className="h-3 w-3" />
            <span className="truncate max-w-[280px]">
              {data.locationNames.length === 1
                ? data.locationNames[0]
                : `${data.locationNames[0]} +${data.locationNames.length - 1}`}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-1.5">
        <PreviewMetric
          icon={<Briefcase className="h-3.5 w-3.5" />}
          value={data.activeJobs}
          label={data.activeJobs === 1 ? "active job" : "active jobs"}
          subline={
            data.totalJobs > data.activeJobs
              ? `${data.totalJobs - data.activeJobs} closed/draft also visible`
              : undefined
          }
        />
        <PreviewMetric
          icon={<Users className="h-3.5 w-3.5" />}
          value={data.openApplications}
          label={
            data.openApplications === 1
              ? "candidate in pipeline"
              : "candidates in pipeline"
          }
          subline="excludes hired/rejected/withdrawn"
        />
      </div>

      {data.regionalOrCorporateJobs > 0 && (
        <p className="mt-2 pt-2 border-t border-[var(--rule)] text-[12px] text-slate-meta leading-relaxed">
          Includes{" "}
          <strong className="text-ink font-semibold">
            {data.regionalOrCorporateJobs}
          </strong>{" "}
          regional/corporate{" "}
          {data.regionalOrCorporateJobs === 1 ? "job" : "jobs"} every teammate
          at this DSO sees regardless of location scope.
        </p>
      )}

      {!data.ok && data.error && (
        <p className="mt-2 text-[12px] text-warning">
          Preview unavailable — proceed if the location list looks right.
        </p>
      )}
    </div>
  );
}

function PreviewMetric({
  icon,
  value,
  label,
  subline,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  subline?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-heritage-deep mt-1">{icon}</span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-extrabold tracking-[-0.5px] text-ink tabular-nums">
            {value}
          </span>
          <span className="text-[12px] tracking-[0.3px] text-slate-body">
            {label}
          </span>
        </div>
        {subline && (
          <div className="text-[11px] text-slate-meta leading-tight">
            {subline}
          </div>
        )}
      </div>
    </div>
  );
}
