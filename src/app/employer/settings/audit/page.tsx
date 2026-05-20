/**
 * /employer/settings/audit — Activity & audit log (Phase 4.5.e MVP).
 *
 * Filterable list of audit_events for the active DSO. Tier-graduated
 * retention enforced at read time (Starter 7d / Growth+ 30d /
 * Enterprise indefinite). Filters: actor (single-select), event kind
 * (multi-select), date range (last 24h / 7d / 30d / all). Paginated
 * 50 rows at a time.
 *
 * MVP scope intentionally tight — no CSV export, no per-event drill-
 * in, no IP/user-agent capture yet. Those layer in once we have a
 * real customer asking for them.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Briefcase,
  History,
  Layers,
  ShieldCheck,
  Settings as SettingsIcon,
  User as UserIcon,
  Users,
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AUDIT_RETENTION_DAYS } from "@/lib/audit/record";
import { AuditFiltersBar } from "./audit-filters-bar";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Activity & audit · Settings" };

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    actor?: string;
    kind?: string | string[];
    range?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 50;

const RANGE_DAYS: Record<string, number | null> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  all: null,
};

const EVENT_KIND_LABELS: Record<string, string> = {
  "application.stage_moved": "Application stage moved",
  "application.affiliation_revealed": "DSO affiliation revealed",
  "bulk_action.applied": "Bulk action",
  "settings.affiliation_policy_changed": "Affiliation policy changed",
  "location.affiliation_toggled": "Location affiliation toggled",
  "team.invited": "Teammate invited",
  "team.role_changed": "Teammate role changed",
  "job.created": "Job created",
  "job.updated": "Job updated",
  "job.status_changed": "Job status changed",
  "job.archived": "Job deleted",
  "security.2fa_enabled": "2FA enabled",
  "security.2fa_disabled": "2FA disabled",
  "security.recovery_codes_regenerated": "2FA recovery codes regenerated",
  "security.org_mfa_enforcement_changed": "Org-wide 2FA toggle",
};

export default async function AuditSettingsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  const dsoId = dsoUser.dso_id as string;

  // Resolve subscription tier for the retention window. We don't gate
  // visibility — every DSO sees their audit log — but Starter only
  // shows the most recent 7 days, Growth+ shows 30, Enterprise shows
  // everything. Falls open to Growth-equivalent (30d) when the
  // subscription read fails so we don't accidentally hide history.
  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("tier, status")
    .eq("dso_id", dsoId)
    .in("status", ["trialing", "active", "past_due"])
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  const tier = (subRow?.tier as string | undefined) ?? "growth";
  const tierRetentionDays = AUDIT_RETENTION_DAYS[tier] ?? 30;

  // Compose filters.
  const actorId = (sp.actor ?? "").trim();
  const kindFilters = Array.isArray(sp.kind)
    ? sp.kind
    : sp.kind
      ? [sp.kind]
      : [];
  const rangeKey = sp.range ?? "30d";
  const rangeDays = RANGE_DAYS[rangeKey] ?? 30;
  const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  // Effective floor — min(rangeDays, tierRetentionDays). 0 = indefinite.
  const effectiveFloorDays =
    tierRetentionDays === 0
      ? rangeDays
      : rangeDays === null
        ? tierRetentionDays
        : Math.min(rangeDays, tierRetentionDays);

  let query = supabase
    .from("audit_events")
    .select(
      "id, event_kind, summary, actor_dso_user_id, actor_name, actor_role, created_at, metadata, target_table, target_id",
      { count: "exact" }
    )
    .eq("dso_id", dsoId)
    .order("created_at", { ascending: false });

  if (effectiveFloorDays !== null && effectiveFloorDays > 0) {
    // Server component running at request time — Date.now() is the
    // intended call here (the audit cutoff is "events newer than N days
    // before this request"). The react-hooks/purity rule is broader than
    // it needs to be for Next.js App Router server components, which
    // execute once per request rather than during a re-rendering tree.
    const nowMs = Date.now(); // eslint-disable-line react-hooks/purity
    const cutoff = new Date(
      nowMs - effectiveFloorDays * 24 * 60 * 60 * 1000
    ).toISOString();
    query = query.gte("created_at", cutoff);
  }
  if (actorId) {
    query = query.eq("actor_dso_user_id", actorId);
  }
  if (kindFilters.length > 0) {
    query = query.in("event_kind", kindFilters);
  }

  query = query.range((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE - 1);

  const { data: rows, count } = await query;
  const events = (rows ?? []) as Array<{
    id: string;
    event_kind: string;
    summary: string;
    actor_dso_user_id: string | null;
    actor_name: string | null;
    actor_role: string | null;
    created_at: string;
    metadata: Record<string, unknown>;
    target_table: string | null;
    target_id: string | null;
  }>;
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Pull the team list for the actor filter dropdown.
  const { data: teamRows } = await supabase
    .from("dso_users")
    .select("id, full_name, role")
    .eq("dso_id", dsoId)
    .order("full_name", { ascending: true });
  const teammates = (teamRows ?? []) as Array<{
    id: string;
    full_name: string | null;
    role: string;
  }>;

  return (
    <section className="max-w-[920px]">
      <header className="mb-6">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Activity & Audit
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.8px] leading-[1.15] text-ink">
          Every action your team takes
        </h2>
        <p className="mt-3 text-[14px] text-slate-body leading-relaxed">
          Stage moves, affiliation toggles, role changes, and other
          meaningful actions captured with actor + timestamp. Read-only;
          history can&apos;t be edited or deleted.
        </p>
        <div className="mt-3 inline-flex items-center gap-2 text-[11px] text-slate-meta">
          <History className="h-3 w-3" />
          {tierRetentionDays === 0
            ? "Retention: indefinite (Enterprise)"
            : `Retention: ${tierRetentionDays} days (${tier.charAt(0).toUpperCase() + tier.slice(1)} tier)`}
        </div>
      </header>

      <AuditFiltersBar
        teammates={teammates}
        eventKinds={EVENT_KIND_LABELS}
        activeActor={actorId}
        activeKinds={kindFilters}
        activeRange={rangeKey}
      />

      <div className="mt-6 border border-[var(--rule)] bg-white">
        {events.length === 0 ? (
          <div className="p-12 text-center">
            <History className="mx-auto h-7 w-7 text-slate-meta mb-3" />
            <p className="text-[14px] text-ink mb-1">
              No events match these filters.
            </p>
            <p className="text-[13px] text-slate-meta">
              {totalCount === 0
                ? "Your audit log will populate as your team uses DSO Hire."
                : "Try widening the date range or clearing filters."}
            </p>
          </div>
        ) : (
          <ul className="list-none divide-y divide-[var(--rule)]">
            {events.map((event) => (
              <AuditEventRow key={event.id} event={event} />
            ))}
          </ul>
        )}
      </div>

      {totalPages > 1 && (
        <Paginator
          page={pageNum}
          totalPages={totalPages}
          totalCount={totalCount}
          buildHref={(p) => buildPageHref(sp, p)}
        />
      )}
    </section>
  );
}

function Paginator({
  page,
  totalPages,
  totalCount,
  buildHref,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  buildHref: (p: number) => string;
}) {
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, totalCount);
  return (
    <div className="mt-4 flex items-center justify-between text-[12px] text-slate-meta">
      <span>
        Showing {start}–{end} of {totalCount}
      </span>
      <div className="flex items-center gap-2">
        {page > 1 && (
          <a
            href={buildHref(page - 1)}
            className="px-3 py-1.5 border border-[var(--rule-strong)] text-ink text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-cream"
          >
            Previous
          </a>
        )}
        {page < totalPages && (
          <a
            href={buildHref(page + 1)}
            className="px-3 py-1.5 bg-ink text-ivory text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft"
          >
            Next
          </a>
        )}
      </div>
    </div>
  );
}

function buildPageHref(
  sp: {
    actor?: string;
    kind?: string | string[];
    range?: string;
    page?: string;
  },
  page: number
): string {
  const params = new URLSearchParams();
  if (sp.actor) params.set("actor", sp.actor);
  if (sp.range) params.set("range", sp.range);
  const kinds = Array.isArray(sp.kind) ? sp.kind : sp.kind ? [sp.kind] : [];
  for (const k of kinds) params.append("kind", k);
  params.set("page", String(page));
  return `/employer/settings/audit?${params.toString()}`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ───── v0.1 polish: per-event row component + helpers ───── */

