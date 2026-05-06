/**
 * /candidate/settings/credentials — Phase 4.3.e v1.
 *
 * Four sections:
 *   1. Licenses — read-only summary of candidate_licenses with expiry
 *      highlighting (red 30 days out, amber 60 days out)
 *   2. Certifications — same pattern from candidate_certifications
 *   3. CE tracking — explicit "coming soon" with detailed scope
 *   4. Saved searches — full CRUD on candidate_saved_searches
 *
 * Licenses + certs editing lives on /candidate/profile (already shipped
 * in Phase 4.2.b). This Settings tab is the "what's expiring soon"
 * dashboard angle, not a duplicate editor.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ShieldCheck,
  GraduationCap,
  Clock,
  Search,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  LICENSE_TYPES,
  CERTIFICATION_KINDS,
} from "@/lib/candidate/canonical-lists";
import { SavedSearches, type SavedSearch } from "./saved-searches";

export const metadata: Metadata = { title: "Credentials · Settings" };

export default async function CandidateCredentialsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/sign-in?next=/candidate/settings/credentials");

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) redirect("/candidate/dashboard");

  const candidateId = candidate.id as string;

  const [
    { data: licenses },
    { data: certifications },
    { data: savedSearches },
  ] = await Promise.all([
    supabase
      .from("candidate_licenses")
      .select("id, license_type, state, expires_date, display_number")
      .eq("candidate_id", candidateId)
      .order("expires_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("candidate_certifications")
      .select("id, kind, level, expires_date")
      .eq("candidate_id", candidateId)
      .order("expires_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("candidate_saved_searches")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("updated_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display text-xl font-bold text-[#14233F]">
          Your dental-ops dashboard
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          License + certification expiry monitoring, CE tracking, and saved
          job-search alerts. The dental-ops tab no other job board has.
        </p>
      </header>

      <LicensesSection
        items={
          (licenses ?? []) as Array<{
            id: string;
            license_type: string;
            state: string | null;
            expires_date: string | null;
            display_number: boolean;
          }>
        }
      />
      <CertificationsSection
        items={
          (certifications ?? []) as Array<{
            id: string;
            kind: string;
            level: string | null;
            expires_date: string | null;
          }>
        }
      />
      <CeTrackingSection />
      <SavedSearchesSection
        searches={(savedSearches ?? []) as unknown as SavedSearch[]}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Licenses summary
// ─────────────────────────────────────────────────────────────────────

function LicensesSection({
  items,
}: {
  items: Array<{
    id: string;
    license_type: string;
    state: string | null;
    expires_date: string | null;
    display_number: boolean;
  }>;
}) {
  return (
    <SectionCard
      icon={<ShieldCheck className="size-5 text-[#4D7A60]" />}
      title={`Licenses${items.length > 0 ? ` (${items.length})` : ""}`}
      description="Color-coded by what's expiring soon. Red = under 30 days. Amber = 30-60 days. Green = 60+ days or no expiry on file."
    >
      {items.length === 0 ? (
        <EmptyHint
          text="Add licenses on your profile to see expiry monitoring here."
          ctaHref="/candidate/profile#section-licenses"
          ctaLabel="Edit on profile"
        />
      ) : (
        <ul className="space-y-2">
          {items.map((lic) => {
            const typeLabel =
              LICENSE_TYPES.find((o) => o.value === lic.license_type)?.label ??
              lic.license_type;
            return (
              <ExpiryRow
                key={lic.id}
                primary={typeLabel}
                secondary={lic.state ? `Licensed in ${lic.state}` : "State not set"}
                expiry={lic.expires_date}
                privateField={!lic.display_number}
              />
            );
          })}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-1.5 rounded-md bg-[#F7F4ED] px-3 py-2 text-xs text-slate-600">
        <Clock className="size-3.5 text-[#4D7A60]" />
        Reminder cadence (60 / 30 / 14 days before expiry) lands in the
        next Credentials sub-pass.
      </div>
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Certifications summary
// ─────────────────────────────────────────────────────────────────────

function CertificationsSection({
  items,
}: {
  items: Array<{
    id: string;
    kind: string;
    level: string | null;
    expires_date: string | null;
  }>;
}) {
  return (
    <SectionCard
      icon={<GraduationCap className="size-5 text-[#4D7A60]" />}
      title={`Certifications${items.length > 0 ? ` (${items.length})` : ""}`}
      description="CPR/BLS, anesthesia, sedation, OSHA, HIPAA — same expiry color-coding as licenses."
    >
      {items.length === 0 ? (
        <EmptyHint
          text="Add certifications on your profile to monitor them here."
          ctaHref="/candidate/profile#section-certifications"
          ctaLabel="Edit on profile"
        />
      ) : (
        <ul className="space-y-2">
          {items.map((cert) => {
            const kindLabel =
              CERTIFICATION_KINDS.find((o) => o.value === cert.kind)?.label ??
              cert.kind;
            return (
              <ExpiryRow
                key={cert.id}
                primary={kindLabel}
                secondary={cert.level ?? null}
                expiry={cert.expires_date}
              />
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// CE tracking — explicit stub
// ─────────────────────────────────────────────────────────────────────

function CeTrackingSection() {
  return (
    <SectionCard
      icon={<GraduationCap className="size-5 text-[#4D7A60]" />}
      title="Continuing education tracking"
      description="The big differentiator. Track CE hours against your state's requirements + upload certificates for your records."
    >
      <div className="rounded-md border border-[#4D7A60]/30 bg-[#F7F4ED] p-4">
        <p className="text-sm font-semibold text-[#14233F]">Coming soon</p>
        <p className="mt-1 text-sm text-slate-700">
          CE tracking is an XL build — file uploads (10MB cap, 50-cert max
          per candidate), state-specific CE requirements lookup, hours
          tracking by category, expiry reminders. Building it cleanly takes
          a focused session, not a tail-end add to a long sprint.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Per-license CE entries with course name, hours, category, completion date</li>
          <li>State-specific requirement lookup (initial states: CA, TX, FL, NY, IL)</li>
          <li>Certificate file upload to a private candidate-credentials bucket</li>
          <li>Compliance summary: &quot;You have 12 of 24 required hours for KS RDH renewal&quot;</li>
          <li>30-day pre-expiration reminders via the notification orchestration we shipped earlier today</li>
        </ul>
      </div>
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Saved searches
// ─────────────────────────────────────────────────────────────────────

function SavedSearchesSection({
  searches,
}: {
  searches: SavedSearch[];
}) {
  return (
    <SectionCard
      icon={<Search className="size-5 text-[#4D7A60]" />}
      title={`Saved searches${searches.length > 0 ? ` (${searches.length})` : ""}`}
      description="Get alerts when new jobs match a search you've saved. Manage frequency or pause alerts here."
    >
      <SavedSearches initial={searches} />
      <p className="mt-3 text-xs text-slate-500">
        Alert dispatch (the cron that compares new jobs against your saved
        searches and emails matches) lands in a follow-up. You can save +
        manage searches today; alerts start firing once the cron ships.
      </p>
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────────

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[var(--rule)] bg-white p-6 sm:p-8">
      <header className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#4D7A60]/10">
          {icon}
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-[#14233F]">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">{description}</p>
        </div>
      </header>
      <div>{children}</div>
    </section>
  );
}

function EmptyHint({
  text,
  ctaHref,
  ctaLabel,
}: {
  text: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/40 p-4 text-center">
      <p className="text-sm text-slate-600">{text}</p>
      {ctaHref && ctaLabel && (
        <Link
          href={ctaHref}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[#14233F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0d172b]"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}

function ExpiryRow({
  primary,
  secondary,
  expiry,
  privateField,
}: {
  primary: string;
  secondary: string | null;
  expiry: string | null;
  privateField?: boolean;
}) {
  const status = expiryStatus(expiry);
  return (
    <li className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-slate-50/40 p-3">
      <div className="flex-1">
        <p className="text-sm font-medium text-[#14233F]">{primary}</p>
        {secondary && (
          <p className="text-xs text-slate-500">{secondary}</p>
        )}
        <p className="mt-1 text-xs text-slate-500">
          {expiry ? (
            <>
              Expires{" "}
              {new Date(`${expiry}T00:00:00Z`).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              })}
              {status.daysOut !== null && (
                <span className="ml-1 text-slate-400">
                  ({status.daysOut > 0 ? `${status.daysOut} days` : "expired"})
                </span>
              )}
            </>
          ) : (
            "No expiry on file"
          )}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <ExpiryBadge status={status} />
        {privateField && (
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
            <Lock className="size-3" />
            Number hidden
          </span>
        )}
      </div>
    </li>
  );
}

function ExpiryBadge({
  status,
}: {
  status: { tier: "expired" | "soon" | "warning" | "ok" | "unknown"; daysOut: number | null };
}) {
  if (status.tier === "expired") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        <AlertTriangle className="size-3" />
        Expired
      </span>
    );
  }
  if (status.tier === "soon") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        <AlertTriangle className="size-3" />
        {status.daysOut}d
      </span>
    );
  }
  if (status.tier === "warning") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
        {status.daysOut}d
      </span>
    );
  }
  if (status.tier === "ok") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
        {status.daysOut}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
      No date
    </span>
  );
}

function expiryStatus(expiry: string | null): {
  tier: "expired" | "soon" | "warning" | "ok" | "unknown";
  daysOut: number | null;
} {
  if (!expiry) return { tier: "unknown", daysOut: null };
  const date = new Date(`${expiry}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return { tier: "unknown", daysOut: null };
  const now = new Date();
  const ms = date.getTime() - now.getTime();
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  if (days < 0) return { tier: "expired", daysOut: days };
  if (days < 30) return { tier: "soon", daysOut: days };
  if (days < 60) return { tier: "warning", daysOut: days };
  return { tier: "ok", daysOut: days };
}
