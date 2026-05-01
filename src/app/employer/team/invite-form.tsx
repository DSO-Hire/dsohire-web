"use client";

/**
 * Inline invite form on /employer/team.
 *
 * Wraps the inviteTeammate server action with useActionState so we can
 * surface inline error / success messages without a full page reload.
 */

import { useActionState } from "react";
import { Mail, Send } from "lucide-react";
import { inviteTeammate, type TeamActionState } from "./actions";

const initialState: TeamActionState = { ok: false };

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteTeammate, initialState);

  return (
    <form action={action} className="space-y-4 max-w-[640px]">
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
            defaultValue="recruiter"
            className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
          >
            <option value="recruiter">Recruiter</option>
            <option value="admin">Admin</option>
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
        and edit jobs, manage applications.{" "}
        <strong className="text-ink font-semibold">Admin</strong> — everything
        recruiters can do, plus invite teammates and manage locations.
      </p>
    </form>
  );
}
