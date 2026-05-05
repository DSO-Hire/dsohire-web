"use client";

/**
 * RoleHelp — collapsible explainer panel that walks DSO admins through
 * what each team role does and who would typically fill it.
 *
 * Lives next to the role select on the invite form. Clicking "What's
 * the difference?" expands an inline panel with concrete dental-DSO
 * examples for each role.
 *
 * Built as a controlled disclosure (not a tooltip / popover) because:
 *   - The content is too long for a tooltip
 *   - It's referenced often during initial team setup, less so later
 *   - Inline expansion plays well with screen readers
 */

import { useState } from "react";
import { Info, X, ArrowRight, Crown, Briefcase, Users, MapPin } from "lucide-react";

const ROLE_GUIDE: Array<{
  id: "owner" | "admin" | "recruiter" | "hiring_manager";
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  oneLiner: string;
  whoFitsThisRole: string;
  canDo: string[];
  cantDo: string[];
}> = [
  {
    id: "owner",
    Icon: Crown,
    label: "Owner",
    oneLiner: "The DSO's primary account holder. Set once at sign-up.",
    whoFitsThisRole:
      "The CEO, Managing Partner, or sole proprietor whose name is on the DSO Hire account. Owner can transfer ownership, but only one owner exists per DSO.",
    canDo: [
      "Everything Admin can do",
      "Transfer ownership to another teammate",
      "Cancel the DSO Hire subscription",
    ],
    cantDo: [],
  },
  {
    id: "admin",
    Icon: Briefcase,
    label: "Admin",
    oneLiner: "Full operational access. Trusted with the entire DSO.",
    whoFitsThisRole:
      "VP of HR, Director of Recruiting, Chief Operating Officer, Head of People — anyone who needs visibility across every practice and the authority to make hiring decisions DSO-wide.",
    canDo: [
      "Post and edit jobs at any location",
      "Review and manage applications across the DSO",
      "Run bulk actions (move, reject, archive)",
      "Invite, change role, or remove teammates",
      "Manage practice locations",
      "View billing (owner makes changes)",
    ],
    cantDo: ["Transfer ownership", "Cancel the subscription"],
  },
  {
    id: "recruiter",
    Icon: Users,
    label: "Recruiter",
    oneLiner: "Day-to-day hiring operator across the DSO.",
    whoFitsThisRole:
      "An in-house Talent Acquisition specialist, Staffing Manager, or external recruiter you've contracted to handle hiring across all your practices.",
    canDo: [
      "Post and edit jobs at any location",
      "Review and manage applications across the DSO",
      "Run bulk actions",
      "Comment, score, and message candidates",
    ],
    cantDo: [
      "Invite or remove teammates",
      "Manage practice locations",
      "Access billing",
    ],
  },
  {
    id: "hiring_manager",
    Icon: MapPin,
    label: "Hiring Manager",
    oneLiner:
      "Location-scoped reviewer. Sees only the practices you assign them to.",
    whoFitsThisRole:
      "A dentist who owns or runs a specific practice and reviews candidates for their location only. A regional manager covering 5–8 specific practices. A practice manager at one office who needs to weigh in on who gets hired without seeing the rest of the DSO. The dentist-owner of an affiliated location who retains clinical autonomy is the canonical fit.",
    canDo: [
      "Review applications at their assigned locations only",
      "Move candidates through interview stages",
      "Write and submit scorecards",
      "Comment and @mention teammates on candidates",
      "Send messages to candidates at their locations",
      "Use the AI rejection-reason suggester (Growth+)",
    ],
    cantDo: [
      "Post or edit jobs (admins/recruiters do this)",
      "Run bulk actions",
      "See applications at locations they're not assigned to",
      "Invite teammates",
      "Manage locations or billing",
    ],
  },
];

export function RoleHelp() {
  const [open, setOpen] = useState(false);

  return (
    <div className="max-w-[820px]">
      {/* Banner-style help affordance — clearly identifiable as
          "click here for guidance" rather than a small inline link. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group w-full flex items-center gap-4 text-left px-5 py-4 bg-cream border border-heritage/40 hover:border-heritage hover:bg-heritage-tint transition-colors"
        style={{ background: open ? "var(--heritage-tint)" : undefined }}
      >
        <span
          className="flex-shrink-0 h-9 w-9 rounded-full bg-heritage/15 flex items-center justify-center group-hover:bg-heritage/25 transition-colors"
          aria-hidden
        >
          <Info className="h-4 w-4 text-heritage-deep" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-extrabold tracking-[-0.1px] text-ink">
            Need help picking the right role?
          </span>
          <span className="block text-[12px] text-slate-body mt-0.5 leading-snug">
            Each role has different permissions and use cases. Hiring Manager is
            scoped to specific locations — useful for dentist-owners and
            regional managers.
          </span>
        </span>
        <span
          className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold tracking-[1.5px] uppercase border transition-colors ${
            open
              ? "bg-ink text-ivory border-ink"
              : "bg-white text-ink border-[var(--rule-strong)] group-hover:bg-ink group-hover:text-ivory group-hover:border-ink"
          }`}
        >
          {open ? "Hide guide" : "See role guide"}
          {!open && <ArrowRight className="h-3 w-3" />}
        </span>
      </button>

      {open && (
        <div className="mt-3 bg-cream/60 border border-[var(--rule-strong)] p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-[14px] font-extrabold tracking-[-0.3px] text-ink">
                Team roles, explained
              </h3>
              <p className="text-[12px] text-slate-meta mt-1 leading-relaxed">
                Pick the role that matches what this person will actually do
                day-to-day. Roles are easy to change later for non-hiring-manager
                teammates.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close role guide"
              className="p-1 text-slate-meta hover:text-ink transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-5">
            {ROLE_GUIDE.map((role) => (
              <RoleCard key={role.id} role={role} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RoleCard({
  role,
}: {
  role: (typeof ROLE_GUIDE)[number];
}) {
  return (
    <div className="bg-white border border-[var(--rule)] p-4">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-full bg-cream border border-[var(--rule-strong)] flex items-center justify-center flex-shrink-0 mt-0.5">
          <role.Icon className="h-4 w-4 text-heritage-deep" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[13px] font-extrabold tracking-[-0.2px] text-ink">
            {role.label}
          </h4>
          <p className="text-[12px] text-slate-meta italic mt-0.5 leading-snug">
            {role.oneLiner}
          </p>

          <p className="text-[12px] text-ink mt-2.5 leading-relaxed">
            <strong className="font-semibold">Who fits this role: </strong>
            {role.whoFitsThisRole}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div>
              <div className="text-[9px] font-bold tracking-[1.5px] uppercase text-heritage-deep mb-1.5">
                Can do
              </div>
              <ul className="list-none space-y-1">
                {role.canDo.map((item, i) => (
                  <li
                    key={i}
                    className="text-[11px] text-ink leading-snug flex items-start gap-1.5"
                  >
                    <span className="text-heritage-deep font-bold flex-shrink-0">
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            {role.cantDo.length > 0 && (
              <div>
                <div className="text-[9px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1.5">
                  Can&apos;t do
                </div>
                <ul className="list-none space-y-1">
                  {role.cantDo.map((item, i) => (
                    <li
                      key={i}
                      className="text-[11px] text-slate-body leading-snug flex items-start gap-1.5"
                    >
                      <span className="text-slate-meta flex-shrink-0">—</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