interface AuditEventRowData {
  id: string;
  event_kind: string;
  summary: string;
  actor_dso_user_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
  target_table: string | null;
  target_id: string | null;
}

/**
 * Single event row. Adds three things over the MVP:
 *   1. Per-kind icon (Briefcase for jobs, ShieldCheck for security, etc.)
 *   2. Optional `metadata.reason` rendered as a quoted secondary line
 *      — preserves the recruiter's note from bulk reject/archive ops so
 *      audit readers can see WHY without drilling into status_events.
 *   3. Wraps the event in a Next Link when a meaningful target_href can
 *      be resolved (jobs detail, application detail, location detail).
 */
function AuditEventRow({ event }: { event: AuditEventRowData }) {
  const reason = extractReason(event.metadata);
  const targetHref = resolveTargetHref(event);

  const body = (
    <div className="flex items-start gap-3">
      <div className="h-7 w-7 rounded-full bg-cream border border-[var(--rule-strong)] flex items-center justify-center flex-shrink-0 mt-0.5">
        <EventKindIcon eventKind={event.event_kind} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] text-ink leading-snug">
          <strong className="font-semibold">
            {event.actor_name ?? "(deleted user)"}
          </strong>{" "}
          <span className="text-slate-body">{event.summary}</span>
        </p>
        {reason && (
          <p className="mt-1 text-[13px] text-slate-body italic leading-snug border-l-2 border-[var(--rule-strong)] pl-3">
            &ldquo;{reason}&rdquo;
          </p>
        )}
        <p className="mt-1 text-[11px] tracking-[0.3px] text-slate-meta">
          {EVENT_KIND_LABELS[event.event_kind] ?? event.event_kind}
          {" · "}
          {event.actor_role
            ? event.actor_role.replace("_", " ")
            : "—"}
          {" · "}
          <time
            dateTime={event.created_at}
            title={formatTimestamp(event.created_at)}
          >
            {formatRelativeTimestamp(event.created_at)}
          </time>
        </p>
      </div>
    </div>
  );

  if (targetHref) {
    return (
      <li className="px-5 py-4 hover:bg-cream/30 transition-colors">
        <Link href={targetHref} className="block">
          {body}
        </Link>
      </li>
    );
  }
  return <li className="px-5 py-4">{body}</li>;
}

