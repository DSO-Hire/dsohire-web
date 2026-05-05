/**
 * EmployerShell — auth-gated layout for /employer/dashboard, jobs, applications,
 * billing, settings, etc.
 *
 * Sidebar nav + top header. Server-side auth check redirects to sign-in if no
 * session. The actual page content is passed as children.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  MapPin,
  CreditCard,
  Settings,
  LogOut,
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BrandLockup } from "@/components/marketing/site-shell";

interface EmployerShellProps {
  children: React.ReactNode;
  /** Override which sidebar item shows as active. */
  active?: NavId;
}

type NavId =
  | "dashboard"
  | "jobs"
  | "applications"
  | "locations"
  | "team"
  | "billing"
  | "settings";

interface NavItem {
  id: NavId;
  label: string;
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** Roles that can see this item. Default: visible to all roles. */
  roles?: ReadonlyArray<"owner" | "admin" | "recruiter" | "hiring_manager">;
}

const NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/employer/dashboard", Icon: LayoutDashboard },
  { id: "jobs", label: "Jobs", href: "/employer/jobs", Icon: Briefcase },
  { id: "applications", label: "Applications", href: "/employer/applications", Icon: Users },
  // Admin-surface items — hidden from hiring managers and recruiters where appropriate.
  { id: "locations", label: "Locations", href: "/employer/locations", Icon: MapPin, roles: ["owner", "admin"] },
  { id: "team", label: "Team", href: "/employer/team", Icon: Users, roles: ["owner", "admin"] },
  { id: "billing", label: "Billing", href: "/employer/billing", Icon: CreditCard, roles: ["owner", "admin"] },
  { id: "settings", label: "Settings", href: "/employer/settings", Icon: Settings },
];

export async function EmployerShell({ children, active }: EmployerShellProps) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/employer/sign-in");
  }

  // Look up the user's DSO + role for the sidebar context.
  // Using two queries (instead of a Supabase join shorthand) for cleaner
  // TypeScript inference against our hand-written Database type.
  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, role, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!dsoUser) {
    // User is signed in but has no DSO record yet — send to onboarding.
    redirect("/employer/onboarding");
  }

  const { data: dso } = await supabase
    .from("dsos")
    .select("id, name, slug, status")
    .eq("id", dsoUser.dso_id)
    .maybeSingle();

  return (
    <div className="min-h-screen flex bg-ivory">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-[240px] flex-shrink-0 flex-col bg-ink text-ivory border-r border-white/10">
        <div className="p-6 border-b border-white/10">
          <Link href="/employer/dashboard" className="block" aria-label="DSO Hire — dashboard">
            <BrandLockup dark height={36} />
          </Link>
        </div>

        <nav className="flex-1 p-3">
          <ul className="list-none space-y-0.5">
            {NAV.filter(
              (item) =>
                !item.roles ||
                item.roles.includes(
                  dsoUser.role as
                    | "owner"
                    | "admin"
                    | "recruiter"
                    | "hiring_manager"
                )
            ).map((item) => {
              const isActive = active === item.id;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 text-[13px] font-semibold tracking-[0.5px] transition-colors ${
                      isActive
                        ? "bg-white/10 text-ivory"
                        : "text-ivory/65 hover:bg-white/5 hover:text-ivory"
                    }`}
                  >
                    <item.Icon className="h-4 w-4 flex-shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="text-[9px] font-bold tracking-[2px] uppercase text-heritage mb-1.5">
            DSO
          </div>
          <div className="text-[14px] font-semibold text-ivory truncate mb-0.5">
            {dso?.name ?? "Pending"}
          </div>
          <div className="text-[10px] text-ivory/50 tracking-[0.3px] uppercase">
            {dsoUser.role} · {dso?.status ?? "pending"}
          </div>

          <form action="/employer/sign-out" method="post" className="mt-4">
            <button
              type="submit"
              className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.5px] text-ivory/55 hover:text-ivory transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </form>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header className="lg:hidden h-[64px] px-5 flex items-center justify-between border-b border-[var(--rule)] bg-ivory/90 backdrop-blur-md">
          <Link href="/employer/dashboard">
            <BrandLockup height={28} />
          </Link>
          <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-body">
            {dso?.name ?? "DSO"}
          </span>
        </header>

        <main className="flex-1 px-6 sm:px-10 py-10">{children}</main>
      </div>
    </div>
  );
}
