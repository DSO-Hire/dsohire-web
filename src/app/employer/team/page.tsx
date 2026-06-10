/**
 * /employer/team — manage DSO teammates + pending invitations.
 *
 * Owner/admin can invite by email, change a teammate's role, or remove a
 * teammate. Recruiters and hiring managers see a read-only view of who's
 * on the team.
 *
 * Member emails come from auth.users via the service-role client — RLS
 * doesn't expose auth.users to the regular Supabase client.
 *
 * Hiring-manager support (Phase 3a, 2026-05-05): the invite form now
 * exposes a hiring_manager role option with a multi-select of dso_locations
 * to scope the new HM to. Existing HMs are listed with their scoped
 * locations as badges. Re-scoping is handled via the assignHmLocations
 * action wired to a separate dialog (added in Phase 3b).
 */

import { redirect } from "next/navigation";
import { Trash2, UserPlus, X } from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import { Avatar } from "@/components/ui/avatar";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { InviteForm } from "./invite-form";
import { getCapStatus } from "@/lib/billing/caps";
import { CapNudge } from "@/components/billing/cap-nudge";
import { SeatPackControl } from "@/components/billing/seat-pack-control";
import {
  seatPacksConfigured,
  tierCanBuySeatPacks,
  periodFromStripePriceId,
  SEAT_PACK_SIZE,
  SEAT_PACK_MONTHLY_PRICE,
  SEAT_PACK_ANNUAL_PRICE,
} from "@/lib/stripe/prices";
import { RoleSelect } from "./role-select";
import { RoleHelp } from "./role-help";
import { HmRescopeButton } from "./hm-rescope-button";
import { PermissionsEditorButton } from "./permissions-editor";
import {
  effectivePermissions,
  parsePermissionOverrides,
  type Capability,
  type DsoRole,
} from "@/lib/permissions/capabilities";
import { dsoCanEditPermissions } from "@/lib/permissions/tier";
import { removeTeammate, revokeInvitation } from "./actions";
import { ListSort } from "@/components/ui/list-sort";
import { RoleFilter } from "./role-filter";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Team" };

const TEAM_SORT_OPTIONS = [
  { value: "name", label: "Name (A→Z)" },
  { value: "joined", label: "Recently joined" },
  { value: "joined_oldest", label: "Longest tenured" },
  { value: "role", label: "Role order" },
] as const;
type TeamSortKey = (typeof TEAM_SORT_OPTIONS)[number]["value"];

const ROLE_SORT_ORDER: Record<string, number> = {
  owner: 0,
  admin: 1,
  recruiter: 2,
  hiring_manager: 3,
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  recruiter: "Recruiter",
  hiring_manager: "Hiring Manager",
};

interface PageProps {
  searchParams: Promise<{ sort?: string; role?: string }>;
}

