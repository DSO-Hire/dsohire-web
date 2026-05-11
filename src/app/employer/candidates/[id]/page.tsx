/**
 * /employer/candidates/[id] — read-only candidate profile (Phase 5D, shipped 2026-05-11).
 *
 * Reachable from the talent-pool result cards + saved-entry cards.
 * RLS gates the read: DSO members can see searchable candidates OR
 * candidates who've applied to one of their jobs.
 *
 * Email is intentionally hidden — outbound contact goes through the
 * in-app outreach flow (Phase 5D Day 2). Resume download is gated to
 * candidates who've explicitly opted into searchability (the same
 * gate that surfaced them in Discover).
 */

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  Briefcase,
  Award,
  Clock,
  FileText,
} from "lucide-react";
import type { Metadata } from "next";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TalentPoolSaveButton } from "./talent-pool-save-button";
import { OutreachLauncher } from "./outreach-modal";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const ROLE_LABELS: Record<string, string> = {
  dentist: "Dentist",
  dental_hygienist: "Dental Hygienist",
  dental_assistant: "Dental Assistant",
  front_office: "Front Office",
  office_manager: "Office Manager",
  regional_manager: "Regional Manager",
  specialist: "Specialist",
  other: "Other",
};

const AVAILABILITY_LABELS: Record<string, string> = {
  immediate: "Available immediately",
  "2_weeks": "Two-week notice",
  "1_month": "One-month notice",
  passive: "Passive — open to fits",
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: c } = await supabase
    .from("candidates")
    .select("full_name")
    .eq("id", id)
    .maybeSingle();
  return {
    title: c?.full_name ? `${c.full_name as string} · Candidate` : "Candidate",
  };
}

