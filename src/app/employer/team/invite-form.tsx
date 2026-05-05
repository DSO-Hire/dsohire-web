"use client";

/**
 * Inline invite form on /employer/team.
 *
 * Wraps the inviteTeammate server action with useActionState so we can
 * surface inline error / success messages without a full page reload.
 *
 * Hiring-manager support (Phase 3a, 2026-05-05): when the role select
 * is set to "hiring_manager", a checkbox grid of DSO locations appears.
 * The form requires at least one checked location for hiring_manager
 * invites; the server action also validates and rejects empty lists.
 */

import { useActionState, useState } from "react";
import { Mail, Send, MapPin } from "lucide-react";
import { inviteTeammate, type TeamActionState } from "./actions";
import type { LocationRow } from "./page";

const initialState: TeamActionState = { ok: false };

export function InviteForm({ locations }: { locations: LocationRow[] }) {
  const [state, action, pending] = useActionState(inviteTeammate, initialState);
  const [role, setRole] = useState<"recruiter" | "admin" | "hiring_manager">(
    "recruiter"
  );

  return (
    <form action={action} className="space-y-4 max-w-[820px]">
      <div className="grid grid-cols-1 sm:grid-cols-[1.6fr_auto_auto] gap-3">
        <div>
          <label
            htmlFor="invite-email"
            className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
          >
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-meta pointer-events-none" />
            <input
              id="invite-email"
              type="email"
              name="email"
              required
              placeholder="teammate@yourpractice.com"
              className="w-full pl-10 pr-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="invite-role"
            className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
          >
            Role
          </label>
          <select
            id="invite-role"
            name="role"
            value={role}
            onChange={(e) =>
              setRole(
                e.currentTarget.value as
                  | "recruiter"
                  | "admin"
                  | "hiring_manager"
              )
            }
            className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
          >
            <option value="recruiter">Recruiter</option>
            <option value="admin">Admin</option>
            <option value="hiring_manager">Hiring Manager</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 px-7 py-3 bg-ink text-ivory text-[11px] font-bold tracking-[1.8px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed h-[48px] whitespace-nowrap"
          >
            {pending ? "Sending…" : "Send Invite"}
            {!pending && <Send className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Location multi-select — only when role = hiring_manager */}
      {role === "hiring_manager" && (
        <div className="bg-cream/60 border border-[var(--rule-strong)] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-heritage-deep" />
            <label className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep">
              Locations this hiring manager can access
            </label>
          </div>
          {locations.length === 0 ? (
            <p className="text-[12px] text-slate-meta">
              You don&apos;t have any locations yet. Add locations on{" "}
              <a
                href="/employer/locations"
                className="text-heritage-deep underline"
              >
                /employer/locations
              </a>{" "}
              before inviting a hiring manager.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-slate-meta leading-relaxed">
                The hiring manager will see jobs and applications tied to
                these locations only. Pick at least one.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {locations.map((loc) => (
                  <label
                    key={loc.id}
                    className="flex items-start gap-2 p-2 bg-white border border-[var(--rule)] hover:border-heritage cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      name="location_ids"
                      value={loc.id}
                      className="mt-0.5 h-4 w-4 accent-heritage cursor-pointer"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-semibold text-ink truncate">
                        {loc.name}
                      </span>
                      {(loc.city || loc.state) && (
                        <span className="block text-[11px] text-slate-meta truncate">
                          {[loc.city, loc.state].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {state.error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-3">
          <p className="text-[13px] text-red-900">{state.error}</p>
        </div>
      )}
      {state.ok && state.message && (
        <div className="bg-cream border-l-4 border-heritage p-3">
          <p className="text-[13px] text-ink font-semibold">{state.message}</p>
        </div>
      )}

      <p className="text-[11px] text-slate-meta leading-relaxed">
        <strong className="text-ink font-semibold">Recruiter</strong> — post
        and edit jobs, manage applications across the DSO.{" "}
        <strong className="text-ink font-semibold">Admin</strong> — everything
        recruiters can do, plus invite teammates and manage locations.{" "}
        <strong className="text-ink font-semibold">Hiring Manager</strong> —
        view and manage applications at specific locations only; can&apos;t
        post new jobs or run bulk actions.
      </p>
    </form>
  );
}
