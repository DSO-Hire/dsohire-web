"use client";

/**
 * #83 Phase 4 — shared "Confidential search" controlled fields.
 *
 * Embedded in BOTH create wizards (practice job-wizard + corporate-wizard,
 * which build their FormData programmatically — the wizard owns the state,
 * this renders it) and reused by the edit-page card via the same props.
 *
 * Owners + admins always see confidential jobs; the multi-select only
 * lists recruiters / hiring managers (the roles the restriction bites).
 *
 * PURE client component — no server imports (hard rule).
 */

import { EyeOff } from "lucide-react";

export interface TeammateOption {
  id: string;
  name: string;
  role: string;
}

const ROLE_SHORT: Record<string, string> = {
  recruiter: "Recruiter",
  hiring_manager: "Hiring Manager",
};

export function ConfidentialSearchFields({
  teammates,
  confidential,
  onConfidentialChange,
  assigneeIds,
  onAssigneeIdsChange,
}: {
  teammates: TeammateOption[];
  confidential: boolean;
  onConfidentialChange: (v: boolean) => void;
  assigneeIds: string[];
  onAssigneeIdsChange: (ids: string[]) => void;
}) {
  const assignable = teammates.filter(
    (t) => t.role === "recruiter" || t.role === "hiring_manager"
  );

  const toggleAssignee = (id: string) => {
    onAssigneeIdsChange(
      assigneeIds.includes(id)
        ? assigneeIds.filter((x) => x !== id)
        : [...assigneeIds, id]
    );
  };

  return (
    <div className="border border-[var(--rule-strong)] bg-card">
      <label className="flex items-start gap-3 p-4 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 accent-heritage flex-shrink-0"
          checked={confidential}
          onChange={(e) => onConfidentialChange(e.target.checked)}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <EyeOff className="h-3.5 w-3.5 text-heritage-deep" />
            <span className="text-[14px] font-semibold text-ink">
              Confidential search
            </span>
          </div>
          <p className="text-[12px] text-slate-meta leading-snug mt-1">
            Restrict this posting and its applicants to owners, admins, and
            the teammates you pick below — for quiet searches like replacing
            an executive. Candidates still see the public posting normally.
          </p>
        </div>
      </label>

      {confidential && (
        <div className="border-t border-[var(--rule)] px-4 py-3">
          <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep mb-2">
            Who&apos;s on this search?
          </div>
          <p className="text-[12px] text-slate-meta leading-snug mb-3">
            Owners and admins always have access. You&apos;re included
            automatically.
          </p>
          {assignable.length === 0 ? (
            <p className="text-[13px] text-slate-meta italic">
              No recruiters or hiring managers on your team yet — only
              owners and admins will see this job.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-px bg-[var(--rule)] border border-[var(--rule)]">
              {assignable.map((t) => {
                const checked = assigneeIds.includes(t.id);
                return (
                  <label
                    key={t.id}
                    className={`flex items-center gap-3 p-2.5 cursor-pointer transition-colors ${
                      checked ? "bg-cream" : "bg-card hover:bg-cream/60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-heritage flex-shrink-0"
                      checked={checked}
                      onChange={() => toggleAssignee(t.id)}
                    />
                    <span className="text-[13px] font-semibold text-ink">
                      {t.name}
                    </span>
                    <span className="text-[11px] text-slate-meta">
                      {ROLE_SHORT[t.role] ?? t.role}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