/**
 * Pull a recruiter-supplied note off the metadata. Today this lives at
 * `metadata.reason` (set by bulk reject + bulk archive). Future event
 * kinds with a free-text rationale should populate the same key.
 */
function extractReason(metadata: Record<string, unknown>): string | null {
  const raw = (metadata as { reason?: unknown })?.reason;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Hard cap on line length so a misbehaving caller can't blow up the row.
  return trimmed.length > 280 ? trimmed.slice(0, 280) + "…" : trimmed;
}

/**
 * Resolve a "go to the affected thing" link from an audit event.
 * Returns null when there's no useful target (e.g. settings changes,
 * security events, deleted targets).
 */
function resolveTargetHref(event: AuditEventRowData): string | null {
  const meta = event.metadata as Record<string, unknown>;
  // bulk_action.applied — link to the job whose pipeline was acted on.
  if (event.event_kind === "bulk_action.applied") {
    const jobId = (meta.job_id as string | undefined) ?? null;
    if (jobId) return `/employer/jobs/${jobId}/applications`;
  }
  // application.stage_moved + application.affiliation_revealed — link
  // straight to the candidate's application detail.
  if (
    event.event_kind === "application.stage_moved" ||
    event.event_kind === "application.affiliation_revealed"
  ) {
    const appId =
      (meta.application_id as string | undefined) ?? event.target_id ?? null;
    if (appId) return `/employer/applications/${appId}`;
  }
  // Any job.* event — link to the job detail page.
  if (event.event_kind.startsWith("job.")) {
    const jobId = (meta.job_id as string | undefined) ?? event.target_id ?? null;
    if (jobId) return `/employer/jobs/${jobId}`;
  }
  // location.affiliation_toggled — link to the location detail page.
  if (event.event_kind === "location.affiliation_toggled" && event.target_id) {
    return `/employer/locations/${event.target_id}`;
  }
  // team.* — link to the team page (no per-row detail surface today).
  if (event.event_kind.startsWith("team.")) return "/employer/team";
  // settings/security — no target; the audit log itself is the surface.
  return null;
}

/**
 * Render the per-kind icon for an audit event row. Uses a dotted-
 * namespace prefix match so adding a new event kind under an existing
 * namespace (e.g. `job.something_new`) picks up the right icon for
 * free.
 *
 * Implemented as a component (rather than a `const Icon = lookup(kind)`
 * binding inside AuditEventRow) so we don't trip
 * `react-hooks/static-components`. Each branch returns a stable element
 * tied to a module-scope component reference.
 */
function EventKindIcon({ eventKind }: { eventKind: string }) {
  const className = "h-3.5 w-3.5 text-slate-meta";
  if (eventKind.startsWith("job.")) {
    return <Briefcase className={className} />;
  }
  if (
    eventKind.startsWith("application.") ||
    eventKind.startsWith("bulk_action.")
  ) {
    return <Layers className={className} />;
  }
  if (eventKind.startsWith("security.")) {
    return <ShieldCheck className={className} />;
  }
  if (eventKind.startsWith("team.")) {
    return <Users className={className} />;
  }
  if (
    eventKind.startsWith("settings.") ||
    eventKind.startsWith("location.")
  ) {
    return <SettingsIcon className={className} />;
  }
  return <UserIcon className={className} />;
}

/**
 * Relative timestamp for the event line. Falls back to the absolute
 * formatTimestamp output for anything older than ~30 days. Pairs with
 * the `<time title="...">` wrapper so the absolute timestamp is always
 * one hover away.
 */
function formatRelativeTimestamp(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return formatTimestamp(iso);
}
