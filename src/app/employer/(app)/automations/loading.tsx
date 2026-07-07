/**
 * Automations loading state — #91 P0-B. Header → Rules/Sequences tab
 * strip → rule-sentence rows.
 */

import {
  ListRowsSkeleton,
  PageHeaderSkeleton,
  TabStripSkeleton,
} from "@/components/brand/route-skeletons";

export default function Loading() {
  return (
    <div className="min-w-0">
      <PageHeaderSkeleton />
      <TabStripSkeleton tabs={2} />
      <ListRowsSkeleton rows={4} />
    </div>
  );
}
