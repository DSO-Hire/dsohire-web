/**
 * /employer/jobs/[id]/applications — redirects to /employer/jobs/[id].
 *
 * Phase 4.7.a flipped the per-job page to pipeline-first. The kanban
 * now lives at /employer/jobs/[id] directly. Old deep links to
 * /applications still work — they redirect here for URL canonicalization.
 *
 * Search params (e.g. ?view=list) get preserved on the redirect so a
 * bookmark to /applications?view=list lands on /[id]?view=list with
 * the list view active.
 */

import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PerJobApplicationsRedirect({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  // Preserve any non-empty search params on the redirect (e.g. ?view=list).
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v) && v.length > 0) qs.set(k, v[0]!);
  }
  const query = qs.toString();
  redirect(`/employer/jobs/${id}${query ? `?${query}` : ""}`);
}
