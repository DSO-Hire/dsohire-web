"use server";

/**
 * /contact server action — sends the form submission to cam@dsohire.com via Resend.
 *
 * Honeypot defense: the form includes a hidden `website` field that real users
 * never see. If it's filled, it's a bot — silently succeed without sending.
 */

import { Resend } from "resend";

export interface ContactFormState {
  ok: boolean;
  error?: string;
  message?: string;
}

const resend = new Resend(process.env.RESEND_API_KEY);

export async function submitContact(
  _prev: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const honeypot = String(formData.get("website") ?? "").trim();

  // Honeypot: if filled, silently succeed (don't tip off the bot).
  if (honeypot) {
    return { ok: true, message: "Thanks — we'll be in touch shortly." };
  }

  if (!name || !email || !message) {
    return { ok: false, error: "Name, email, and message are required." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  if (message.length > 5000) {
    return { ok: false, error: "Message is too long (5000 char max)." };
  }

  const subjectLine =
    subject || `New contact form submission from ${name}`;

  const bodyLines = [
    `Name: ${name}`,
    `Email: ${email}`,
    company ? `Company: ${company}` : null,
    "",
    "Message:",
    message,
  ]
    .filter((l) => l !== null)
    .join("\n");

  try {
    await resend.emails.send({
      from: "DSO Hire Contact <no-reply@dsohire.com>",
      to: ["cam@dsohire.com"],
      replyTo: email,
      subject: `[DSO Hire Contact] ${subjectLine}`,
      text: bodyLines,
    });
    return {
      ok: true,
      message:
        "Thanks — we'll reply within one business day.",
    };
  } catch (err) {
    console.error("[contact] resend.emails.send failed", err);
    return {
      ok: false,
      error:
        "Something went wrong sending your message. Email cam@dsohire.com directly.",
    };
  }
}
