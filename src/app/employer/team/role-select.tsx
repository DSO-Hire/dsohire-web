"use client";

/**
 * RoleSelect — auto-submitting dropdown for changing a teammate's role.
 *
 * Lives as its own client component so the surrounding page can stay a
 * server component. Submits the changeTeammateRole server action via
 * form requestSubmit() when the user picks a new value.
 */

import { changeTeammateRole } from "./actions";

interface RoleSelectProps {
  dsoUserId: string;
  currentRole: string;
}

export function RoleSelect({ dsoUserId, currentRole }: RoleSelectProps) {
  return (
    <form action={changeTeammateRole} className="flex items-center">
      <input type="hidden" name="dso_user_id" value={dsoUserId} />
      <select
        name="new_role"
        defaultValue={currentRole}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[13px] font-semibold tracking-[0.5px] uppercase focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors cursor-pointer"
      >
        <option value="admin">Admin</option>
        <option value="recruiter">Recruiter</option>
      </select>
    </form>
  );
}
