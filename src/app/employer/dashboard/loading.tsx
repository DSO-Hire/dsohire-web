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
 */

export default function Loading() {
  return (
    <div className="min-h-screen flex bg-ivory">
      {/* Left rail ghost — matches EmployerShell's navy rail (w-240). */}
      <div className="hidden lg:block w-[240px] shrink-0 bg-ink/95">
        <div className="p-6 space-y-6">
          <div className="sk h-9 w-36 opacity-20" />
          <div className="space-y-3 pt-6">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="sk h-5 w-full opacity-10" />
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 px-6 sm:px-10 py-10">
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
          <div className="border border-[var(--rule)] bg-white">
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
          <div className="border border-[var(--rule)] bg-white">
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
        </div>

        {/* Pipeline funnel band */}
        <div className="sk h-28 w-full mb-6" />

        {/* Job health + mini-map */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
          <div className="border border-[var(--rule)] bg-white">
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
          <div className="sk h-56" />
        </div>
      </div>
    </div>
  );
}
