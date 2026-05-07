/**
 * /employer/settings/profile — Public DSO Profile builder (Phase 4.5.d).
 *
 * Section-card editor for the DSO's public-facing /companies/[slug] page.
 * Free at every tier per Q1; only custom-domain hosting stays Enterprise
 * (Phase 5E).
 *
 * Server component fetches dso + photos in one round trip, hydrates the
 * client orchestrator. Each section card has its own per-section save
 * action; pattern parallels /employer/jobs/[id]/edit (4.7.b).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProfileEditor } from "./profile-editor";
import type { ProfileData, ProfilePhoto, WhyJoinUsBlock } from "./profile-data";

export const metadata: Metadata = { title: "Public profile · Settings" };

// Force dynamic — auth-protected route, must read live cookies.
// (Companion to feedback_lazy_init_external_sdks.md.)
export const dynamic = "force-dynamic";

export default async function PublicProfileSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return notFound();

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return notFound();

  const dsoId = dsoUser.dso_id as string;
  const role = dsoUser.role as string;
  const canEdit = role === "owner" || role === "admin";

  const [{ data: dsoRow }, { data: photoRows }] = await Promise.all([
    supabase
      .from("dsos")
      .select(
        "id, name, slug, mission, description, logo_url, banner_url, brand_color, why_join_us, culture_chips, contact_cta_label, contact_cta_url, status"
      )
      .eq("id", dsoId)
      .maybeSingle(),
    supabase
      .from("dso_photos")
      .select("id, storage_url, caption, sort_order")
      .eq("dso_id", dsoId)
      .order("sort_order", { ascending: true }),
  ]);

  if (!dsoRow) return notFound();

  const r = dsoRow as Record<string, unknown>;

  const data: ProfileData = {
    dso_id: r.id as string,
    name: (r.name as string) ?? "",
    slug: (r.slug as string) ?? "",
    mission: (r.mission as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    logo_url: (r.logo_url as string | null) ?? null,
    banner_url: (r.banner_url as string | null) ?? null,
    brand_color: (r.brand_color as string | null) ?? null,
    why_join_us: ((r.why_join_us as WhyJoinUsBlock[] | null) ?? []).filter(
      (b): b is WhyJoinUsBlock =>
        !!b && typeof b === "object" && "title" in b && "body" in b
    ),
    culture_chips: ((r.culture_chips as string[] | null) ?? []),
    contact_cta_label: (r.contact_cta_label as string | null) ?? null,
    contact_cta_url: (r.contact_cta_url as string | null) ?? null,
    photos: ((photoRows ?? []) as ProfilePhoto[]).map((p) => ({
      id: p.id,
      storage_url: p.storage_url,
      caption: p.caption,
      sort_order: p.sort_order,
    })),
  };

  return (
    <div className="space-y-6 max-w-[820px]">
      <header className="space-y-3 pb-2">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          Public profile
        </div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.8px] text-ink leading-tight">
          The page candidates see when they click your DSO name.
        </h1>
        <p className="text-sm text-slate-body leading-relaxed max-w-[640px]">
          Build out your About story, share photos of your practices, and
          highlight the culture chips that make your DSO different.
          Everything below is public on{" "}
          <Link
            href={`/companies/${data.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-heritage-deep underline-offset-2 hover:underline"
          >
            /companies/{data.slug}
            <ExternalLink className="size-3" />
          </Link>{" "}
          the moment you save it.
        </p>
      </header>

      {!canEdit ? (
        <div className="border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <strong className="font-semibold">View-only.</strong> Only DSO owners
          and admins can edit the public profile. Ask a teammate with access
          to make changes.
        </div>
      ) : null}

      <ProfileEditor initial={data} canEdit={canEdit} />
    </div>
  );
}
