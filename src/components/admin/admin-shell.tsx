/**
 * AdminShell — auth-gated layout for /admin/*
 *
 * Gates on the `admin_users` table — only Cam (and any future support staff)
 * sees these pages. Anyone else gets redirected to /employer/sign-in.
 *
 * Uses the service-role client for admin-side data because RLS scopes most
 * tables to DSO members only. The auth gate at the top enforces the actual
 * access boundary — once we've confirmed the signed-in user is in
 * admin_users, the service-role queries are safe.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, Building2, LogOut } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BrandLockup } from "@/components/marketing/site-shell";

interface AdminShellProps {
  children: React.ReactNode;
  active?: AdminNavId;
}

type AdminNavId = "overview" | "dsos";

const NAV: Array<{
  id: AdminNavId;
  label: string;
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "overview", label: "Overview", href: "/admin", Icon: LayoutDashboard },
  { id: "dsos", label: "DSOs", href: "/admin/dsos", Icon: Building2 },
];

export async function AdminShell({ children, active }: AdminShellProps) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/employer/sign-in?next=/admin");
  }

  // Admin gate — must be in admin_users to see anything in /admin/*
  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("id, role, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!adminRow) {
    // Signed in but not an internal admin — bounce to the employer dashboard.
    // We don't render a 403 because exposing the existence of /admin to
    // non-admins is a soft information leak we can avoid.
    redirect("/employer/dashboard");
  }

  return (
    <div className="min-h-screen bg-cream flex">
      {/* Sidebar */}
      <aside className="w-[240px] bg-ink text-ivory flex flex-col">
        <div className="px-6 py-6 border-b border-ivory/10">
          <Link href="/admin" className="block" aria-label="Admin home">
            <BrandLockup dark height={32} />
          </Link>
          <div className="mt-3 text-[9px] font-bold tracking-[2.5px] uppercase text-heritage-light">
            Admin · {String(adminRow.role)}
          </div>
        </div>

        <nav className="flex-1 py-5">
          <ul className="list-none">
            {NAV.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-6 py-2.5 text-[13px] font-semibold transition-colors ${
                    active === item.id
                      ? "bg-ivory/10 text-ivory border-l-2 border-heritage"
                      : "text-ivory/70 hover:text-ivory hover:bg-ivory/5"
                  }`}
                >
                  <item.Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-6 border-t border-ivory/10">
          <div className="text-[11px] text-ivory/50 mb-2">
            Signed in as
          </div>
          <div className="text-[13px] text-ivory font-semibold mb-3 truncate">
            {adminRow.full_name ?? user.email}
          </div>
          <form action="/employer/sign-out" method="post">
            <button
              type="submit"
              className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[1.5px] uppercase text-ivory/60 hover:text-ivory transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-10 lg:p-14 overflow-y-auto">{children}</main>
    </div>
  );
}
