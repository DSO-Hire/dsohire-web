/**
 * Billing loading state — #91 P0-B. Header → current-plan card →
 * invoice/detail rows, on the page's 820px column.
 */

import {
  ListRowsSkeleton,
  PageHeaderSkeleton,
  PanelSkeleton,
} from "@/components/brand/route-skeletons";

export default function Loading() {
  return (
    <div className="min-w-0">
      <PageHeaderSkeleton />
      <PanelSkeleton heightClass="h-40" />
      <ListRowsSkeleton rows={4} />
    </div>
  );
}
