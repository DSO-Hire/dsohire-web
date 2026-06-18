/**
 * /candidate/profile/import — resume import wizard (Phase 4.1.c).
 *
 * Server component: gates on candidate auth, then mounts the client
 * `ResumeImportWizard` which handles the three-state flow (drop →
 * parsing → review).
 *
 * The actual save lands in `actions.ts` and writes to the candidate's
 * structured-profile tables. After save, the wizard redirects to
 * /candidate/profile?imported=1 so the editor renders pre-filled.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ResumeImportWizard } from "./import-wizard";

export const metadata: Metadata = {
  title: "Import resume",
  description:
    "Upload your resume and we'll fill in your DSO Hire profile automatically.",
};

export default async function CandidateProfileImportPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/sign-in?next=/candidate/profile/import");

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) redirect("/candidate/dashboard");

  return (
    <>
      <ResumeImportWizard />
    </>
  );
}
