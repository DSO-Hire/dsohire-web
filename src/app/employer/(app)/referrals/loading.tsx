/**
 * Referrals loading state — #91 P0-B. Header → share-link card (680px,
 * matching the real section) → referral rows.
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
      <PanelSkeleton heightClass="h-20" maxWidthClass="max-w-[680px]" />
      <ListRowsSkeleton rows={4} maxWidthClass="max-w-[920px]" avatar />
    </div>
  );
}
