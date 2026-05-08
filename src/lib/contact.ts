/**
 * Single source of truth for the public support contact email.
 *
 * Set to the `info@dsohire.com` alias (confirmed live 2026-05-08) per
 * `feedback_avoid_solo_shop_language.md` — PE-backed DSO buyers read
 * a personal-named address ("email cam@…") as "this is one guy in his
 * garage." A neutral alias preserves the actual routing (forwards into
 * the founder's inbox) while presenting as institutional in customer
 * copy. Flip this single line to swap the publicly-visible address;
 * every error message + contact surface picks up the change
 * automatically.
 *
 * Real outbound infrastructure (Resend `to:` and `replyTo:` fields,
 * legal documents that record a designated agent) intentionally still
 * points at the cam@ inbox.
 *
 * Why a constant instead of an env var: customer-facing copy doesn't
 * change between environments (no separate dev/staging support inbox),
 * and a runtime env var would force every consumer onto a server-only
 * import path which we don't need.
 */

/** Public support contact email shown in customer-facing error copy. */
export const SUPPORT_EMAIL = "info@dsohire.com";

/**
 * `mailto:` link target. Helper so consumers don't have to remember
 * to prefix with `mailto:` themselves.
 */
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;
