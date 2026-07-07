/**
 * Inbox loading state — #91 P0-B. Ghost of the 2-pane layout: header →
 * thread list (left, avatar rows) + active-thread pane (right), matching
 * InboxView's real geometry so it assembles in place.
 */

import { PageHeaderSkeleton } from "@/components/brand/route-skeletons";

export default function Loading() {
  return (
    <div className="min-w-0">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 items-start">
        <div className="border border-[var(--rule)] bg-card">
          <div className="px-4 py-3 border-b border-[var(--rule)] flex gap-2">
            <span className="sk h-7 w-16" />
            <span className="sk h-7 w-20" />
            <span className="sk h-7 w-20" />
          </div>
          <div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-start gap-3 px-4 py-3.5 border-b border-[var(--rule)]"
              >
                <span className="sk h-9 w-9 rounded-full shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="sk block h-3.5 w-[55%]" />
                  <span className="sk block h-3 w-[85%] mt-2" />
                </div>
                <span className="sk h-3 w-8 shrink-0" />
              </div>
            ))}
          </div>
        </div>
        <div className="border border-[var(--rule)] bg-card min-h-[420px] flex items-center justify-center">
          <div className="text-center">
            <span className="sk block h-10 w-10 mx-auto" />
            <span className="sk block h-3 w-40 mt-4 mx-auto" />
          </div>
        </div>
      </div>
    </div>
  );
}
