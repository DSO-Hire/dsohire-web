/**
 * Per-job share card: eyebrow = public employer name, title = job title,
 * footer = location.
 *
 * Uses a cookieless anon Supabase client so the card only ever sees what RLS
 * exposes to the public (crawlers send no session anyway). Employer name and
 * location follow the same privacy masking as /jobs/[id]/page.tsx:
 *   - DSO name only when job_is_publicly_dso_affiliated() is true
 *   - otherwise the single practice's public name (or "Dental Office in
 *     {city}" when anonymize_name), "Corporate", or "Multiple locations".
 * Keep in sync with the page if that logic changes.
 *
 * One jobs query (with embedded dso + locations) plus the affiliation RPC,
 * run in parallel. Missing/inactive jobs get a generic card.
 */

import { createServerClient } from "@supabase/ssr";
import { renderOgCard } from "@/lib/og/card";

export const alt = "Dental job on DSO Hire";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Loc = {
  name: string;
  city: string | null;
  state: string | null;
  anonymize_name: boolean | null;
};

function anonClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}

function genericCard() {
  return renderOgCard({
    eyebrow: "Dental jobs",
    title: "Dental roles at multi-location groups.",
    accent: "Apply direct.",
    footer: "Free for candidates · No agency middlemen",
  });
}

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const supabase = anonClient();
    const [{ data: job }, { data: isPublicRpc }] = await Promise.all([
      supabase
        .from("jobs")
        .select(
          "title, status, deleted_at, scope, dsos(name), job_locations(location:dso_locations(name, city, state, anonymize_name))",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase.rpc("job_is_publicly_dso_affiliated", { p_job_id: id }),
    ]);

    if (!job || (job.status as string) !== "active" || job.deleted_at) {
      return genericCard();
    }

    const dso = job.dsos as unknown as { name: string } | { name: string }[] | null;
    const dsoName = (Array.isArray(dso) ? dso[0]?.name : dso?.name) ?? null;

    const locations = ((job.job_locations ?? []) as unknown as Array<{
      location: Loc | null;
    }>)
      .map((r) => r.location)
      .filter((l): l is Loc => l !== null);

    const publicLocName = (loc: Loc) =>
      loc.anonymize_name
        ? loc.city
          ? `Dental Office in ${loc.city}`
          : "A dental office"
        : loc.name;

    const singlePractice =
      locations.length === 1 ? publicLocName(locations[0]!) : null;
    const scope = (job.scope as string | null) ?? "location";
    const employer =
      isPublicRpc === true && dsoName
        ? dsoName
        : scope === "corporate"
          ? (singlePractice ?? "Corporate")
          : (singlePractice ?? "Multiple locations");

    let footer: string;
    if (locations.length === 1) {
      const place = [locations[0]!.city, locations[0]!.state]
        .filter(Boolean)
        .join(", ");
      footer = place || "Apply direct";
    } else if (locations.length > 1) {
      footer = `${locations.length} locations`;
    } else {
      footer = scope === "corporate" ? "Corporate role" : "Apply direct";
    }

    return renderOgCard({
      eyebrow: employer,
      title: job.title as string,
      footer,
    });
  } catch (err) {
    console.error("[og-job] failed to load job, serving generic card:", err);
    return genericCard();
  }
}
