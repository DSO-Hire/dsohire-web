/**
 * Dashboard loading state — BOH Remodel Lane 2e (Day 32, Model 08).
 *
 * Layout-PARITY skeleton replacing the generic EmployerRouteSkeleton:
 * every ghost block sits exactly where its real content lands (greeting
 * bar → 4-KPI strip → queue + pulse two-column → funnel band → job
 * health + mini-map), so the page assembles IN PLACE with zero reflow
 * when data streams in — the first production step of the Model-08
 * skeleton-morph choreography. Shimmer is `.sk` from globals.css
 * (static blocks under reduced-motion). Server-component-safe.
 *
 * CONTENT-ONLY: the navy rail now lives in the persistent (app) layout, so
 * this renders inside the shell's <main> (it used to draw its own rail ghost,
 * which would double up under the persistent shell).
 *
 * #91 P0-A: the per-panel ghosts are shared with the page's <Suspense>
 * fallbacks (panel-skeletons.tsx) — one source, zero drift between the
 * route-level skeleton and the streamed-panel skeletons.
 */

import {
  JobHealthPanelSkeleton,
  LocationPulsePanelSkeleton,
  PulsePanelSkeleton,
  QueuePanelSkeleton,
} from "./panel-skeletons";

export default function Loading() {
  return (
    <div className="min-w-0">
      {/* Greeting bar */}
        <div className="mb-7 flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="sk h-7 w-[min(440px,80%)]" />
            <div className="mt-3 flex items-center gap-3.5">
              <span className="sk h-3 w-20" />
              <span className="sk h-3 w-28" />
              <span className="sk h-3 w-24" />
            </div>
          </div>
          <span className="sk h-10 w-36 shrink-0" />
        </div>

        {/* 4-KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--rule)] border border-[var(--rule)] mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-cream p-5">
              <span className="sk block h-3 w-24" />
              <span className="sk block h-9 w-16 mt-3" />
              <span className="sk block h-3 w-32 mt-3" />
            </div>
          ))}
        </div>

        {/* Queue + live pulse */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 mb-6 items-start">
          <QueuePanelSkeleton />
          <PulsePanelSkeleton />
        </div>

        {/* Pipeline funnel band */}
        <div className="sk h-28 w-full mb-6" />

        {/* Job health + mini-map */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
          <JobHealthPanelSkeleton />
          <LocationPulsePanelSkeleton />
        </div>
      </div>
  );
}

