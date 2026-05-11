"use server";

/**
 * Account tab server actions (Phase 4.3.a — OTP-first rebuild).
 *
 * Replaces the v1 magic-link email-change flow with our locked OTP-first
 * pattern (matches existing OTP auth model — see Cam's lock 2026-05-07).
 *
 * Five actions:
 *   • requestEmailChange   — generate 6-digit OTP, store hashed,
 *                            email NEW (with code) + OLD (with revoke link)
 *   • verifyEmailChangeOtp — verify code, swap auth.users.email via
 *                            service-role admin client, mark consumed
 *   • cancelEmailChange    — candidate-initiated cancel of pending change
 *   • updatePhone          — phone number capture for future SMS opt-in
 *   • (language stub stays UI-only)
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import {
  generateEmailChangeOtp,
  hashEmailChangeOtp,
  signRevokeToken,
  EMAIL_CHANGE_OTP_TTL_MIN,
} from "@/lib/auth/email-change";

type Result<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_MAX_LEN = 24;

/* ──────────────────────────────────────────────────────────────
 * Helpers
 * ─────────────────────────────────────────────────────────── */

async function getAuthedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Please sign in." };
  return { ok: true as const, supabase, user };
}

async function siteOrigin(): Promise<string> {
  // Use Vercel headers when available; fall back to the env var.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host");
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.dsohire.com";
}

/* ──────────────────────────────────────────────────────────────
 * 1. Request email change — generate OTP + send both emails
 * ─────────────────────────────────────────────────────────── */

