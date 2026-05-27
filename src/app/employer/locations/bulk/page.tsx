/**
 * /employer/locations/bulk — CSV/XLSX upload surface for Heartland-scale
 * DSOs that need to add 20+ locations at once.
 *
 * Server component: auth + role gate + DSO context, then hands off to
 * the client uploader. Owner + admin only — hiring_manager and
 * recruiter roles bounce back to /employer/locations.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Upload } from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BulkLocationsUploader } from "./bulk-locations-uploader";

export const metadata: Metadata = { title: "Bulk add locations · Locations" };
export const dynamic = "force-dynamic";

export default async function BulkLocationsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  const role = (dsoUser as { role: string }).role;
  if (role !== "owner" && role !== "admin") {
    redirect("/employer/locations");
  }

  return (
    <EmployerShell active="locations">
      <div className="space-y-8 max-w-[920px]">
        <Link
          href="/employer/locations"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-meta hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          All locations
        </Link>

        <header className="space-y-3">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep inline-flex items-center gap-2">
            <Upload className="size-3" />
            Bulk import
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.8px] text-ink leading-tight">
            Upload a spreadsheet of locations.
          </h1>
          <p className="text-sm text-slate-body leading-relaxed max-w-[640px]">
            Drop in a CSV or Excel file with one row per practice. Required
            columns: <code className="font-mono text-[12px] bg-cream/60 px-1 rounded">name</code>,{" "}
            <code className="font-mono text-[12px] bg-cream/60 px-1 rounded">city</code>,{" "}
            <code className="font-mono text-[12px] bg-cream/60 px-1 rounded">state</code>.
            Optional: street address, suite/unit, postal code. We&apos;ll
            geocode each row in the background.
          </p>
        </header>

        <BulkLocationsUploader />
      </div>
    </EmployerShell>
  );
}
