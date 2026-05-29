import { Linkedin } from "lucide-react";

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
      <Linkedin className="h-4 w-4" aria-hidden />
      {label}
    </a>
  );
}
