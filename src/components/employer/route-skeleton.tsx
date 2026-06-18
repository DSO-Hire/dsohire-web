/**
 * EmployerRouteSkeleton — #115 FOH-9 shared loading state for the heavy
 * employer routes (dashboard / applications / jobs / analytics).
 *
 * Rendered by each route's loading.tsx while the server component fetches —
 * replaces the blank-frozen feel that #91 flagged with an instant,
 * brand-toned shimmer that approximates the destination's layout (heading +
 * tile grid). Shimmer is `.sk` in globals.css; reduced-motion gets static
 * blocks.
 *
 * CONTENT-ONLY: the navy rail now lives in the persistent (app) layout, so
 * this skeleton draws only the content column — it renders INSIDE the shell's
 * <main>, with the real rail already in place. (It used to draw its own rail
 * ghost, which would double up under the persistent shell.)
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
    <>
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
    </>
  );
}
