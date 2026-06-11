/**
 * EmployerRouteSkeleton — #115 FOH-9 shared loading state for the heavy
 * employer routes (dashboard / applications / jobs / analytics).
 *
 * Rendered by each route's loading.tsx while the server component fetches —
 * replaces the blank-frozen feel that #91 flagged with an instant,
 * brand-toned shimmer that approximates the destination's layout (left
 * rail + heading + tile grid). Shimmer is `.sk` in globals.css;
 * reduced-motion gets static blocks.
 *
 * Server-component-safe (no hooks). Variants only change the content grid.
 */

export function EmployerRouteSkeleton({
  variant = "tiles",
}: {
  /** tiles = dashboard/analytics KPI grid · rows = list surfaces */
  variant?: "tiles" | "rows";
}) {
  return (
    <div className="min-h-screen flex">
      {/* Left rail ghost — matches the employer shell's navy rail. */}
      <div className="hidden lg:block w-[286px] shrink-0 bg-ink/95">
        <div className="p-6 space-y-6">
          <div className="sk h-9 w-36 opacity-20" />
          <div className="space-y-3 pt-6">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="sk h-5 w-full opacity-10" />
            ))}
          </div>
        </div>
      </div>

      {/* Content ghost */}
      <div className="flex-1 px-6 sm:px-10 py-10">
        <div className="sk h-4 w-40 mb-4" />
        <div className="sk h-12 w-[min(420px,80%)] mb-8" />

        {variant === "tiles" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="sk h-[300px] lg:row-span-2" />
            <div className="sk h-[144px]" />
            <div className="sk h-[144px]" />
            <div className="sk h-[144px]" />
            <div className="sk h-[144px]" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="sk h-10 w-[min(560px,100%)] mb-6" />
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="sk h-[72px] w-full" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
