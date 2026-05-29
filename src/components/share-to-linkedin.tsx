/**
 * "Share on LinkedIn" — uses LinkedIn's share-offsite intent URL, which
 * needs NO API access or partnership. LinkedIn fetches the shared page and
 * renders a preview from its OpenGraph tags (title/description/image), so
 * the post is branded automatically from the job page's metadata.
 *
 * SHIP-DARK GATE: rendered only when LINKEDIN_SHARE_ENABLED === "true".
 * This is a server-only env read (the component renders server-side), so
 * it can be flipped at launch via the Vercel env without exposing anything
 * to the client bundle. Kept dark pre-launch because the site is gated /
 * noindexed and the listings are seed data — a LinkedIn share of a
 * gated/fake job would be a dead, off-brand link. Flip it on at launch
 * alongside the pre-launch-lockdown undo.
 *
 * Plain (non-interactive) anchor — opens LinkedIn's composer in a new tab.
 */
export function ShareToLinkedIn({
  url,
  label = "Share on LinkedIn",
  className,
}: {
  /** Absolute, publicly-reachable URL of the page to share. */
  url: string;
  label?: string;
  className?: string;
}) {
  if (process.env.LINKEDIN_SHARE_ENABLED !== "true") return null;

  const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
    url
  )}`;

  return (
    <a
      href={shareUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={
        className ??
        "inline-flex items-center justify-center gap-2 px-6 py-3.5 border border-[var(--rule-strong)] bg-white text-ink text-[12px] font-bold tracking-[2px] uppercase hover:bg-cream transition-colors"
      }
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className="h-4 w-4"
      >
        <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
      </svg>
      {label}
    </a>
  );
}
