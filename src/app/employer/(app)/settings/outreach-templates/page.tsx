/**
 * /employer/settings/outreach-templates — manage outreach template library.
 *
 * List of saved templates with create/edit/delete inline. Wrapped by
 * the settings layout (auth + shell handled upstream). Recruiter+
 * write access enforced by RLS.
 */

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TemplatesManager } from "./templates-manager";

export const metadata: Metadata = { title: "Outreach templates · Settings" };
export const dynamic = "force-dynamic";

export default async function OutreachTemplatesPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: templates } = await supabase
    .from("dso_outreach_templates")
    .select("id, name, subject, body, last_used_at, usage_count, created_at")
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("name", { ascending: true });

  const rows = (templates ?? []) as Array<{
    id: string;
    name: string;
    subject: string;
    body: string;
    last_used_at: string | null;
    usage_count: number;
    created_at: string;
  }>;

  return (
    <div className="max-w-[820px]">
      <header className="mb-6">
        <h2 className="text-2xl font-extrabold tracking-[-0.6px] text-ink mb-2">
          Outreach templates
        </h2>
        <p className="text-[14px] text-slate-body leading-relaxed">
          Save outreach messages you send often. Templates fill the
          modal&apos;s subject + body when you pick one. Merge fields
          like{" "}
          <code className="text-[12px] bg-cream px-1 py-0.5 rounded">
            {"{{candidate.first_name}}"}
          </code>{" "}
          get resolved server-side at send time.
        </p>
      </header>
      <TemplatesManager initialTemplates={rows} />
    </div>
  );
}
