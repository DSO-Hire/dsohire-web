/**
 * /admin/dsos — list DSOs filtered by status, with one-click activate / revert.
 *
 * Default filter: pending (the verification queue). Each row shows:
 *   - DSO name + slug
 *   - Owner email + name
 *   - Sign-up date
 *   - Location count
 *   - Active job count
 *
 * Owner email comes from auth.users via service-role lookup. The page is
 * auth-gated by AdminShell (which checks admin_users membership) so the
 * service-role usage is safe.
 */

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { setDsoStatus } from "./actions";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DSOs · Admin",
  robots: { index: false, follow: false },
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "pending", label: "Pending verification" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "all", label: "All" },
];

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function AdminDsosPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const statusFilter = sp.status ?? "pending";

  const admin = createSupabaseServiceRoleClient();

  let query = admin
    .from("dsos")
    .select("id, name, slug, status, created_at")
    .order("created_at", { ascending: false });

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { data: rawDsos } = await query;

  type DsoRow = {
    id: string;
    name: string;
    slug: string;
    status: string;
    created_at: string;
  };
  const dsos = (rawDsos ?? []) as DsoRow[];

  // Pull the owner row + auth email + counts for each DSO in parallel.
  const enriched = await Promise.all(
    dsos.map(async (dso) => {
      const [
        { data: ownerRow },
        { count: locationCount },
        { count: activeJobCount },
      ] = await Promise.all([
        admin
          .from("dso_users")
          .select("auth_user_id, full_name, role")
          .eq("dso_id", dso.id)
          .eq("role", "owner")
          .maybeSingle(),
        admin
          .from("dso_locations")
          .select("*", { count: "exact", head: true })
          .eq("dso_id", dso.id),
        admin
          .from("jobs")
          .select("*", { count: "exact", head: true })
          .eq("dso_id", dso.id)
          .eq("status", "active")
          .is("deleted_at", null),
      ]);

      let ownerEmail: string | null = null;
      const ownerName =
        (ownerRow as { full_name: string | null } | null)?.full_name ?? null;
      const ownerAuthId =
        (ownerRow as { auth_user_id: string | null } | null)?.auth_user_id ??
        null;
      if (ownerAuthId) {
        try {
          const { data: authUser } = await admin.auth.admin.getUserById(
            ownerAuthId
          );
          ownerEmail = authUser?.user?.email ?? null;
        } catch {
          /* swallow */
        }
      }

      return {
        ...dso,
        ownerEmail,
        ownerName,
        locationCount: locationCount ?? 0,
        activeJobCount: activeJobCount ?? 0,
      };
    })
  );

  return (
    <AdminShell active="dsos">
      <Link
        href="/admin"
        className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Overview
      </Link>

      <header className="mb-8">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          DSO Verification
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink">
          DSOs
        </h1>
      </header>

      {/* Filter chips */}
      <div className="mb-7 flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((opt) => (
          <Link
            key={opt.value}
            href={
              opt.value === "pending"
                ? "/admin/dsos"
                : `/admin/dsos?status=${opt.value}`
            }
            className={`text-[10px] font-bold tracking-[1.5px] uppercase px-3.5 py-1.5 transition-colors ${
              statusFilter === opt.value
                ? "bg-ink text-ivory"
                : "bg-cream text-ink hover:bg-[var(--rule)]"
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      {enriched.length === 0 ? (
        <div className="border border-[var(--rule)] bg-white p-12 text-center max-w-[680px]">
          <p className="text-[15px] text-ink leading-relaxed mb-2">
            No DSOs match this filter.
          </p>
          <p className="text-[14px] text-slate-body leading-relaxed">
            Once a DSO signs up, they&apos;ll show up under{" "}
            <span className="font-semibold">Pending verification</span>.
          </p>
        </div>
      ) : (
        <div className="border border-[var(--rule)] bg-white">
          {enriched.map((dso) => (
            <div
              key={dso.id}
              className="p-6 border-b border-[var(--rule)] last:border-0 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-[18px] font-bold text-ink truncate">
                    {dso.name}
                  </h2>
                  <span
                    className={`text-[9px] font-bold tracking-[1.5px] uppercase px-2.5 py-1 ${statusBadgeClass(dso.status)}`}
                  >
                    {dso.status}
                  </span>
                </div>

                <div className="text-[13px] text-slate-meta tracking-[0.3px] mb-3 font-mono">
                  /companies/{dso.slug}
                </div>

                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-[13px]">
                  <div>
                    <dt className="text-slate-meta font-bold tracking-[1px] uppercase text-[9px] mb-0.5">
                      Owner
                    </dt>
                    <dd className="text-ink truncate">
                      {dso.ownerName ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-meta font-bold tracking-[1px] uppercase text-[9px] mb-0.5">
                      Email
                    </dt>
                    <dd className="text-ink truncate">
                      {dso.ownerEmail ? (
                        <a
                          href={`mailto:${dso.ownerEmail}`}
                          className="text-heritage hover:text-heritage-deep"
                        >
                          {dso.ownerEmail}
                        </a>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-meta font-bold tracking-[1px] uppercase text-[9px] mb-0.5">
                      Locations
                    </dt>
                    <dd className="text-ink">{dso.locationCount}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-meta font-bold tracking-[1px] uppercase text-[9px] mb-0.5">
                      Active jobs
                    </dt>
                    <dd className="text-ink">{dso.activeJobCount}</dd>
                  </div>
                </dl>

                <div className="mt-3 text-[12px] text-slate-meta">
                  Signed up {new Date(dso.created_at).toLocaleString()}
                </div>
              </div>

              <div className="flex flex-col items-stretch lg:items-end gap-2">
                <Link
                  href={`/companies/${dso.slug}`}
                  target="_blank"
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-[var(--rule-strong)] text-ink text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-cream transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Public page
                </Link>

                {dso.status === "pending" && (
                  <form action={activateDsoAction}>
                    <input type="hidden" name="dso_id" value={dso.id} />
                    <input type="hidden" name="new_status" value="active" />
                    <button
                      type="submit"
                      className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-ink text-ivory text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors"
                    >
                      Activate
                    </button>
                  </form>
                )}

                {dso.status === "active" && (
                  <>
                    <form action={activateDsoAction}>
                      <input type="hidden" name="dso_id" value={dso.id} />
                      <input type="hidden" name="new_status" value="pending" />
                      <button
                        type="submit"
                        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-[var(--rule-strong)] text-ink text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-cream transition-colors"
                      >
                        Revert to Pending
                      </button>
                    </form>
                    <form action={activateDsoAction}>
                      <input type="hidden" name="dso_id" value={dso.id} />
                      <input
                        type="hidden"
                        name="new_status"
                        value="suspended"
                      />
                      <button
                        type="submit"
                        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-red-300 text-red-700 text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-red-50 transition-colors"
                      >
                        Suspend
                      </button>
                    </form>
                  </>
                )}

                {dso.status === "suspended" && (
                  <form action={activateDsoAction}>
                    <input type="hidden" name="dso_id" value={dso.id} />
                    <input type="hidden" name="new_status" value="active" />
                    <button
                      type="submit"
                      className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-ink text-ivory text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors"
                    >
                      Reactivate
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}

async function activateDsoAction(formData: FormData) {
  "use server";
  await setDsoStatus({ ok: false }, formData);
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-900";
    case "pending":
      return "bg-amber-50 text-amber-900";
    case "suspended":
      return "bg-red-50 text-red-900";
    default:
      return "bg-slate-100 text-slate-700";
  }
}
