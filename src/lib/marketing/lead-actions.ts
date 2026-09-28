"use server";

/**
 * captureLead: the single write path for every marketing lead.
 *
 * Order matters: INSERT first (durable), notify second (best effort). A
 * Resend hiccup, or GoDaddy dropping dsohire.com -> dsohire.com mail, can
 * delay or lose the ping but never the lead: the row is in /admin/leads
 * either way.
 *
 * Recipients: see ./notify (LEAD_NOTIFY_EMAILS, else the /contact inbox).
 *
 * "use server" rule (launch-day incident): this module exports ONLY async
 * functions. Types and constants live in ./leads.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { leadNotifyList } from "./notify";
import {
  classifyContact,
  sanitizeRecord,
  LEAD_KINDS,
  LEAD_KIND_LABELS,
  type LeadInput,
  type LeadResult,
} from "./leads";


function clip(v: string | undefined, max: number): string | null {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
}

export async function captureLead(input: LeadInput): Promise<LeadResult> {
  // Honeypot: pretend success so bots learn nothing.
  if (input.website && input.website.trim()) {
    return { ok: true, contactType: "email" };
  }
  if (!LEAD_KINDS.includes(input.kind)) {
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  const parsed = classifyContact(input.contact ?? "");
  if (!parsed) {
    return {
      ok: false,
      error: "That doesn't look like an email or a 10-digit phone number.",
    };
  }

  const attribution = sanitizeRecord(
    input.attribution as Record<string, unknown> | undefined,
    12,
    300
  );
  const { landing, referrer, ...utm } = attribution;
  const context = sanitizeRecord(input.context, 24, 5000);
  const row = {
    kind: input.kind,
    contact: parsed.value,
    contact_type: parsed.type,
    name: clip(input.name, 200),
    company: clip(input.company, 200),
    audience: input.audience ?? null,
    context: { ...context, ...(landing ? { first_landing: landing } : {}) },
    source_path: clip(input.sourcePath, 500),
    referrer: typeof referrer === "string" ? referrer.slice(0, 500) : null,
    utm,
  };

  const supabase = createSupabaseServiceRoleClient();

  // Cheap flood guard: same contact + kind inside 60s is a double-click
  // or a bot. Absorb it silently.
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count: recent } = await supabase
    .from("marketing_leads")
    .select("id", { count: "exact", head: true })
    .eq("kind", row.kind)
    .eq("contact", row.contact)
    .gte("created_at", since);
  if ((recent ?? 0) > 0) return { ok: true, contactType: parsed.type };

  const { error } = await supabase.from("marketing_leads").insert(row);
  if (error) {
    // 23505 = already on the newsletter / job-alert list. That's a success
    // from the visitor's point of view.
    if (error.code === "23505") return { ok: true, contactType: parsed.type };
    console.error("[lead] insert failed", error.message);
    return {
      ok: false,
      error: "We couldn't save that just now. Please try again in a moment.",
    };
  }

  // List signups don't need a ping each; everything else is a hand-raise.
  if (row.kind !== "newsletter" && !input.skipNotify) {
    const lines = [
      LEAD_KIND_LABELS[row.kind],
      "",
      `Contact: ${row.contact} (${row.contact_type})`,
      row.name ? `Name: ${row.name}` : null,
      row.company ? `Company: ${row.company}` : null,
      row.source_path ? `Captured on: ${row.source_path}` : null,
      "",
      "Full details: https://dsohire.com/admin/leads",
    ].filter((l): l is string => l !== null);

    try {
      await sendEmail({
        to: leadNotifyList(),
        subject: `[DSO Hire lead] ${LEAD_KIND_LABELS[row.kind]}`,
        template: `internal.lead.${row.kind}`,
        text: lines.join("\n"),
        replyTo: row.contact_type === "email" ? row.contact : undefined,
      });
    } catch (err) {
      console.error("[lead] notify failed (lead is saved)", err);
    }
  }

  return { ok: true, contactType: parsed.type };
}
