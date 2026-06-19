/**
 * Recruiter productivity table (E6.16, shipped 2026-05-29).
 *
 * Per-recruiter activity rollup on /employer/reports — who's actually
 * working the pipeline. Attribution comes from audit_events.actor_user_id
 * (see getRecruiterProductivity), so it counts real recruiter actions, not
 * candidate-side events. Renders only when there's attributed activity in
 * the window (parent decides; most valuable for multi-recruiter groups).
 *
 * Columns: recruiter · role · candidates moved · hires · last active.
 * Candidates-moved gets a heritage-tinted proportional bar so the ranking
 * reads at a glance, mirroring the cross-location table.
 */

import { Users } from "lucide-react";
import type { RecruiterProductivityRow } from "@/lib/analytics/metrics";

interface RecruiterProductivityTableProps {
  rows: RecruiterProductivityRow[];
  windowDays?: number;
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  recruiter: "Recruiter",
  hiring_manager: "Hiring manager",
  member: "Member",
};

function relativeDay(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

export function RecruiterProductivityTable({
  rows,
  windowDays = 30,
}: RecruiterProductivityTableProps) {
  if (rows.length === 0) return null;

  const maxMoved = Math.max(...rows.map((r) => r.candidates_moved), 1);

  return (
    <section className="border border-[var(--rule)] bg-card">
      <header className="px-6 pt-5 pb-3 border-b border-[var(--rule)] flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1">
            By recruiter
          </div>
          <div className="text-[12px] text-slate-meta">
            {rows.length} {rows.length === 1 ? "teammate" : "teammates"} active
            · last {windowDays} days
          </div>
        </div>
        <Users className="h-4 w-4 text-slate-meta shrink-0" aria-hidden />
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[10px] font-bold tracking-[2px] uppercase text-slate-meta border-b border-[var(--rule)]">
              <th className="px-6 py-3 font-bold">Recruiter</th>
              <th className="px-3 py-3 font-bold">Role</th>
              <th className="px-3 py-3 font-bold text-right">Candidates moved</th>
              <th className="px-3 py-3 font-bold text-right">Hires</th>
              <th className="px-6 py-3 font-bold text-right">Last active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const pct = Math.round((row.candidates_moved / maxMoved) * 100);
              return (
                <tr
                  key={row.user_id}
                  className={
                    i === rows.length - 1
                      ? ""
                      : "border-b border-[var(--rule)]"
                  }
                >
                  <td className="px-6 py-3 font-semibold text-ink whitespace-nowrap">
                    {row.name}
                  </td>
                  <td className="px-3 py-3 text-slate-body whitespace-nowrap">
                    {ROLE_LABEL[row.role] ?? row.role}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="hidden sm:block h-1.5 w-20 bg-cream rounded-sm overflow-hidden">
                        <div
                          className="h-full bg-heritage/60"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="tabular-nums font-bold text-ink w-8 text-right">
                        {row.candidates_moved}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-bold text-ink">
                    {row.hires_made}
                  </td>
                  <td className="px-6 py-3 text-right text-slate-meta whitespace-nowrap">
                    {relativeDay(row.last_active)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
