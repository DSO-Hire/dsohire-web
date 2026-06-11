/**
 * #115 FOH-9 — instant skeleton while the jobs route's server component
 * fetches (perceived-perf companion to #91). See EmployerRouteSkeleton.
 */
import { EmployerRouteSkeleton } from "@/components/employer/route-skeleton";

export default function Loading() {
  return <EmployerRouteSkeleton variant="rows" />;
}
