"use server";

/**
 * Referral actions (gap N15). Status-tracking only — no bonus/payout.
 *   • submitTeammateReferral — signed-in teammate refers someone.
 *   • updateReferralStatus   — advance a referral (submitted→…→hired/closed).
 *   • submitLinkReferral     — public submission via /refer/<code> (service-role,
 *                              validated against the DSO's referral_code).
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { lookupDsoByReferralCode } from "./code";

type Result = { ok: true } | { ok: false; error: string };

const STATUSES = ["submitted", "contacted", "interviewing", "hired", "closed"];

function clip(v: string, max: number): string {
  return v.trim().slice(0, max);
}
function emailOk(v: string): boolean {
  return !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
}

export async function submitTeammateReferral(input: {
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  jobId: string;
  note: string;
}): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const { data: me } = await supabase
    .from("dso_users")
    .select("id, dso_id, first_name, last_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!me) return { ok: false, error: "Teammate record not found." };

  const candidateName = clip(input.candidateName, 120);
  if (!candidateName) return { ok: false, error: "Add the person's name." };
  const candidateEmail = clip(input.candidateEmail, 160);
  if (!emailOk(candidateEmail)) return { ok: false, error: "Check the email." };

  const referrerName =
    [me.first_name, me.last_name].filter(Boolean).join(" ").trim() || null;

  const { error } = await supabase.from("referrals").insert({
    dso_id: me.dso_id as string,
    source: "teammate",
    referred_by_dso_user_id: me.id as string,
    referrer_name: referrerName,
    candidate_name: candidateName,
    candidate_email: candidateEmail || null,
    candidate_phone: clip(input.candidatePhone, 40) || null,
    job_id: input.jobId || null,
    note: clip(input.note, 600) || null,
    status: "submitted",
  });
  if (error) {
    console.error("[referrals] submitTeammateReferral", error);
    return { ok: false, error: "Couldn't save the referral." };
  }
  revalidatePath("/employer/referrals");
  return { ok: true };
}

export async function updateReferralStatus(
  id: string,
  status: string
): Promise<Result> {
  if (!STATUSES.includes(status)) {
    return { ok: false, error: "Unknown status." };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  // RLS scopes the update to the caller's DSO; pass the explicit row id.
  const { error } = await supabase
    .from("referrals")
    .update({ status })
    .eq("id", id);
  if (error) {
    console.error("[referrals] updateReferralStatus", error);
    return { ok: false, error: "Couldn't update the referral." };
  }
  revalidatePath("/employer/referrals");
  return { ok: true };
}

export async function submitLinkReferral(
  code: string,
  input: {
    referrerName: string;
    referrerEmail: string;
    candidateName: string;
    candidateEmail: string;
    candidatePhone: string;
    jobId: string;
    note: string;
  }
): Promise<Result> {
  const dso = await lookupDsoByReferralCode(code);
  if (!dso) return { ok: false, error: "This referral link isn't valid." };

  const candidateName = clip(input.candidateName, 120);
  if (!candidateName) return { ok: false, error: "Add the person's name." };
  const referrerName = clip(input.referrerName, 120);
  if (!referrerName) return { ok: false, error: "Add your name." };
  const candidateEmail = clip(input.candidateEmail, 160);
  const referrerEmail = clip(input.referrerEmail, 160);
  if (!emailOk(candidateEmail) || !emailOk(referrerEmail)) {
    return { ok: false, error: "Check the email addresses." };
  }

  // Validate the optional job belongs to this DSO.
  const jobId =
    input.jobId && dso.jobs.some((j) => j.id === input.jobId)
      ? input.jobId
      : null;

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from("referrals").insert({
    dso_id: dso.dsoId,
    source: "link",
    referrer_name: referrerName,
    referrer_email: referrerEmail || null,
    candidate_name: candidateName,
    candidate_email: candidateEmail || null,
    candidate_phone: clip(input.candidatePhone, 40) || null,
    job_id: jobId,
    note: clip(input.note, 600) || null,
    status: "submitted",
  });
  if (error) {
    console.error("[referrals] submitLinkReferral", error);
    return { ok: false, error: "Couldn't submit the referral." };
  }
  return { ok: true };
}
