/**
 * Locations loading state — #91 P0-B. Header with action buttons (Bulk
 * import / Add location) → summary strip → location card grid.
 */

import {
  CardGridSkeleton,
  PageHeaderSkeleton,
  PanelSkeleton,
} from "@/components/brand/route-skeletons";

export default function Loading() {
  return (
    <div className="min-w-0">
      <PageHeaderSkeleton action />
      <PanelSkeleton heightClass="h-12" maxWidthClass="max-w-none" />
      <CardGridSkeleton cards={6} />
    </div>
  );
}
