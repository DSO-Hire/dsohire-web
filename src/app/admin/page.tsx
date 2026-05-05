/**
 * /admin — internal admin overview.
 *
 * Today this is a thin landing card pointing at the DSO verification flow.
 * Will expand as more admin surfaces ship (waitlist, abuse reports, etc.).
 */

import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin · DSO Hire",
  robots: { index: false, follow: false },
};

export default async function AdminOverviewPage() {
  const admin = createSupabaseServiceRoleClient();

  // Just count pending DSOs so the dashboard card has a number on it.
  const { count: pendingCount } = await admin
    .from("dsos")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  const { count: activeCount } = await admin
    .from("dsos")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  return (
    <AdminShell active="overview">
      <header className="mb-10">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Internal Admin
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink">
          Overview
        </h1>
        <p className="mt-3 text-[14px] text-slate-body leading-relaxed max-w-[640px]">
          Tools for verifying DSOs, monitoring sign-ups, and handling
          abuse / compliance. Visible only to internal staff.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[var(--rule)] border border-[var(--rule)] max-w-[760px]">
        <Link
          href="/admin/dsos?status=pending"
          className="bg-white p-7 hover:bg-cream transition-colors group"
        >
          <Building2 className="h-5 w-5 text-heritage-deep mb-4" />
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
            Pending verification
          </div>
          <div className="text-4xl font-extrabold tracking-[-1px] text-ink mb-2 leading-none">
            {pendingCount ?? 0}
          </div>
          <div className="text-[13px] text-slate-body">
            DSOs awaiting your review
          </div>
          <div className="inline-flex items-center gap-1.5 mt-5 text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep group-hover:text-ink transition-colors">
            Review queue
            <ArrowRight className="h-3 w-3" />
          </div>
        </Link>

        <Link
          href="/admin/dsos?status=active"
          className="bg-white p-7 hover:bg-cream transition-colors group"
        >
          <Building2 className="h-5 w-5 text-heritage-deep mb-4" />
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
            Verified
          </div>
          <div className="text-4xl font-extrabold tracking-[-1px] text-ink mb-2 leading-none">
            {activeCount ?? 0}
          </div>
          <div className="text-[13px] text-slate-body">
            Active DSOs on the platform
          </div>
          <div className="inline-flex items-center gap-1.5 mt-5 text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep group-hover:text-ink transition-colors">
            Browse
            <ArrowRight className="h-3 w-3" />
          </div>
        </Link>
      </div>
    </AdminShell>
  );
}
