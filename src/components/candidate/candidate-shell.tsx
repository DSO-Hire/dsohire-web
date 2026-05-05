/**
 * CandidateShell — auth-gated layout for /candidate/dashboard, profile,
 * applications, settings.
 *
 * Sidebar nav + top header. Server-side auth check redirects to sign-in
 * if no session. Mirrors EmployerShell visually but with a leaner nav.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  LayoutDashboard,
  UserCircle,
  FileText,
  Settings,
  LogOut,
  Search,
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BrandLockup } from "@/components/marketing/site-shell";

interface CandidateShellProps {
  children: React.ReactNode;
  active?: NavId;
}

type NavId = "dashboard" | "profile" | "applications" | "browse" | "settings";

const NAV: Array<{
  id: NavId;
  label: string;
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "dashboard", label: "Dashboard", href: "/candidate/dashboard", Icon: LayoutDashboard },
  { id: "browse", label: "Browse Jobs", href: "/jobs", Icon: Search },
  { id: "applications", label: "My Applications", href: "/candidate/applications", Icon: FileText },
  { id: "profile", label: "Profile", href: "/candidate/profile", Icon: UserCircle },
  { id: "settings", label: "Settings", href: "/candidate/settings", Icon: Settings },
];

export async function CandidateShell({ children, active }: CandidateShellProps) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/candidate/sign-in");
  }

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, full_name, headline, current_title, is_searchable")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!candidate) {
    // Signed in but not a candidate — could be an employer who clicked the
    // wrong link. Bounce them to the candidate sign-up page; if they're an
    // employer they can navigate to /employer/dashboard instead.
    redirect("/candidate/sign-up");
  }

  return (
    <div className="min-h-screen flex bg-ivory">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-[240px] flex-shrink-0 flex-col bg-ink text-ivory border-r border-white/10">
        <div className="p-6 border-b border-white/10">
          <Link href="/candidate/dashboard" className="block" aria-label="DSO Hire — candidate dashboard">
            <BrandLockup dark height={36} />
          </Link>
        </div>

        <nav className="flex-1 p-3">
          <ul className="list-none space-y-0.5">
            {NAV.map((item) => {
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
            Candidate
          </div>
          <div className="text-[14px] font-semibold text-ivory truncate mb-0.5">
            {candidate.full_name ?? "Welcome"}
          </div>
          <div className="text-[10px] text-ivory/50 tracking-[0.3px] uppercase truncate">
            {candidate.current_title ?? candidate.headline ?? "Profile incomplete"}
          </div>

          <form action="/candidate/sign-out" method="post" className="mt-4">
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
        <header className="lg:hidden h-[64px] px-5 flex items-center justify-between border-b border-[var(--rule)] bg-ivory/90 backdrop-blur-md">
          <Link href="/candidate/dashboard">
            <BrandLockup height={28} />
          </Link>
          <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-body">
            Candidate
          </span>
        </header>

        <main className="flex-1 px-6 sm:px-10 py-10">{children}</main>
      </div>
    </div>
  );
}
