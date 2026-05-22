/**
 * CandidateProfileView — the shared, read-only, LinkedIn-style presentation
 * of a candidate's profile (2026-05-22).
 *
 * Rendered in two places so they can never diverge:
 *   - /employer/candidates/[id]  — what an employer sees (with outreach/save
 *     actions passed in via `headerActions` + outreach history via `footerSections`).
 *   - /candidate/profile/preview — the candidate previewing exactly how
 *     employers see them (no actions; a preview banner sits above).
 *
 * Pure presentational server component — all data + any interactive nodes are
 * passed in. Privacy gating (who can load a candidate) is enforced by the
 * page/RLS, not here. Verification badges only ever say "Verified" when the
 * stored verification_status says so — DSO Hire is the conduit, never the
 * verifier ([[feedback_verification_conduit_not_verifier]]).
 */

import type { ReactNode } from "react";
import {
  MapPin,
  Briefcase,
  GraduationCap,
  Award,
  ShieldCheck,
  AlertTriangle,
  Clock,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { ROLE_CATEGORIES } from "@/lib/candidate/canonical-lists";

const ROLE_LABELS: Record<string, string> = {
  // Job-side role_category enum values…
  dentist: "Dentist",
  dental_hygienist: "Dental Hygienist",
  dental_assistant: "Dental Assistant",
  front_office: "Front Office",
  office_manager: "Office Manager",
  regional_manager: "Regional Manager",
  specialist: "Specialist",
  other: "Other",
  // …merged with the candidate-side ROLE_CATEGORIES vocabulary (associate_dentist,
  // hygienist, assistant, front_desk, dso_corporate, …). Candidate desired_roles
  // use THESE values, so without the merge the "Open to" chips rendered raw
  // ("assistant" instead of "Dental Assistant"). Fixed 2026-05-22.
  ...Object.fromEntries(ROLE_CATEGORIES.map((o) => [o.value, o.label])),
};

const AVAILABILITY_LABELS: Record<string, string> = {
  immediate: "Available immediately",
  "2_weeks": "Two-week notice",
  "1_month": "One-month notice",
  passive: "Passive — open to fits",
};

export interface CPVWorkEntry {
  id: string;
  title: string | null;
  company_name: string | null;
  is_dso: boolean | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean | null;
  description: string | null;
}

export interface CPVEducation {
  id: string;
  school_name: string | null;
  degree: string | null;
  field_of_study: string | null;
  start_year: number | null;
  end_year: number | null;
  description: string | null;
}

export interface CPVLicense {
  id: string;
  license_type: string | null;
  state: string | null;
  display_number?: string | null;
  expires_date: string | null;
  verification_status: string;
}

export interface CPVCertification {
  id: string;
  kind: string | null;
  level: string | null;
  expires_date: string | null;
  verification_status: string;
}

export interface CPVData {
  full_name: string | null;
  headline: string | null;
  summary: string | null;
  current_title: string | null;
  years_experience: number | null;
  years_experience_dental: number | null;
  avatar_url: string | null;
  /** Candidate-chosen 6-digit hex for the header band; null = heritage green. */
  accent_color: string | null;
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
}

export function CandidateProfileView({
  data,
  work = [],
  education = [],
  licenses = [],
  certifications = [],
  viewer,
  headerActions,
  footerSections,
}: {
  data: CPVData;
  work?: CPVWorkEntry[];
  education?: CPVEducation[];
  licenses?: CPVLicense[];
  certifications?: CPVCertification[];
  /** Adjusts a few copy bits (e.g. the resume note). */
  viewer: "employer" | "candidate";
  /** Action buttons rendered top-right of the header (employer: outreach/save). */
  headerActions?: ReactNode;
  /** Extra sections appended to the main column (employer: outreach history). */
  footerSections?: ReactNode;
}) {
  const cityState = [data.current_location_city, data.current_location_state]
    .filter(Boolean)
    .join(", ");
  const desiredRoleLabels = (data.desired_roles ?? [])
    .map((r) => ROLE_LABELS[r] ?? r)
    .filter(Boolean);
  const openToWork = openToWorkLabel(data.availability);
  // Candidate-chosen header color, validated; fall back to heritage green.
  const accent =
    data.accent_color && /^#[0-9a-fA-F]{6}$/.test(data.accent_color)
      ? data.accent_color
      : "#4D7A60";

  return (
    <div>
      {/* Header card — cover band + overlapping avatar, LinkedIn-style */}
      <div className="border border-[var(--rule)] bg-white overflow-hidden">
        <div
          className="h-16 w-full sm:h-20"
          style={{
            background: `linear-gradient(135deg, ${accent} 0%, color-mix(in srgb, ${accent} 55%, transparent) 100%)`,
          }}
          aria-hidden
        />
        <div className="px-5 pb-5 sm:px-8 sm:pb-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-end gap-4 min-w-0">
              {/* Avatar overlaps up into the band; the name sits below it. */}
              <div className="-mt-12 shrink-0 sm:-mt-14">
                <Avatar fullName={data.full_name} avatarUrl={data.avatar_url} />
              </div>
              <div className="min-w-0 pt-3">
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-[-0.8px] leading-[1.05] text-ink">
                  {data.full_name ?? "Unnamed candidate"}
                </h1>
                {data.headline && (
                  <p className="mt-1 text-[14px] sm:text-[15px] text-slate-body leading-snug max-w-[640px]">
                    {data.headline}
                  </p>
                )}
              </div>
            </div>
            {/* Actions clear the band via pt-4 so they never touch it. */}
            {headerActions && (
              <div className="flex flex-col items-end gap-2 shrink-0 pt-4">
                {headerActions}
              </div>
            )}
          </div>

          {/* Meta row */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-slate-meta">
            {data.current_title && (
              <span className="inline-flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" /> {data.current_title}
              </span>
            )}
            {cityState && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> {cityState}
              </span>
            )}
            {openToWork && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-heritage/12 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.5px] text-heritage-deep ring-1 ring-inset ring-heritage/25">
                <CheckCircle2 className="h-3 w-3" />
                {openToWork}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 lg:gap-10">
        <div className="space-y-8">
          {data.summary && (
            <Section title="About">
              <p className="text-[14px] text-ink leading-relaxed whitespace-pre-wrap">
                {data.summary}
              </p>
            </Section>
          )}

          {work.length > 0 && (
            <Section title="Experience">
              <ol className="list-none space-y-5">
                {work.map((w) => (
                  <li key={w.id} className="flex gap-3.5">
                    <div
                      className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-cream border border-[var(--rule)]"
                      aria-hidden
                    >
                      <Briefcase className="h-3.5 w-3.5 text-heritage-deep" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14px] font-bold text-ink leading-tight">
                        {w.title ?? "Role"}
                      </div>
                      <div className="text-[13px] text-slate-body">
                        {w.company_name ?? "—"}
                        {w.is_dso ? " · DSO" : ""}
                      </div>
                      <div className="text-[11.5px] text-slate-meta mt-0.5">
                        {formatDateRange(w.start_date, w.end_date, w.is_current)}
                      </div>
                      {w.description && (
                        <p className="mt-1.5 text-[13px] text-slate-body leading-relaxed whitespace-pre-wrap">
                          {w.description}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {education.length > 0 && (
            <Section title="Education">
              <ol className="list-none space-y-4">
                {education.map((e) => (
                  <li key={e.id} className="flex gap-3.5">
                    <div
                      className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-cream border border-[var(--rule)]"
                      aria-hidden
                    >
                      <GraduationCap className="h-3.5 w-3.5 text-heritage-deep" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14px] font-bold text-ink leading-tight">
                        {e.school_name ?? "School"}
                      </div>
                      <div className="text-[13px] text-slate-body">
                        {[e.degree, e.field_of_study].filter(Boolean).join(", ")}
                      </div>
                      <div className="text-[11.5px] text-slate-meta mt-0.5">
                        {formatYearRange(e.start_year, e.end_year)}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {(licenses.length > 0 || certifications.length > 0) && (
            <Section title="Licenses & certifications">
              <ul className="list-none space-y-2.5">
                {licenses.map((l) => (
                  <CredentialRow
                    key={`l-${l.id}`}
                    primary={[l.license_type, l.state].filter(Boolean).join(" · ") || "License"}
                    secondary={formatExpiry(l.expires_date)}
                    status={l.verification_status}
                  />
                ))}
                {certifications.map((cert) => (
                  <CredentialRow
                    key={`c-${cert.id}`}
                    primary={[cert.kind, cert.level].filter(Boolean).join(" · ") || "Certification"}
                    secondary={formatExpiry(cert.expires_date)}
                    status={cert.verification_status}
                  />
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-slate-meta leading-relaxed">
                &ldquo;Verified&rdquo; reflects an employer&apos;s or third
                party&apos;s own diligence. DSO Hire passes credentials through —
                it never verifies them itself.
              </p>
            </Section>
          )}

          {(data.skills ?? []).length > 0 && (
            <Section title="Skills">
              <ChipList items={data.skills ?? []} />
            </Section>
          )}

          {(data.pms_systems ?? []).length > 0 && (
            <Section title="Practice management systems">
              <ChipList items={data.pms_systems ?? []} />
            </Section>
          )}

          {(data.languages ?? []).length > 0 && (
            <Section title="Languages">
              <ChipList items={data.languages ?? []} />
            </Section>
          )}

          {(data.schedule_preferences ?? []).length > 0 && (
            <Section title="Schedule preferences">
              <ChipList items={data.schedule_preferences ?? []} />
            </Section>
          )}

          {footerSections}
        </div>

        <aside className="space-y-6">
          <SidebarCard title="Experience">
            <SidebarRow
              label="Total experience"
              value={
                data.years_experience !== null
                  ? `${data.years_experience} yr${data.years_experience === 1 ? "" : "s"}`
                  : "—"
              }
            />
            {data.years_experience_dental !== null && (
              <SidebarRow
                label="Dental experience"
                value={`${data.years_experience_dental} yr${data.years_experience_dental === 1 ? "" : "s"}`}
              />
            )}
          </SidebarCard>

          {(data.license_states ?? []).length > 0 && (
            <SidebarCard title="Licensed in">
              <div className="flex flex-wrap gap-1.5">
                {(data.license_states ?? []).map((s) => (
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

          {(data.desired_locations ?? []).length > 0 && (
            <SidebarCard title="Desired locations">
              <ChipList items={data.desired_locations ?? []} small />
            </SidebarCard>
          )}

          {data.availability && AVAILABILITY_LABELS[data.availability] && (
            <SidebarCard title="Availability">
              <div className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-heritage-deep">
                <Clock className="h-3.5 w-3.5" />
                {AVAILABILITY_LABELS[data.availability]}
              </div>
            </SidebarCard>
          )}

          {data.linkedin_url && (
            <SidebarCard title="Links">
              <a
                href={data.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] text-heritage-deep hover:text-ink underline underline-offset-2 break-all"
              >
                LinkedIn profile
              </a>
            </SidebarCard>
          )}

          {data.resume_url && (
            <SidebarCard title="Resume">
              <div className="inline-flex items-start gap-1.5 text-[12px] text-slate-body leading-snug">
                <FileText className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                {viewer === "employer"
                  ? "Resume on file. Available after first outreach."
                  : "On file — employers can access it after reaching out to you."}
              </div>
            </SidebarCard>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ───────── helpers ───────── */

function openToWorkLabel(availability: string | null): string | null {
  if (!availability) return null;
  if (availability === "passive") return "Open to opportunities";
  if (AVAILABILITY_LABELS[availability]) return "Open to work";
  return null;
}

function CredentialRow({
  primary,
  secondary,
  status,
}: {
  primary: string;
  secondary: string | null;
  status: string;
}) {
  const badge = credentialBadge(status);
  return (
    <li className="flex items-start justify-between gap-3 border border-[var(--rule)] bg-white px-3.5 py-2.5">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-ink leading-tight">
          {primary}
        </div>
        {secondary && (
          <div className="text-[11.5px] text-slate-meta mt-0.5">{secondary}</div>
        )}
      </div>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px] ring-1 ring-inset shrink-0 ${badge.cls}`}
      >
        <badge.Icon className="h-2.5 w-2.5" aria-hidden />
        {badge.label}
      </span>
    </li>
  );
}

function credentialBadge(status: string): {
  label: string;
  cls: string;
  Icon: React.ComponentType<{ className?: string }>;
} {
  switch (status) {
    case "verified":
      return {
        label: "Verified",
        cls: "bg-emerald-50 text-emerald-800 ring-emerald-300",
        Icon: ShieldCheck,
      };
    case "expired":
      return {
        label: "Expired",
        cls: "bg-red-50 text-red-800 ring-red-300",
        Icon: AlertTriangle,
      };
    case "pending":
      return {
        label: "Pending",
        cls: "bg-amber-50 text-amber-800 ring-amber-300",
        Icon: Clock,
      };
    case "unverified":
    default:
      return {
        label: "Self-reported",
        cls: "bg-slate-50 text-slate-600 ring-slate-300",
        Icon: FileText,
      };
  }
}

function formatDateRange(
  start: string | null,
  end: string | null,
  isCurrent: boolean | null
): string {
  const s = formatMonthYear(start);
  if (isCurrent) return s ? `${s} — Present` : "Present";
  const e = formatMonthYear(end);
  if (s && e) return `${s} — ${e}`;
  return s || e || "";
}

function formatMonthYear(date: string | null): string {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function formatYearRange(start: number | null, end: number | null): string {
  if (start && end) return `${start} — ${end}`;
  if (end) return `${end}`;
  if (start) return `${start} — present`;
  return "";
}

function formatExpiry(date: string | null): string | null {
  const my = formatMonthYear(date);
  return my ? `Expires ${my}` : null;
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
}: {
  fullName: string | null;
  avatarUrl: string | null;
}) {
  const cls = "h-20 w-20 sm:h-24 sm:w-24 text-[24px] ring-4 ring-white";
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
