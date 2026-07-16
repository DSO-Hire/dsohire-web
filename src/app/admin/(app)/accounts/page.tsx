/**
 * /admin/accounts — the master roster: every account on the platform, newest
 * first, tagged candidate / employer / admin / no-profile. Answers "who's
 * popping on?" without needing a search query. Tier-1 read surface (the (app)
 * layout gates admin_users); same firewall as search: EEO never surfaced.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { loadAccountRoster, type AccountKind } from "@/lib/admin/accounts";

export const metadata: Metadata = {
  title: "Accounts · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<AccountKind, string> = {
  candidate: "Candidate",
  employer: "Employer",
  admin: "Admin",
  no_profile: "No profile",
};

const KIND_CLASSES: Record<AccountKind, string> = {
  candidate: "bg-heritage/10 text-heritage-deep",
  employer: "bg-ink/10 text-ink",
  admin: "bg-danger-bg text-danger",
  no_profile: "bg-cream text-slate-meta border border-[var(--rule)]",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function AdminAccountsPage() {
  const { rows, counts } = await loadAccountRoster();

  return (
    <div className="p-8 space-y-6">
      <header>
        <div className="text-2xs font-bold tracking-[2.5px] uppercase text-slate-meta mb-1">
          Master Roster
        </div>
        <h1 className="text-2xl font-bold text-ink">Every account</h1>
        <p className="text-sm text-slate-body mt-1">
          {counts.candidates} candidates · {counts.employers} employer seats ·{" "}
          {counts.admins} admins
          {counts.noProfile > 0 && (
            <> · {counts.noProfile} signed up without finishing a profile</>
          )}
          . Newest first. EEO answers are never shown here.
        </p>
      </header>

      <div className="overflow-x-auto border border-[var(--rule)] bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-2xs font-bold tracking-[1.5px] uppercase text-slate-meta border-b border-[var(--rule)]">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Detail</th>
              <th className="px-4 py-3">Signed up</th>
              <th className="px-4 py-3">Last sign-in</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.kind}-${r.id}`}
                className="border-b border-[var(--rule)] last:border-b-0 hover:bg-cream/60 transition-colors"
              >
                <td className="px-4 py-3 font-semibold text-ink whitespace-nowrap">
                  {r.name}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2 py-0.5 text-2xs font-bold tracking-[1px] uppercase ${KIND_CLASSES[r.kind]}`}
                  >
                    {KIND_LABEL[r.kind]}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-body">{r.email}</td>
                <td className="px-4 py-3 text-slate-body">{r.detail}</td>
                <td className="px-4 py-3 text-slate-body whitespace-nowrap">
                  {fmtDate(r.createdAt)}
                </td>
                <td className="px-4 py-3 text-slate-body whitespace-nowrap">
                  {fmtDate(r.lastSignInAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.href && (
                    <Link
                      href={r.href}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-heritage hover:text-heritage-deep"
                    >
                      Open <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-meta">
                  No accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