export default async function TeamPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const sortKey: TeamSortKey =
    (TEAM_SORT_OPTIONS.find((o) => o.value === sp.sort)?.value as
      | TeamSortKey
      | undefined) ?? "name";
  const roleFilter = sp.role ?? "";
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, role, full_name, permission_overrides")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  // Hiring managers don't access team management.
  if (dsoUser.role === "hiring_manager") redirect("/employer/dashboard");

  // #83 — capability-driven (role preset + per-teammate overrides).
  const viewerPerms = effectivePermissions(
    dsoUser.role as string,
    (dsoUser as Record<string, unknown>).permission_overrides
  );
  const canManage = viewerPerms["team.manage"];
  // Phase 3 — per-teammate permission overrides are Growth+ (Solo sees the
  // presets read-only with an upgrade nudge inside the dialog).
  const canEditPermissions = await dsoCanEditPermissions(
    supabase,
    dsoUser.dso_id as string
  );
  const capStatus = await getCapStatus(supabase, dsoUser.dso_id as string);

  // #88 — seat-pack add-on props (owner/admin, eligible tier, packs configured).
  // Surface the control when seats are near/over the cap or packs already exist.
  let seatPack: {
    currentPacks: number;
    seatsUsed: number;
    seatCap: number | null;
    period: "monthly" | "annual";
  } | null = null;
  if (
    canManage &&
    seatPacksConfigured() &&
    tierCanBuySeatPacks(capStatus.tier)
  ) {
    const { data: subRow } = await supabase
      .from("subscriptions")
      .select("stripe_price_id, seat_pack_qty")
      .eq("dso_id", dsoUser.dso_id)
      .maybeSingle();
    const currentPacks = (subRow?.seat_pack_qty as number | null) ?? 0;
    if (capStatus.seats.nearLimit || currentPacks > 0) {
      seatPack = {
        currentPacks,
        seatsUsed: capStatus.seats.used,
        seatCap: capStatus.seats.cap,
        period:
          periodFromStripePriceId(
            (subRow?.stripe_price_id as string | null) ?? ""
          ) ?? "monthly",
      };
    }
  }

  // Pull all team members for the DSO
  const { data: members } = await supabase
    .from("dso_users")
    .select(
      "id, auth_user_id, role, full_name, title, avatar_url, work_base, base_location_id, coverage_area, created_at, permission_overrides"
    )
    .eq("dso_id", dsoUser.dso_id)
    .order("created_at", { ascending: true });

  const allMemberRows = (members ?? []) as MemberRow[];

  // Apply role filter (if any) + sort.
  let memberRows = roleFilter
    ? allMemberRows.filter((m) => m.role === roleFilter)
    : allMemberRows;
  memberRows = (() => {
    const sorted = [...memberRows];
    if (sortKey === "name") {
      sorted.sort((a, b) =>
        ((a.full_name ?? "").trim()).localeCompare(
          (b.full_name ?? "").trim(),
          undefined,
          { sensitivity: "base" }
        )
      );
    } else if (sortKey === "joined") {
      sorted.sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
      );
    } else if (sortKey === "joined_oldest") {
      sorted.sort(
        (a, b) =>
          new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime()
      );
    } else if (sortKey === "role") {
      sorted.sort((a, b) => {
        const ra = ROLE_SORT_ORDER[a.role] ?? 99;
        const rb = ROLE_SORT_ORDER[b.role] ?? 99;
        if (ra !== rb) return ra - rb;
        return ((a.full_name ?? "").trim()).localeCompare(
          (b.full_name ?? "").trim(),
          undefined,
          { sensitivity: "base" }
        );
      });
    }
    return sorted;
  })();

  // Pull all DSO locations (used by the invite form's location multi-select
  // and to display HM scoped-location badges).
  const { data: locations } = await supabase
    .from("dso_locations")
    .select("id, name, city, state")
    .eq("dso_id", dsoUser.dso_id)
    .order("name", { ascending: true });

  const locationRows = (locations ?? []) as LocationRow[];
  const locationsById = new Map(locationRows.map((l) => [l.id, l]));

  // For each HM, fetch their location scope. Single query, group in JS.
  const hmIds = memberRows
    .filter((m) => m.role === "hiring_manager")
    .map((m) => m.id);

  const hmScopeByUserId = new Map<string, string[]>();
  if (hmIds.length > 0) {
    const { data: assignments } = await supabase
      .from("dso_user_locations")
      .select("dso_user_id, dso_location_id")
      .in("dso_user_id", hmIds);
    for (const row of assignments ?? []) {
      const list = hmScopeByUserId.get(row.dso_user_id as string) ?? [];
      list.push(row.dso_location_id as string);
      hmScopeByUserId.set(row.dso_user_id as string, list);
    }
  }

  // Resolve emails via service-role auth lookup (parallel)
  const admin = createSupabaseServiceRoleClient();
  const memberEmails = new Map<string, string>();
  await Promise.all(
    memberRows.map(async (m) => {
      try {
        const res = await admin.auth.admin.getUserById(m.auth_user_id);
        const email = res.data?.user?.email ?? null;
        if (email) memberEmails.set(m.auth_user_id, email);
      } catch {
        /* ignore — render row without email */
      }
    })
  );

  // Pending invitations (not accepted, not revoked, not expired)
  const nowIso = new Date().toISOString();
  const { data: invites } = await supabase
    .from("dso_invitations")
    .select("id, email, role, expires_at, created_at, invited_by, scoped_location_ids")
    .eq("dso_id", dsoUser.dso_id)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false });

  const inviteRows = (invites ?? []) as InviteRow[];

  // Count owners + admins (drives the "can demote / remove" guards in the UI)
  const ownerCount = memberRows.filter((m) => m.role === "owner").length;
  const adminCount = memberRows.filter(
    (m) => m.role === "owner" || m.role === "admin"
  ).length;

  return (
    <EmployerShell active="team">
      <CapNudge kind="seats" usage={capStatus.seats} tier={capStatus.tier} />
      {seatPack && (
        <div className="mb-8">
          <SeatPackControl
            currentPacks={seatPack.currentPacks}
            seatsUsed={seatPack.seatsUsed}
            seatCap={seatPack.seatCap}
            packSize={SEAT_PACK_SIZE}
            monthlyPrice={SEAT_PACK_MONTHLY_PRICE}
            annualPrice={SEAT_PACK_ANNUAL_PRICE}
            period={seatPack.period}
          />
        </div>
      )}
      <header className="mb-10 max-w-[820px]">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Team
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-[-1.2px] leading-tight text-ink">
          Your DSO Hire team
        </h1>
        <p className="mt-3 text-[14px] text-slate-body leading-relaxed">
          Add the people who&apos;ll post jobs and review applications. Each
          teammate gets their own login.{" "}
          {!canManage &&
            "Only owners and admins can invite or remove teammates."}
        </p>
      </header>

      {/* Invite form */}
      {canManage && (
        <section className="mb-12">
          <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
            Invite a Teammate
          </h2>
          <div className="mb-5">
            <RoleHelp />
          </div>
          <InviteForm locations={locationRows} />
        </section>
      )}

      {/* Members */}
      <section className="mb-12">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
            Active Team ({memberRows.length}
            {roleFilter ? ` of ${allMemberRows.length}` : ""})
          </h2>
          {allMemberRows.length > 1 && (
            <div className="flex items-center gap-3">
              <ListSort
                basePath="/employer/team"
                options={TEAM_SORT_OPTIONS}
                activeValue={sortKey}
                defaultValue="name"
              />
              <RoleFilter basePath="/employer/team" activeValue={roleFilter} />
            </div>
          )}
        </div>
        <ul className="list-none border-t border-[var(--rule)] max-w-[820px]">
          {memberRows.map((m) => (
            <MemberRowItem
              key={m.id}
              member={m}
              email={memberEmails.get(m.auth_user_id) ?? null}
              isCurrentUser={m.auth_user_id === user.id}
              canManage={canManage}
              canEditPermissions={canEditPermissions}
              viewerPerms={viewerPerms}
              ownerCount={ownerCount}
              adminCount={adminCount}
              scopedLocationIds={hmScopeByUserId.get(m.id) ?? []}
              locationsById={locationsById}
              allLocations={locationRows}
            />
          ))}
        </ul>
      </section>

      {/* Pending invitations */}
      {canManage && inviteRows.length > 0 && (
        <section>
          <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
            Pending Invitations ({inviteRows.length})
          </h2>
          <ul className="list-none border-t border-[var(--rule)] max-w-[820px]">
            {inviteRows.map((inv) => (
              <InviteRowItem
                key={inv.id}
                invitation={inv}
                locationsById={locationsById}
              />
            ))}
          </ul>
        </section>
      )}
    </EmployerShell>
  );
}

