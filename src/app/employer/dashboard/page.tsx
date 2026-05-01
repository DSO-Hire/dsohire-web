/**
 * /employer/dashboard — landing after sign-in.
 *
 * Shows the DSO's headline KPIs (active jobs, applications this week,
 * applications in review, time-to-first-application). All zero for now —
 * real data wires in Phase 2 Week 3+ once jobs and applications tables exist.
 */

import Link from "next/link";
import { ArrowRight, Briefcase, Mail, MapPin, Users } from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import { BillingBanner } from "@/components/employer/billing-banner";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSubscriptionAnyStatus } from "@/lib/billing/subscription";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function EmployerDashboard() {
  const supabase = await createSupabaseServerClient();

  // Pull DSO context for header + KPI counts
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // user is non-null here because EmployerShell would have redirected;
  // guard for type narrowing
  const userId = user?.id ?? "";

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role, full_name")
    .eq("auth_user_id", userId)
    .maybeSingle();

  const dsoId = dsoUser?.dso_id;

  const { data: dso } = dsoId
    ? await supabase
        .from("dsos")
        .select("id, name, slug, status")
        .eq("id", dsoId)
        .maybeSingle()
    : { data: null };

  // Count locations for the "complete onboarding" hint
  const { count: locationsCount } = await supabase
    .from("dso_locations")
    .select("*", { count: "exact", head: true })
    .eq("dso_id", dsoId ?? "");

  // Count team members
  const { count: teamCount } = await supabase
    .from("dso_users")
    .select("*", { count: "exact", head: true })
    .eq("dso_id", dsoId ?? "");

  // Subscription status drives the billing banner at the top of the dashboard.
  const subscription = dsoId
    ? await getSubscriptionAnyStatus(supabase, dsoId)
    : null;

  return (
    <EmployerShell active="dashboard">
      <header className="mb-10">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          {dso?.status === "active" ? "Active" : "Onboarding"}
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.1] text-ink">
          Welcome back, {dsoUser?.full_name?.split(" ")[0] ?? "there"}.
        </h1>
        <p className="mt-3 text-base text-slate-body max-w-[640px]">
          Here&apos;s where things stand at <strong className="text-ink font-bold">{dso?.name}</strong>.
        </p>
      </header>

      {/* Billing alert — renders nothing when subscription is healthy */}
      <BillingBanner subscription={subscription} />

      {/* KPI cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--rule)] border border-[var(--rule)]">
        <KpiCard label="Active Jobs" value="0" icon={Briefcase} hint="Post your first" />
        <KpiCard label="Applications This Week" value="0" icon={Mail} hint="No applications yet" />
        <KpiCard label="In Review" value="0" icon={Users} hint="Move candidates forward" />
        <KpiCard
          label="Locations"
          value={String(locationsCount ?? 0)}
          icon={MapPin}
          hint={(locationsCount ?? 0) > 0 ? "Edit in Locations" : "Add your first"}
        />
      </section>

      {/* Onboarding nudge */}
      {(locationsCount ?? 0) === 0 && (
        <section className="mt-10 p-8 bg-ink text-ivory border-l-4 border-heritage">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage mb-3">
            Finish Onboarding
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.6px] leading-tight mb-3">
            Add your first practice location to start posting jobs.
          </h2>
          <p className="text-[14px] text-ivory/70 leading-relaxed max-w-[560px] mb-6">
            DSO Hire posts jobs across your locations in one flow. We need at
            least one location to enable job posting.
          </p>
          <Link
            href="/employer/onboarding"
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-heritage text-ivory text-[11px] font-bold tracking-[1.8px] uppercase hover:bg-heritage-deep transition-colors"
          >
            Continue Onboarding
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      )}

      {/* Quick links */}
      <section className="mt-12">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
          Quick Actions
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[var(--rule)] border border-[var(--rule)]">
          <QuickAction
            href="/employer/jobs/new"
            title="Post a job"
            body="Write once, deploy across all your practices."
          />
          <QuickAction
            href="/employer/locations"
            title="Manage locations"
            body={`${locationsCount ?? 0} location${(locationsCount ?? 0) === 1 ? "" : "s"} on file.`}
          />
          <QuickAction
            href="/employer/team"
            title="Invite teammates"
            body={`${teamCount ?? 1} team member${(teamCount ?? 1) === 1 ? "" : "s"}. Owner only.`}
          />
        </div>
      </section>
    </EmployerShell>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
}) {
  return (
    <div className="bg-white p-6 sm:p-7">
      <div className="flex items-center justify-between mb-4">
        <Icon className="h-5 w-5 text-slate-meta" />
      </div>
      <div className="text-3xl sm:text-4xl font-extrabold tracking-[-1px] text-ink leading-none">
        {value}
      </div>
      <div className="mt-2 text-[10px] font-bold tracking-[1.8px] uppercase text-slate-body">
        {label}
      </div>
      {hint && (
        <div className="mt-3 text-[12px] text-slate-meta">{hint}</div>
      )}
    </div>
  );
}

function QuickAction({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="group block bg-white p-7 hover:bg-cream transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="text-[16px] font-extrabold tracking-[-0.3px] text-ink mb-1.5">
            {title}
          </div>
          <div className="text-[13px] text-slate-body leading-snug">{body}</div>
        </div>
        <ArrowRight className="h-4 w-4 text-slate-meta group-hover:text-heritage transition-colors flex-shrink-0 mt-1" />
      </div>
    </Link>
  );
}
