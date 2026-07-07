/**
 * Per-panel dashboard skeletons — perf pass #91, P0-A.
 *
 * Single source for the ghost blocks used in TWO places so they can never
 * drift apart:
 *   • the route-level loading.tsx (full-page skeleton before the shell
 *     responds), and
 *   • each panel's <Suspense fallback> in page.tsx (shown after the shell
 *     paints, while that panel's own data streams in).
 *
 * Every ghost sits exactly where its real content lands (Model-08
 * skeleton-morph choreography) so panels assemble IN PLACE with zero
 * reflow. Shimmer is `.sk` from globals.css (static under
 * reduced-motion). Server-component-safe.
 */

/** Next Best Actions queue card (left cell of the queue+pulse row). */
export function QueuePanelSkeleton() {
  return (
    <div className="border border-[var(--rule)] bg-card">
      <div className="px-6 py-4 border-b border-[var(--rule)]">
        <span className="sk block h-3 w-40" />
      </div>
      <div className="p-2.5 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border border-[var(--rule)] p-3">
            <span className="sk block h-4 w-[70%]" />
            <span className="sk block h-3 w-[88%] mt-2" />
            <span className="sk block h-7 w-40 mt-3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Live pulse rail (right cell of the queue+pulse row). */
export function PulsePanelSkeleton() {
  return (
    <div className="border border-[var(--rule)] bg-card">
      <div className="px-5 py-4 border-b border-[var(--rule)]">
        <span className="sk block h-3 w-44" />
      </div>
      <div className="p-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5 px-3 py-2.5">
            <span className="sk h-2 w-2 shrink-0" />
            <span className="sk h-3 flex-1" />
            <span className="sk h-3 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Job health list (left cell of the bottom two-column row). */
export function JobHealthPanelSkeleton() {
  return (
    <div className="border border-[var(--rule)] bg-card">
      <div className="px-5 py-4 border-b border-[var(--rule)]">
        <span className="sk block h-3 w-56" />
      </div>
      <div className="px-5 py-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3">
            <span className="sk h-4 flex-1" />
            <span className="sk hidden sm:block h-3 w-24" />
            <span className="sk h-2.5 w-2.5" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ranked location list (right cell of the bottom two-column row). */
export function LocationPulsePanelSkeleton() {
  return <div className="sk h-56" />;
}
