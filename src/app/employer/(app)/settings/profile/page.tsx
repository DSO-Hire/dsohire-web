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
 *
 * Edit / Preview tabs (LinkedIn-style):
 *   ?view=preview renders the public profile in an iframe so the DSO admin
 *   can see exactly what visitors see without leaving the editor. Default
 *   view is the editor.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Eye, Pencil } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProfileEditor } from "./profile-editor";
import type { ProfileData, ProfilePhoto, WhyJoinUsBlock } from "./profile-data";

import { CareersPageShare } from "./careers-page-share";

export const metadata: Metadata = { title: "Public profile · Settings" };

// Force dynamic — auth-protected route, must read live cookies.
// (Companion to feedback_lazy_init_external_sdks.md.)
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ view?: string }>;
}

export default async function PublicProfileSettingsPage({
  searchParams,
}: PageProps) {
  const sp = await searchParams;
  const view = sp.view === "preview" ? "preview" : "edit";

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
        "id, name, slug, mission, description, logo_url, banner_url, brand_color, why_join_us, culture_chips, contact_cta_label, contact_cta_url, website, headquarters_city, headquarters_state, candidate_reply_to_email, practice_count, practice_pace, autonomy_level, mentorship_offered, practice_feel, ce_support, work_life_balance, patient_populations, practice_profile_completed_at, status"
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
    website: (r.website as string | null) ?? null,
    headquarters_city: (r.headquarters_city as string | null) ?? null,
    headquarters_state: (r.headquarters_state as string | null) ?? null,
    candidate_reply_to_email: (r.candidate_reply_to_email as string | null) ?? null,
    practice_count: (r.practice_count as number | null) ?? null,
    practice_pace: (r.practice_pace as string | null) ?? null,
    autonomy_level: (r.autonomy_level as string | null) ?? null,
    mentorship_offered: (r.mentorship_offered as string | null) ?? null,
    practice_feel: (r.practice_feel as string | null) ?? null,
    ce_support: (r.ce_support as number | null) ?? null,
    work_life_balance: (r.work_life_balance as number | null) ?? null,
    patient_populations: ((r.patient_populations as string[] | null) ?? []),
    practice_profile_completed_at:
      (r.practice_profile_completed_at as string | null) ?? null,
    photos: ((photoRows ?? []) as ProfilePhoto[]).map((p) => ({
      id: p.id,
      storage_url: p.storage_url,
      caption: p.caption,
      sort_order: p.sort_order,
    })),
  };

  return (
    <div className="space-y-6 max-w-[1100px]">
      <header className="space-y-3 pb-2 max-w-[820px]">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          Public profile
        </div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.8px] text-ink leading-tight">
          The page candidates see when they click your DSO name.
        </h1>
        <p className="text-sm text-slate-body leading-relaxed">
          Build out your About story, share photos of your practices, and
          highlight the culture chips that make your DSO different.
          Everything you save here is public on{" "}
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

      <CareersPageShare
        url={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com"}/companies/${data.slug}`}
      />

      {/* Edit / Preview tabs — LinkedIn-style */}
      <EditPreviewTabs activeView={view} slug={data.slug} />

      {!canEdit && view === "edit" ? (
        <div className="border border-warning bg-warning-bg p-5 text-sm text-warning max-w-[820px]">
          <strong className="font-semibold">View-only.</strong> Only DSO owners
          and admins can edit the public profile. Ask a teammate with access
          to make changes.
        </div>
      ) : null}

      {view === "preview" ? (
        <ProfilePreviewPane slug={data.slug} />
      ) : (
        <div className="max-w-[820px]">
          <ProfileEditor initial={data} canEdit={canEdit} />
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Edit / Preview tab strip
 * ────────────────────────────────────────────────────────── */

function EditPreviewTabs({
  activeView,
  slug,
}: {
  activeView: "edit" | "preview";
  slug: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--rule)]">
      <nav
        aria-label="Edit or preview"
        role="tablist"
        className="flex gap-0"
      >
        <TabLink
          href="/employer/settings/profile"
          isActive={activeView === "edit"}
          icon={<Pencil className="size-3.5" />}
          label="Edit"
        />
        <TabLink
          href="/employer/settings/profile?view=preview"
          isActive={activeView === "preview"}
          icon={<Eye className="size-3.5" />}
          label="Preview"
        />
      </nav>

      {activeView === "preview" && (
        <Link
          href={`/companies/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-heritage-deep underline-offset-2 hover:underline"
        >
          Open in new tab
          <ExternalLink className="size-3" />
        </Link>
      )}
    </div>
  );
}

function TabLink({
  href,
  isActive,
  icon,
  label,
}: {
  href: string;
  isActive: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={isActive}
      className={
        "inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-[13px] font-semibold transition-colors -mb-px " +
        (isActive
          ? "border-ink text-ink"
          : "border-transparent text-slate-meta hover:text-ink")
      }
    >
      {icon}
      {label}
    </Link>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Preview pane — embeds /companies/[slug] in an iframe so the
 * DSO admin can see exactly what visitors see.
 *
 * The iframe shows the full SiteShell (marketing nav + footer)
 * because that IS what visitors see. We size it tall enough to
 * avoid double-scroll on most profiles; users can also pop out
 * via the "Open in new tab" link in the tab strip.
 * ────────────────────────────────────────────────────────── */

function ProfilePreviewPane({ slug }: { slug: string }) {
  return (
    <div className="border border-[var(--rule)] bg-card overflow-hidden">
      <div className="border-b border-[var(--rule)] bg-cream/40 px-4 py-2 text-[11px] font-medium text-slate-body">
        Previewing <code className="font-mono">/companies/{slug}</code> as a
        logged-out visitor would see it. Saved changes appear here within a
        few seconds.
      </div>
      <iframe
        src={`/companies/${slug}`}
        title="Public profile preview"
        className="block w-full"
        style={{ height: "min(2400px, calc(100vh - 220px))", minHeight: "640px" }}
      />
    </div>
  );
}