export async function requestEmailChange(
  newEmail: string
): Promise<Result<{ requestId: string }>> {
  const trimmed = newEmail.trim().toLowerCase();
  if (!trimmed) return { ok: false, error: "Enter a new email address." };
  if (!EMAIL_RE.test(trimmed)) {
    return { ok: false, error: "That doesn't look like a valid email." };
  }

  const ctx = await getAuthedUser();
  if (!ctx.ok) return ctx;

  const currentEmail = ctx.user.email?.toLowerCase() ?? "";
  if (currentEmail === trimmed) {
    return { ok: false, error: "That's already your email address." };
  }

  // Generate the OTP + persist a hashed version. Plaintext is sent to
  // the new email and never stored.
  const code = generateEmailChangeOtp();
  const codeHash = hashEmailChangeOtp(code);
  const expiresAt = new Date(
    Date.now() + EMAIL_CHANGE_OTP_TTL_MIN * 60 * 1000
  ).toISOString();

  const { data: pending, error: insertError } = await ctx.supabase
    .from("pending_email_changes")
    .insert({
      candidate_user_id: ctx.user.id,
      new_email: trimmed,
      otp_code_hash: codeHash,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (insertError || !pending) {
    console.error("[settings/account] requestEmailChange insert", insertError);
    return {
      ok: false,
      error: "Couldn't start the email change. Try again in a moment.",
    };
  }

  const requestId = pending.id as string;

  // Email NEW — contains the OTP. Plaintext format on purpose: keeps
  // the code copy/paste-friendly across all clients.
  const newEmailSend = await sendEmail({
    to: trimmed,
    subject: "Your DSO Hire email change code",
    template: "candidate.email_change_otp",
    text: `Your DSO Hire email change code is ${code}.\n\nEnter this 6-digit code on the Settings page to finalize moving your account to ${trimmed}.\n\nThe code expires in ${EMAIL_CHANGE_OTP_TTL_MIN} minutes. If you didn't request this, ignore this email — your account stays untouched.`,
    html: `<p>Your DSO Hire email change code is <strong style="font-size: 22px; letter-spacing: 4px;">${code}</strong>.</p>
<p>Enter this 6-digit code on the Settings page to finalize moving your account to <strong>${trimmed}</strong>.</p>
<p style="color: #64748b; font-size: 13px;">The code expires in ${EMAIL_CHANGE_OTP_TTL_MIN} minutes. If you didn't request this, ignore this email — your account stays untouched.</p>`,
  });

  if (!newEmailSend.ok) {
    // Roll back the pending row so the candidate isn't left with a
    // ghost change request they can never verify.
    await ctx.supabase
      .from("pending_email_changes")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("candidate_user_id", ctx.user.id);
    return {
      ok: false,
      error:
        "Couldn't email the verification code. Double-check the address and try again.",
    };
  }

  // Email OLD — heads-up + revoke link. Don't block the success path
  // on this; the revoke is a courtesy and the OTP path is the source
  // of truth.
  if (currentEmail) {
    const origin = await siteOrigin();
    const revokeSig = signRevokeToken(requestId);
    const revokeUrl = `${origin}/auth/email-change/revoke?id=${requestId}&sig=${revokeSig}`;
    const oldSend = await sendEmail({
      to: currentEmail,
      subject: "Heads up: an email change was requested on your DSO Hire account",
      template: "candidate.email_change_notice",
      text: `Someone — most likely you — just requested moving the email on your DSO Hire account from ${currentEmail} to ${trimmed}.\n\nIf this was you, ignore this email; the change finalizes after you enter the 6-digit code we sent to ${trimmed}.\n\nIf this wasn't you, click here to revoke the request:\n${revokeUrl}\n\nThe link works for ${EMAIL_CHANGE_OTP_TTL_MIN} minutes. After that, the request expires on its own.`,
      html: `<p>Someone — most likely you — just requested moving the email on your DSO Hire account from <strong>${currentEmail}</strong> to <strong>${trimmed}</strong>.</p>
<p>If this was you, ignore this email; the change finalizes after you enter the 6-digit code we sent to <strong>${trimmed}</strong>.</p>
<p>If this wasn't you, click below to revoke the request:</p>
<p><a href="${revokeUrl}" style="display: inline-block; background: #14233F; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">Revoke email change</a></p>
<p style="color: #64748b; font-size: 13px;">The link works for ${EMAIL_CHANGE_OTP_TTL_MIN} minutes. After that, the request expires on its own.</p>`,
    });

    if (oldSend.ok) {
      await ctx.supabase
        .from("pending_email_changes")
        .update({ old_email_notified_at: new Date().toISOString() })
        .eq("id", requestId)
        .eq("candidate_user_id", ctx.user.id);
    }
    // We swallow the !ok case — the OTP send already succeeded; revoking
    // via cancellation is still possible from the Settings UI.
  }

  revalidatePath("/candidate/settings/account");
  return { ok: true, requestId };
}

/* ──────────────────────────────────────────────────────────────
 * 2. Verify OTP — actually swap auth.users.email
 * ─────────────────────────────────────────────────────────── */

export async function verifyEmailChangeOtp(input: {
  requestId: string;
  code: string;
}): Promise<Result<{ newEmail: string }>> {
  const ctx = await getAuthedUser();
  if (!ctx.ok) return ctx;

  const trimmedCode = input.code.trim();
  if (!/^\d{6}$/.test(trimmedCode)) {
    return { ok: false, error: "Enter the 6-digit code from your email." };
  }

  const { data: row } = await ctx.supabase
    .from("pending_email_changes")
    .select(
      "id, candidate_user_id, new_email, otp_code_hash, expires_at, consumed_at, revoked_at"
    )
    .eq("id", input.requestId)
    .eq("candidate_user_id", ctx.user.id)
    .maybeSingle();

  if (!row) {
    return { ok: false, error: "We couldn't find that change request." };
  }

  const r = row as Record<string, unknown>;
  if (r.consumed_at) {
    return { ok: false, error: "That code was already used." };
  }
  if (r.revoked_at) {
    return {
      ok: false,
      error: "This change request was revoked. Start a new one.",
    };
  }
  if (new Date(r.expires_at as string).getTime() < Date.now()) {
    return { ok: false, error: "The code expired. Request a new one." };
  }

  const expectedHash = hashEmailChangeOtp(trimmedCode);
  if (expectedHash !== (r.otp_code_hash as string)) {
    return { ok: false, error: "That code doesn't match. Try again." };
  }

  const newEmail = r.new_email as string;

  // Update auth.users.email via the service-role admin client. We've
  // already verified our own OTP; calling auth.admin.updateUserById
  // with email_confirm:true bypasses Supabase's own email-confirmation
  // round trip (we're confirming via OTP instead).
  const admin = createSupabaseServiceRoleClient();
  const { error: adminError } = await admin.auth.admin.updateUserById(
    ctx.user.id,
    {
      email: newEmail,
      email_confirm: true,
    }
  );
  if (adminError) {
    console.error("[settings/account] verifyEmailChangeOtp admin", adminError);
    // Common case: another user already owns that email.
    return {
      ok: false,
      error:
        adminError.message?.toLowerCase().includes("already")
          ? "Someone else already has that email."
          : "Couldn't finalize the email change.",
    };
  }

  // Mark consumed AFTER the auth update succeeds so a partial failure
  // leaves the row replayable.
  await ctx.supabase
    .from("pending_email_changes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", input.requestId)
    .eq("candidate_user_id", ctx.user.id);

  revalidatePath("/candidate/settings/account");
  return { ok: true, newEmail };
}

/* ──────────────────────────────────────────────────────────────
 * 3. Cancel pending change (candidate-initiated)
 * ─────────────────────────────────────────────────────────── */

export async function cancelEmailChange(requestId: string): Promise<Result> {
  const ctx = await getAuthedUser();
  if (!ctx.ok) return ctx;

  const { error } = await ctx.supabase
    .from("pending_email_changes")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("candidate_user_id", ctx.user.id)
    .is("consumed_at", null);

  if (error) {
    console.error("[settings/account] cancelEmailChange", error);
    return { ok: false, error: "Couldn't cancel the pending change." };
  }
  revalidatePath("/candidate/settings/account");
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────
 * 4. Phone capture (unchanged from v1)
 * ─────────────────────────────────────────────────────────── */

export async function updatePhone(phone: string): Promise<Result> {
  const trimmed = phone.trim();
  if (trimmed.length > PHONE_MAX_LEN) {
    return { ok: false, error: "Phone number is too long." };
  }

  const ctx = await getAuthedUser();
  if (!ctx.ok) return ctx;

  const { error } = await ctx.supabase
    .from("candidates")
    .update({ phone: trimmed || null })
    .eq("auth_user_id", ctx.user.id);

  if (error) {
    console.error("[settings/account] updatePhone", error);
    return { ok: false, error: "Couldn't save your phone number." };
  }
  revalidatePath("/candidate/settings/account");
  revalidatePath("/candidate/profile");
  return { ok: true };
}
