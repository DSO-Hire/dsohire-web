/**
 * Route-skeleton primitives — perf pass #91, P0-B (2026-07-07).
 *
 * Shared ghost blocks for route-level loading.tsx files, so every employer
 * route gives INSTANT feedback on click instead of the near-blank ivory +
 * lone D-mark the (app) fallback used to show. Cam's measured rule from
 * the spec: 1–2s of *nothing* feels slower than 3s of skeleton.
 *
 * Same conventions as the dashboard's panel-skeletons: shimmer is `.sk`
 * from globals.css (static under reduced-motion), content-only (the navy
 * rail lives in the persistent (app) layout), and every ghost sits where
 * its real content lands so pages assemble in place with zero reflow.
 * Server-component-safe.
 */

/**
 * Standard page header ghost — eyebrow + display title + subline, matching
 * the `header.mb-8 max-w-[820px]` rhythm most employer pages share.
 * `action` adds the right-aligned button ghost (Post a job / Add location
 * style headers). `display` sizes the title ghost for the font-display
 * 5xl pages (talent pool).
 */
export function PageHeaderSkeleton({
  action = false,
  display = false,
}: {
  action?: boolean;
  display?: boolean;
}) {
  return (
    <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0 flex-1 max-w-[820px]">
        <span className="sk block h-3 w-24 mb-3" />
        <span
          className={`sk block ${display ? "h-11 w-[min(520px,85%)]" : "h-9 w-[min(420px,75%)]"}`}
        />
        <span className="sk block h-3 w-[min(560px,90%)] mt-4" />
      </div>
      {action && <span className="sk h-11 w-40 shrink-0" />}
    </div>
  );
}

/** Bordered list rows — team members, referrals, approvals, rules. */
export function ListRowsSkeleton({
  rows = 5,
  maxWidthClass = "max-w-[820px]",
  avatar = false,
}: {
  rows?: number;
  maxWidthClass?: string;
  avatar?: boolean;
}) {
  return (
    <ul className={`list-none border-t border-[var(--rule)] ${maxWidthClass}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-4 border-b border-[var(--rule)] py-4"
        >
          {avatar && <span className="sk h-9 w-9 rounded-full shrink-0" />}
          <div className="min-w-0 flex-1">
            <span className="sk block h-4 w-[45%]" />
            <span className="sk block h-3 w-[70%] mt-2" />
          </div>
          <span className="sk h-7 w-24 shrink-0" />
        </li>
      ))}
    </ul>
  );
}

/** Card grid — locations, analytics-style tile layouts. */
export function CardGridSkeleton({
  cards = 6,
  colsClass = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
}: {
  cards?: number;
  colsClass?: string;
}) {
  return (
    <div className={`grid ${colsClass} gap-px bg-[var(--rule)] border border-[var(--rule)]`}>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="bg-card p-6">
          <span className="sk h-9 w-9 rounded-full block" />
          <span className="sk block h-4 w-[70%] mt-4" />
          <span className="sk block h-3 w-[50%] mt-2" />
          <span className="sk block h-3 w-[60%] mt-4" />
        </div>
      ))}
    </div>
  );
}

/** Filter / form panel ghost — search bars, invite forms, referral links. */
export function PanelSkeleton({
  heightClass = "h-28",
  maxWidthClass = "max-w-[820px]",
}: {
  heightClass?: string;
  maxWidthClass?: string;
}) {
  return (
    <div
      className={`border border-[var(--rule)] bg-card p-5 mb-8 ${maxWidthClass}`}
    >
      <span className={`sk block w-full ${heightClass}`} />
    </div>
  );
}

/** Tab strip ghost — talent pool Discover/Saved, automations Rules/Sequences. */
export function TabStripSkeleton({ tabs = 3 }: { tabs?: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: tabs }).map((_, i) => (
        <span key={i} className="sk h-8 w-28" />
      ))}
    </div>
  );
}

/**
 * The upgraded (app)-group fallback: full-page header + list ghost so ANY
 * route that doesn't ship its own loading.tsx still reads as "the click
 * landed, content is coming" at full-screen scale.
 */
export function GenericRouteSkeleton() {
  return (
    <div className="min-w-0">
      <PageHeaderSkeleton />
      <PanelSkeleton />
      <ListRowsSkeleton rows={6} />
    </div>
  );
}
