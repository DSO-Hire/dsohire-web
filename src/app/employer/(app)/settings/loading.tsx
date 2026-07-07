/**
 * Settings loading state — #91 P0-B. Renders INSIDE settings/layout.tsx
 * (which already paints the "Settings" h1 + left-rail nav), so this ghosts
 * only the main content column: section heading + form rows. Covers every
 * settings sub-route that doesn't ship its own skeleton.
 */

export default function Loading() {
  return (
    <div className="min-w-0 max-w-[720px]">
      <span className="sk block h-6 w-56" />
      <span className="sk block h-3 w-[85%] mt-3" />
      <div className="mt-8 space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <span className="sk block h-3 w-32" />
            <span className="sk block h-11 w-full mt-2" />
          </div>
        ))}
      </div>
      <span className="sk block h-11 w-36 mt-8" />
    </div>
  );
}
