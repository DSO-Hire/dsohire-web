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
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { InviteForm } from "./invite-form";
import { RoleSelect } from "./role-select";
import { removeTeammate, revokeInvitation } from "./actions";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Team" };

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  recruiter: "Recruiter",
  hiring_manager: "Hiring Manager",
};

export default async function TeamPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, role, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  const canManage = dsoUser.role === "owner" || dsoUser.role === "admin";

  // Pull all team members for the DSO
  const { data: members } = await supabase
    .from("dso_users")
    .select("id, auth_user_id, role, full_name, created_at")
    .eq("dso_id", dsoUser.dso_id)
    .order("created_at", { ascending: true });

  const memberRows = (members ?? []) as MemberRow[];

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
          <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
            Invite a Teammate
          </h2>
          <InviteForm locations={locationRows} />
        </section>
      )}

      {/* Members */}
      <section className="mb-12">
        <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
          Active Team ({memberRows.length})
        </h2>
        <ul className="list-none border-t border-[var(--rule)] max-w-[820px]">
          {memberRows.map((m) => (
            <MemberRowItem
              key={m.id}
              member={m}
              email={memberEmails.get(m.auth_user_id) ?? null}
              isCurrentUser={m.auth_user_id === user.id}
              canManage={canManage}
              ownerCount={ownerCount}
              adminCount={adminCount}
              scopedLocationIds={hmScopeByUserId.get(m.id) ?? []}
              locationsById={locationsById}
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
  created_at: string;
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
  ownerCount,
  adminCount,
  scopedLocationIds,
  locationsById,
}: {
  member: MemberRow;
  email: string | null;
  isCurrentUser: boolean;
  canManage: boolean;
  ownerCount: number;
  adminCount: number;
  scopedLocationIds: string[];
  locationsById: Map<string, LocationRow>;
}) {
  const isSoleOwner = member.role === "owner" && ownerCount <= 1;
  const isSoleAdmin =
    (member.role === "owner" || member.role === "admin") && adminCount <= 1;
  const canRemove =
    canManage && !isSoleOwner && !(isCurrentUser && isSoleAdmin);
  const isHm = member.role === "hiring_manager";

  return (
    <li className="border-b border-[var(--rule)] py-5 px-2 flex items-start gap-6 hover:bg-cream/40 transition-colors">
      <div className="h-10 w-10 rounded-full bg-cream border border-[var(--rule-strong)] flex items-center justify-center flex-shrink-0">
        <span className="text-[12px] font-bold text-ink">
          {(member.full_name?.[0] ?? email?.[0] ?? "?").toUpperCase()}
        </span>
      </div>
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
        <div className="text-[12px] tracking-[0.3px] text-slate-meta">
          {email ?? "—"} · Joined {formatDate(member.created_at)}
        </div>
        {isHm && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {scopedLocationIds.length === 0 ? (
              <span className="text-[11px] tracking-[0.3px] text-red-700">
                No locations assigned — this user can&apos;t see anything.
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
          </div>
        )}
      </div>

      <RoleControl
        member={member}
        canManage={canManage}
        isSoleOwner={isSoleOwner}
      />

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
        <div className="text-[12px] tracking-[0.3px] text-slate-meta">
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
