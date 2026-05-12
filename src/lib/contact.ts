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

/**
 * Public-facing contact addresses. All three aliases route to the same
 * inbox (cam@dsohire.com) under the hood, but presenting them as
 * distinct role-based addresses reads as a multi-person company to
 * PE-backed DSO buyers — material for first-impression credibility.
 *
 * Convention:
 * - INFO_EMAIL   — general inquiries, marketing pages, footer, legal
 * - SALES_EMAIL  — pricing / Enterprise / Charter / demo requests
 * - SUPPORT_EMAIL — error recovery, help docs, account restore
 *
 * `SUPPORT_EMAIL` historically aliased to `info@` for back-compat with
 * existing callers; we're keeping that legacy mapping for now (rather
 * than churning every error message) and migrating high-value surfaces
 * (pricing → sales, restore flows → support) opportunistically. New
 * code should pick the most precise alias.
 */
export const INFO_EMAIL = "info@dsohire.com";
export const SALES_EMAIL = "sales@dsohire.com";
/** Legacy: maps to info@ — most existing consumers expect this. */
export const SUPPORT_EMAIL = "info@dsohire.com";
/** Real support@ for help/error contexts where the precise alias matters. */
export const HELP_EMAIL = "support@dsohire.com";

/** `mailto:` link helpers so consumers don't repeat the prefix. */
export const INFO_MAILTO = `mailto:${INFO_EMAIL}`;
export const SALES_MAILTO = `mailto:${SALES_EMAIL}`;
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;
export const HELP_MAILTO = `mailto:${HELP_EMAIL}`;
