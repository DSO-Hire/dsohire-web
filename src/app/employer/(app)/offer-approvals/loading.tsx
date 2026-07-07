/**
 * Offer-approvals loading state — #91 P0-B. Header → approval-request rows.
 */

import {
  ListRowsSkeleton,
  PageHeaderSkeleton,
} from "@/components/brand/route-skeletons";

export default function Loading() {
  return (
    <div className="min-w-0">
      <PageHeaderSkeleton />
      <ListRowsSkeleton rows={4} avatar />
    </div>
  );
}
