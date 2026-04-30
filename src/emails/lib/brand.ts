/**
 * DSO Hire — brand tokens for email templates.
 *
 * Email clients have inconsistent CSS support (Outlook is the worst offender),
 * so email styles use inline styles with these constants instead of Tailwind.
 * Same color values as src/app/globals.css — keep in sync if brand changes.
 *
 * Manrope is requested but several major mail clients (Outlook desktop, some
 * Yahoo) won't load it — that's why every font stack falls back to system sans.
 */

export const brand = {
  // Navy
  ink: "#14233F",
  inkSoft: "#2D4262",
  ink1000: "#070F1C",

  // Heritage
  heritage: "#4D7A60",
  heritageDeep: "#2F5D4F",
  heritageLight: "#6B9279",

  // Ivory / cream
  ivory: "#F7F4ED",
  ivoryDeep: "#ECE7DB",
  cream: "#FAF7F1",

  // Slate
  slate: "#4A6278",
  slateMeta: "#6E8395",

  // Type
  fontFamily:
    "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",

  // Layout
  maxWidth: "600px",
  contentPadding: "32px",

  // URLs
  siteUrl: "https://dsohire.com",
  // Inline SVGs work in modern email clients (Apple Mail, Gmail webmail, iOS Mail).
  // For Outlook desktop / other strict clients, render text wordmark fallback —
  // currently Layout.tsx uses text-based wordmark for max compatibility.
  logoLockupOnDark: "https://dsohire.com/logo-on-dark.svg",
  logoLockupOnLight: "https://dsohire.com/logo-on-light.svg",
  logoMonogram: "https://dsohire.com/logo-monogram.svg",
  supportEmail: "cam@dsohire.com",
} as const;
