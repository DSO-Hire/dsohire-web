/**
 * Team loading state — #91 P0-B. Header → invite-form panel → member rows
 * with avatars + role-select ghosts, on the page's 820px column.
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
      <PanelSkeleton heightClass="h-24" />
      <ListRowsSkeleton rows={5} avatar />
    </div>
  );
}