export default async function CandidateDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  const { data: candidate } = await supabase
    .from("candidates")
    .select(
      "id, full_name, headline, summary, current_title, years_experience, years_experience_dental, avatar_url, license_states, current_location_city, current_location_state, desired_roles, desired_locations, availability, skills, pms_systems, languages, schedule_preferences, linkedin_url, resume_url, is_searchable"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!candidate) notFound();

  // Is this candidate in our DSO's pool already?
  const { data: poolEntry } = await supabase
    .from("dso_talent_pool_entries")
    .select("id")
    .eq("dso_id", dsoUser.dso_id as string)
    .eq("candidate_id", id)
    .maybeSingle();

  // Past outreach from this DSO to this candidate.
  const { data: outreachRows } = await supabase
    .from("dso_outreach_messages")
    .select("id, subject, body, sent_at, sent_by, dso_users(full_name)")
    .eq("dso_id", dsoUser.dso_id as string)
    .eq("candidate_id", id)
    .order("sent_at", { ascending: false })
    .limit(10);
  const outreachHistory = (
    (outreachRows ?? []) as unknown as Array<{
      id: string;
      subject: string;
      body: string;
      sent_at: string;
      sent_by: string | null;
      dso_users: Array<{ full_name: string | null }> | null;
    }>
  ).map((r) => ({
    id: r.id,
    subject: r.subject,
    body: r.body,
    sent_at: r.sent_at,
    sender_name: r.dso_users?.[0]?.full_name ?? null,
  }));

  const c = candidate as {
    id: string;
    full_name: string | null;
    headline: string | null;
    summary: string | null;
    current_title: string | null;
    years_experience: number | null;
    years_experience_dental: number | null;
    avatar_url: string | null;
    license_states: string[] | null;
    current_location_city: string | null;
    current_location_state: string | null;
    desired_roles: string[] | null;
    desired_locations: string[] | null;
    availability: string | null;
    skills: string[] | null;
    pms_systems: string[] | null;
    languages: string[] | null;
    schedule_preferences: string[] | null;
    linkedin_url: string | null;
    resume_url: string | null;
    is_searchable: boolean;
  };

  const cityState = [c.current_location_city, c.current_location_state]
    .filter(Boolean)
    .join(", ");
  const desiredRoleLabels = (c.desired_roles ?? [])
    .map((r) => ROLE_LABELS[r] ?? r)
    .filter(Boolean);

  return (
    <EmployerShell active="talent-pool">
      <Link
        href="/employer/talent-pool"
        className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Talent Pool
      </Link>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-start gap-5 min-w-0">
          <Avatar fullName={c.full_name} avatarUrl={c.avatar_url} size="lg" />
          <div className="min-w-0">
            <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
              Candidate profile
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-[-1px] leading-[1.05] text-ink mb-2">
              {c.full_name ?? "Unnamed candidate"}
            </h1>
            {c.headline && (
              <p className="text-[15px] text-slate-body leading-relaxed max-w-[640px] mb-2">
                {c.headline}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-meta">
              {c.current_title && (
                <span className="inline-flex items-center gap-1.5">
                  <Briefcase className="h-3 w-3" /> {c.current_title}
                </span>
              )}
              {cityState && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> {cityState}
                </span>
              )}
              {c.availability && AVAILABILITY_LABELS[c.availability] && (
                <span className="inline-flex items-center gap-1.5 text-heritage-deep font-semibold">
                  <Clock className="h-3 w-3" />{" "}
                  {AVAILABILITY_LABELS[c.availability]}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <OutreachLauncher candidateId={c.id} candidateName={c.full_name} />
          <TalentPoolSaveButton
            candidateId={c.id}
            initialEntryId={(poolEntry?.id as string | undefined) ?? null}
          />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10">
        <div className="space-y-8">
          {c.summary && (
            <Section title="Summary">
              <p className="text-[14px] text-ink leading-relaxed whitespace-pre-wrap">
                {c.summary}
              </p>
            </Section>
          )}

          {(c.skills ?? []).length > 0 && (
            <Section title="Skills">
              <ChipList items={c.skills ?? []} />
            </Section>
          )}

          {(c.pms_systems ?? []).length > 0 && (
            <Section title="Practice management systems">
              <ChipList items={c.pms_systems ?? []} />
            </Section>
          )}

          {(c.languages ?? []).length > 0 && (
            <Section title="Languages">
              <ChipList items={c.languages ?? []} />
            </Section>
          )}

          {(c.schedule_preferences ?? []).length > 0 && (
            <Section title="Schedule preferences">
              <ChipList items={c.schedule_preferences ?? []} />
            </Section>
          )}

          {outreachHistory.length > 0 && (
            <Section title={`Outreach history (${outreachHistory.length})`}>
              <ul className="space-y-3">
                {outreachHistory.map((m) => (
                  <li
                    key={m.id}
                    className="border border-[var(--rule)] bg-white p-4"
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className="text-[13px] font-bold text-ink">
                        {m.subject}
                      </span>
                      <span className="text-[11px] text-slate-meta whitespace-nowrap">
                        {new Date(m.sent_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    {m.sender_name && (
                      <div className="text-[11px] text-slate-meta uppercase tracking-wide mb-2">
                        From {m.sender_name}
                      </div>
                    )}
                    <p className="text-[13px] text-slate-body leading-relaxed whitespace-pre-wrap">
                      {m.body.length > 280
                        ? `${m.body.slice(0, 280).trim()}…`
                        : m.body}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <aside className="space-y-6">
          <SidebarCard title="Experience">
            <SidebarRow
              label="Total experience"
              value={
                c.years_experience !== null
                  ? `${c.years_experience} yr${c.years_experience === 1 ? "" : "s"}`
                  : "—"
              }
            />
            {c.years_experience_dental !== null && (
              <SidebarRow
                label="Dental experience"
                value={`${c.years_experience_dental} yr${c.years_experience_dental === 1 ? "" : "s"}`}
              />
            )}
          </SidebarCard>

          {(c.license_states ?? []).length > 0 && (
            <SidebarCard title="Licensed in">
              <div className="flex flex-wrap gap-1.5">
                {(c.license_states ?? []).map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold text-heritage-deep border border-[var(--rule)] bg-cream/60"
                  >
                    <Award className="h-2.5 w-2.5" aria-hidden />
                    {s}
                  </span>
                ))}
              </div>
            </SidebarCard>
          )}

          {desiredRoleLabels.length > 0 && (
            <SidebarCard title="Open to">
              <ChipList items={desiredRoleLabels} small />
            </SidebarCard>
          )}

          {(c.desired_locations ?? []).length > 0 && (
            <SidebarCard title="Desired locations">
              <ChipList items={c.desired_locations ?? []} small />
            </SidebarCard>
          )}

          {c.linkedin_url && (
            <SidebarCard title="Links">
              <a
                href={c.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] text-heritage-deep hover:text-ink underline underline-offset-2 break-all"
              >
                LinkedIn profile
              </a>
            </SidebarCard>
          )}

          {c.resume_url && (
            <SidebarCard title="Resume">
              <div className="inline-flex items-center gap-1.5 text-[12px] text-slate-body">
                <FileText className="h-3.5 w-3.5" />
                Resume on file. Available after first outreach.
              </div>
            </SidebarCard>
          )}
        </aside>
      </div>
    </EmployerShell>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
        {title}
      </div>
      {children}
    </section>
  );
}

function SidebarCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[var(--rule)] bg-white p-4">
      <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta mb-2">
        {title}
      </div>
      {children}
    </section>
  );
}

function SidebarRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px] mb-1.5 last:mb-0">
      <span className="text-slate-body">{label}</span>
      <span className="tabular-nums font-bold text-ink">{value}</span>
    </div>
  );
}

function ChipList({
  items,
  small = false,
}: {
  items: string[];
  small?: boolean;
}) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <li
          key={it}
          className={
            "inline-flex items-center px-2.5 py-1 font-semibold text-ink bg-cream border border-[var(--rule)] " +
            (small ? "text-[11px]" : "text-[12px]")
          }
        >
          {it}
        </li>
      ))}
    </ul>
  );
}

function Avatar({
  fullName,
  avatarUrl,
  size = "md",
}: {
  fullName: string | null;
  avatarUrl: string | null;
  size?: "md" | "lg";
}) {
  const cls =
    size === "lg" ? "h-20 w-20 text-[22px]" : "h-12 w-12 text-[14px]";
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={`rounded-full object-cover bg-cream shrink-0 ${cls}`}
      />
    );
  }
  const initials = (fullName ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  return (
    <div
      className={`rounded-full bg-heritage text-ivory flex items-center justify-center font-bold shrink-0 ${cls}`}
    >
      {initials || "?"}
    </div>
  );
}
