/**
 * Talent-pool loading state — #91 P0-B. Layout-parity ghost: display-size
 * header → view tabs → filter panel → result-card rows, matching where the
 * Discover surface's real content lands.
 */

import {
  PageHeaderSkeleton,
  PanelSkeleton,
  TabStripSkeleton,
} from "@/components/brand/route-skeletons";

export default function Loading() {
  return (
    <div className="min-w-0">
      <PageHeaderSkeleton display />
      <TabStripSkeleton tabs={3} />
      <PanelSkeleton heightClass="h-36" maxWidthClass="max-w-none" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-[var(--rule)] bg-card p-6">
            <div className="flex items-start gap-4">
              <span className="sk h-12 w-12 rounded-full shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="sk block h-4 w-[35%]" />
                <span className="sk block h-3 w-[60%] mt-2" />
                <div className="mt-3 flex gap-2">
                  <span className="sk h-5 w-20" />
                  <span className="sk h-5 w-24" />
                  <span className="sk h-5 w-16" />
                </div>
              </div>
              <span className="sk h-9 w-28 shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
