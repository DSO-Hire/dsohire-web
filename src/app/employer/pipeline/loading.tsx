/**
 * #115 FOH-9/10 — instant skeleton for Pipeline HQ while the cross-job
 * server component assembles the board. See EmployerRouteSkeleton.
 */
import { EmployerRouteSkeleton } from "@/components/employer/route-skeleton";

export default function Loading() {
  return <EmployerRouteSkeleton variant="tiles" />;
}
