/**
 * /employer/settings/offer-letters — DSO offer letter template library
 * (Phase 5A Track E).
 *
 * Server-side: fetch templates for the active DSO. The settings layout
 * upstream wraps us in the shell + nav, so we return inner content only.
 *
 * Active templates come first, archived collapsed under a disclosure.
 * RLS scopes the read by DSO (the "Offer letters: DSO read" policy).
 */

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OfferLetterEditor } from "./offer-letter-editor";

export const metadata: Metadata = { title: "Offer letters · Settings" };
export const dynamic = "force-dynamic";

export default async function OfferLettersSettingsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  // Active templates first (most-recent first), archived after. We do
  // the partition in JS rather than two queries so a single roundtrip
  // covers both lists for the disclosure.
  const { data: rawTemplates, error } = await supabase
    .from("dso_offer_letter_templates")
    .select(
      "id, name, body, is_archived, created_at, updated_at, created_by_user_id"
    )
    .eq("dso_id", dsoUser.dso_id as string)
    .order("updated_at", { ascending: false });
  if (error) {
    console.warn("[offer-letters] template fetch failed", error);
  }

  type TemplateRow = {
    id: string;
    name: string;
    body: string;
    is_archived: boolean;
    created_at: string;
    updated_at: string;
    created_by_user_id: string | null;
  };
  const templates = (rawTemplates ?? []) as TemplateRow[];

  const role = (dsoUser.role as string | null) ?? "recruiter";
  const canEdit = role === "owner" || role === "admin";

  return (
    <div className="max-w-[960px]">
      <header className="mb-6">
        <h2 className="text-2xl font-extrabold tracking-[-0.6px] text-ink mb-2">
          Offer letters
        </h2>
        <p className="text-[14px] text-slate-body leading-relaxed max-w-[680px]">
          Build a library of offer-letter templates your team can pick from
          when a candidate reaches the offer stage. Templates support merge
          fields like{" "}
          <code className="text-[12px] bg-cream px-1 py-0.5 rounded">
            {"{{candidate.full_name}}"}
          </code>{" "}
          and{" "}
          <code className="text-[12px] bg-cream px-1 py-0.5 rounded">
            {"{{offer.start_date}}"}
          </code>
          . Sender-filled fields (start date, compensation, etc.) are
          captured at send time so the same template handles every offer.
        </p>
      </header>

      {!canEdit && (
        <div className="mb-5 border border-warning bg-warning-bg px-4 py-3 text-[13px] text-warning">
          You can view and use these templates, but only DSO owners and
          admins can edit or archive them.
        </div>
      )}

      <OfferLetterEditor
        initialTemplates={templates}
        canEdit={canEdit}
      />
    </div>
  );
}