interface MemberRow {
  id: string;
  auth_user_id: string;
  role: string;
  full_name: string | null;
  title: string | null;
  avatar_url: string | null;
  work_base: string | null;
  base_location_id: string | null;
  coverage_area: string | null;
  created_at: string;
  /** #83 — per-teammate capability overrides (jsonb). */
  permission_overrides: unknown;
}

interface InviteRow {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
  invited_by: string | null;
  scoped_location_ids: string[] | null;
}

export interface LocationRow {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

function MemberRowItem({
  member,
  email,
  isCurrentUser,
  canManage,
  canEditPermissions,
  viewerPerms,
  ownerCount,
  adminCount,
  scopedLocationIds,
  locationsById,
  allLocations,
}: {
  member: MemberRow;
  email: string | null;
  isCurrentUser: boolean;
  canManage: boolean;
  canEditPermissions: boolean;
  viewerPerms: Record<Capability, boolean>;
  ownerCount: number;
  adminCount: number;
  scopedLocationIds: string[];
  locationsById: Map<string, LocationRow>;
  allLocations: LocationRow[];
}) {
  const isSoleOwner = member.role === "owner" && ownerCount <= 1;
  const isSoleAdmin =
    (member.role === "owner" || member.role === "admin") && adminCount <= 1;
  const canRemove =
    canManage && !isSoleOwner && !(isCurrentUser && isSoleAdmin);
  const isHm = member.role === "hiring_manager";

  return (
    <li className="border-b border-[var(--rule)] py-5 px-2 flex items-start gap-6 hover:bg-cream/40 transition-colors">
      <Avatar
        name={member.full_name ?? email ?? "Teammate"}
        imageUrl={member.avatar_url}
        seed={member.auth_user_id}
        size="md"
        className="shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[15px] font-semibold text-ink">
            {member.full_name || (email ?? "Teammate")}
          </span>
          {isCurrentUser && (
            <span className="text-[9px] font-bold tracking-[1.2px] uppercase text-heritage-deep">
              You
            </span>
          )}
        </div>
        {member.title && (
          <div className="text-[13px] font-medium text-ink leading-snug">
            {member.title}
          </div>
        )}
        {(() => {
          const base = describeWorkBase(member, locationsById);
          return base ? (
            <div className="text-[12px] tracking-[0.2px] text-heritage-deep">
              {base}
            </div>
          ) : null;
        })()}
        <div className="text-[13px] tracking-[0.3px] text-slate-meta">
          {email ?? "—"} · Joined {formatDate(member.created_at)}
        </div>
        {isHm && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {scopedLocationIds.length === 0 ? (
              <span className="text-[12px] tracking-[0.3px] text-red-700">
                No locations assigned — this user can&apos;t see jobs except
                corporate-scoped ones.
              </span>
            ) : (
              scopedLocationIds.map((id) => {
                const loc = locationsById.get(id);
                if (!loc) return null;
                return (
                  <span
                    key={id}
                    className="inline-flex items-center px-2 py-0.5 bg-cream border border-[var(--rule-strong)] text-[10px] font-semibold tracking-[0.4px] text-ink"
                  >
                    {loc.name}
                    {loc.state ? ` · ${loc.state}` : ""}
                  </span>
                );
              })
            )}
            {canManage && (
              <HmRescopeButton
                dsoUserId={member.id}
                hmName={member.full_name || email || "Hiring manager"}
                initialLocationIds={scopedLocationIds}
                locations={allLocations}
              />
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-1.5">
        <RoleControl
          member={member}
          canManage={canManage}
          isSoleOwner={isSoleOwner}
        />
        {/* #83 Phase 3 — per-teammate permission editor. Owner rows have
            everything; your own row is never editable (no self-escalation). */}
        {canManage && member.role !== "owner" && !isCurrentUser && (
          <PermissionsEditorButton
            targetDsoUserId={member.id}
            targetName={member.full_name || (email ?? "Teammate")}
            targetRole={member.role as DsoRole}
            overrides={parsePermissionOverrides(member.permission_overrides)}
            editable={canEditPermissions}
            viewerPerms={viewerPerms}
          />
        )}
      </div>

      {canRemove && (
        <form action={removeTeammate}>
          <input type="hidden" name="dso_user_id" value={member.id} />
          <button
            type="submit"
            aria-label="Remove teammate"
            className="p-2 text-slate-meta hover:text-red-700 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </form>
      )}
    </li>
  );
}

function RoleControl({
  member,
  canManage,
  isSoleOwner,
}: {
  member: MemberRow;
  canManage: boolean;
  isSoleOwner: boolean;
}) {
  // If the viewer can't manage, the row is the sole owner, or the row is a
  // hiring manager (role is set on invite, not editable via the simple
  // dropdown), just show the badge.
  if (
    !canManage ||
    isSoleOwner ||
    member.role === "owner" ||
    member.role === "hiring_manager"
  ) {
    return <RoleBadge role={member.role} />;
  }

  // Allow toggling between admin and recruiter for non-HM, non-owner members.
  return <RoleSelect dsoUserId={member.id} currentRole={member.role} />;
}

function RoleBadge({ role }: { role: string }) {
  const cls =
    role === "owner"
      ? "bg-ink text-ivory"
      : role === "admin"
        ? "bg-heritage text-ivory"
        : role === "hiring_manager"
          ? "bg-heritage-light text-ink border border-heritage"
          : "bg-cream text-ink border border-[var(--rule-strong)]";
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-[10px] font-bold tracking-[1.5px] uppercase whitespace-nowrap ${cls}`}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function InviteRowItem({
  invitation,
  locationsById,
}: {
  invitation: InviteRow;
  locationsById: Map<string, LocationRow>;
}) {
  const expiresIn = daysUntil(invitation.expires_at);
  const scopedIds = invitation.scoped_location_ids ?? [];
  const isHm = invitation.role === "hiring_manager";

  return (
    <li className="border-b border-[var(--rule)] py-4 px-2 flex items-start gap-6 hover:bg-cream/40 transition-colors">
      <div className="h-10 w-10 rounded-full bg-ivory-deep border border-[var(--rule)] flex items-center justify-center flex-shrink-0">
        <UserPlus className="h-4 w-4 text-slate-meta" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold text-ink truncate">
          {invitation.email}
        </div>
        <div className="text-[13px] tracking-[0.3px] text-slate-meta">
          Invited as{" "}
          <span className="text-ink font-semibold">
            {ROLE_LABELS[invitation.role] ?? invitation.role}
          </span>{" "}
          ·{" "}
          {expiresIn > 0
            ? `Expires in ${expiresIn} ${expiresIn === 1 ? "day" : "days"}`
            : "Expired"}
        </div>
        {isHm && scopedIds.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {scopedIds.map((id) => {
              const loc = locationsById.get(id);
              if (!loc) return null;
              return (
                <span
                  key={id}
                  className="inline-flex items-center px-2 py-0.5 bg-cream border border-[var(--rule-strong)] text-[10px] font-semibold tracking-[0.4px] text-ink"
                >
                  {loc.name}
                  {loc.state ? ` · ${loc.state}` : ""}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <form action={revokeInvitation}>
        <input type="hidden" name="invitation_id" value={invitation.id} />
        <button
          type="submit"
          aria-label="Revoke invitation"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold tracking-[1.5px] uppercase text-slate-body hover:text-red-700 hover:bg-red-50 transition-colors"
        >
          <X className="h-3 w-3" />
          Revoke
        </button>
      </form>
    </li>
  );
}

/* ───── formatters ───── */

/**
 * Human-readable "works out of" descriptor for the team roster. Returns
 * null when the teammate hasn't set a base. Practice base resolves the
 * location name via the page's locationsById map.
 */
function describeWorkBase(
  member: MemberRow,
  locationsById: Map<string, LocationRow>
): string | null {
  switch (member.work_base) {
    case "corporate":
      return "Corporate / central office";
    case "practice": {
      const loc = member.base_location_id
        ? locationsById.get(member.base_location_id)
        : null;
      if (!loc) return "Based at a practice";
      return `Based at ${loc.name}${loc.state ? ` · ${loc.state}` : ""}`;
    }
    case "regional":
      return member.coverage_area
        ? `Regional · ${member.coverage_area}`
        : "Regional";
    default:
      return null;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
