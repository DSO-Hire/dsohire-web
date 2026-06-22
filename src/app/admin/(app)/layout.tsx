/**
 * Admin app layout — the Tier-1 gate + persistent sticky shell for every
 * /admin/* surface. `(app)` is a route GROUP, so URLs are unchanged
 * (/admin, /admin/dsos, /admin/analytics, …).
 *
 * The gate (admin_users membership) used to live per-page inside AdminShell;
 * it moved up here so it runs once and the sidebar persists across navigation
 * (no remount) — and, crucially, so the rail can be pinned to the viewport.
 * Redirects are byte-identical to the old shell.
 *
 * STICKY FIX: the old AdminShell rendered <aside> as a flex sibling whose
 * height grew with the page, so the "Sign out" footer scrolled away on long
 * pages (e.g. Vantage). Here the aside is `sticky top-0 h-screen flex-col`;
 * the nav region scrolls internally (`flex-1 overflow-y-auto`) and the footer
 * is pinned (`shrink-0`).
 *
 * Tier-2 (founder-only) nav items are filtered in AdminNav via the `founder`
 * flag (email allowlist) computed here. `support`-role staff never see them.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSuperadminEmail } from "@/lib/admin/gate";
import { AdminNav } from "@/components/admin/admin-nav";
import { BrandLockup } from "@/components/marketing/site-shell";

export default async function AdminAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/employer/sign-in?next=/admin");
  }

  // Tier-1 gate — must be in admin_users to see anything in /admin/*.
  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("id, role, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!adminRow) {
    // Signed in but not internal staff — bounce to the employer dashboard.
    // (We don't 403 — not advertising /admin's existence to non-admins.)
    redirect("/employer/dashboard");
  }

  const founder = isSuperadminEmail(user.email);

  return (
    <div className="min-h-screen bg-cream flex">
      {/* Sidebar — pinned to the viewport so the footer never scrolls away. */}
      <aside className="w-[240px] bg-hero text-hero-foreground flex flex-col sticky top-0 h-screen">
        <div className="px-6 py-6 border-b border-hero-foreground/10 shrink-0">
          <Link href="/admin" className="block" aria-label="Admin home">
            <BrandLockup dark height={32} />
          </Link>
          <div className="mt-3 text-[9px] font-bold tracking-[2.5px] uppercase text-heritage-light">
            Admin · {String(adminRow.role)}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-5">
          <AdminNav founder={founder} />
        </nav>

        <div className="p-6 border-t border-hero-foreground/10 shrink-0">
          <div className="text-[12px] text-hero-foreground/50 mb-2">
            Signed in as
          </div>
          <div className="text-[14px] text-hero-foreground font-semibold mb-3 truncate">
            {adminRow.full_name ?? user.email}
          </div>
          <form action="/employer/sign-out" method="post">
            <button
              type="submit"
              className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[1.5px] uppercase text-hero-foreground/60 hover:text-hero-foreground transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </form>
        </div>
      </aside>

      {/* Main — its own scroll context. */}
      <main className="flex-1 p-10 lg:p-14 overflow-y-auto">{children}</main>
    </div>
  );
}
