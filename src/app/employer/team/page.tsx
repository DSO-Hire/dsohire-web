/**
 * /employer/team — manage DSO teammates + pending invitations.
 *
 * Owner/admin can invite by email, change a teammate's role, or remove a
 * teammate. Recruiters see a read-only view of who's on the team.
 *
 * Member emails come from auth.users via the service-role client — RLS
 * doesn't expose auth.users to the regular Supabase client.
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
    .select("id, email, role, expires_at, created_at, invited_by")
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
          <InviteForm />
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
              <InviteRowItem key={inv.id} invitation={inv} />
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
}

function MemberRowItem({
  member,
  email,
  isCurrentUser,
  canManage,
  ownerCount,
  adminCount,
}: {
  member: MemberRow;
  email: string | null;
  isCurrentUser: boolean;
  canManage: boolean;
  ownerCount: number;
  adminCount: number;
}) {
  const isSoleOwner = member.role === "owner" && ownerCount <= 1;
  const isSoleAdmin =
    (member.role === "owner" || member.role === "admin") && adminCount <= 1;
  const canRemove =
    canManage && !isSoleOwner && !(isCurrentUser && isSoleAdmin);

  return (
    <li className="border-b border-[var(--rule)] py-5 px-2 flex items-center gap-6 hover:bg-cream/40 transition-colors">
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
  // If the viewer can't manage, or the row is the sole owner, just show
  // the badge — no editable control.
  if (!canManage || isSoleOwner || member.role === "owner") {
    return <RoleBadge role={member.role} />;
  }

  // Allow toggling between admin and recruiter (owner is set-once via
  // the unique partial index on dso_users).
  return <RoleSelect dsoUserId={member.id} currentRole={member.role} />;
}

function RoleBadge({ role }: { role: string }) {
  const cls =
    role === "owner"
      ? "bg-ink text-ivory"
      : role === "admin"
        ? "bg-heritage text-ivory"
        : "bg-cream text-ink border border-[var(--rule-strong)]";
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-[10px] font-bold tracking-[1.5px] uppercase ${cls}`}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function InviteRowItem({ invitation }: { invitation: InviteRow }) {
  const expiresIn = daysUntil(invitation.expires_at);

  return (
    <li className="border-b border-[var(--rule)] py-4 px-2 flex items-center gap-6 hover:bg-cream/40 transition-colors">
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
