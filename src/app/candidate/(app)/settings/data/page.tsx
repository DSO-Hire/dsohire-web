/**
 * /candidate/settings/data — Phase 4.3.f Data & Account tab.
 *
 * Server component fetches the candidate's email + display name so the
 * client form can render personalized confirmation copy in the delete
 * flow ("Hi Cameron, you're about to..."). All actual data operations
 * live in the client form's server-action calls.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DataForm } from "./data-form";

export const metadata: Metadata = { title: "Data & account · Settings" };

export default async function CandidateDataPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/sign-in?next=/candidate/settings/data");

  const { data: candidate } = await supabase
    .from("candidates")
    .select("full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return (
    <div>
      <header className="mb-6">
        <h2 className="font-display text-xl font-bold text-foreground">
          Your data, your call
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Download a copy, manage your applications, or delete your
          account. We make all of it cheap to do.
        </p>
      </header>
      <DataForm
        candidateName={(candidate?.full_name as string | null) ?? null}
      />
    </div>
  );
}
