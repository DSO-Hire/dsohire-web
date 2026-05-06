/**
 * <Avatar> — shared design-system primitive (Phase 4.2.b.1).
 *
 * Renders an image when one is set; falls back to deterministic-color
 * initials when not. Replaces every hand-rolled initials-letter fallback
 * in the codebase. Used by candidate profile, employer team page,
 * application detail header, kanban comment authors, mention dropdowns,
 * candidate dashboard greeting, and the future Talent Pool surface.
 *
 * Per locked rule R6: photo upload is a prominent CTA, NOT completeness-
 * gated. The initials avatar is a clean default — never a "you're missing
 * something" implication.
 *
 * Color hash: cyrb53(name) mod palette.length. Pure (no hooks), so it
 * runs the same on server and client. Palette tuned to the brand:
 * Heritage tints + Navy tints + four complementary hues that all sit
 * cleanly on Ivory.
 */

import * as React from "react";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

export interface AvatarProps {
  /** Display name. Used both for initials and the color hash. */
  name: string | null | undefined;
  /** Image URL — typically `candidates.avatar_url` or `dsos.logo_url`. */
  imageUrl?: string | null;
  /** Visual size. Defaults to "md". */
  size?: AvatarSize;
  /** Optional className for outer wrapper (e.g., ring + shadow tweaks). */
  className?: string;
  /** Stable seed override when the displayed name is generic ("there"). */
  seed?: string;
  /** A11y override; defaults to the display name. */
  ariaLabel?: string;
}

const SIZE_CLASS: Record<AvatarSize, string> = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
  xl: "size-16 text-lg",
  "2xl": "size-24 text-2xl",
};

/**
 * Brand-aligned palette. Each entry is a `bg-* text-*` class pair so the
 * background contrasts with the chosen foreground at WCAG AA on the
 * brand Ivory backdrop. White-text-on-saturated-color is the LinkedIn /
 * Slack pattern; we use Ivory tone instead of pure white so the avatar
 * doesn't fight the cream surface.
 */
const PALETTE: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: "bg-[#14233F]", fg: "text-[#F7F4ED]" }, // Navy
  { bg: "bg-[#4D7A60]", fg: "text-[#F7F4ED]" }, // Heritage
  { bg: "bg-[#7C3F58]", fg: "text-[#F7F4ED]" }, // Plum
  { bg: "bg-[#B85C38]", fg: "text-[#F7F4ED]" }, // Terracotta
  { bg: "bg-[#3A6B7A]", fg: "text-[#F7F4ED]" }, // Slate teal
  { bg: "bg-[#2F5D49]", fg: "text-[#F7F4ED]" }, // Forest
  { bg: "bg-[#8C6B36]", fg: "text-[#F7F4ED]" }, // Burnt gold
  { bg: "bg-[#5C4A8A]", fg: "text-[#F7F4ED]" }, // Aubergine
];

export function Avatar({
  name,
  imageUrl,
  size = "md",
  className = "",
  seed,
  ariaLabel,
}: AvatarProps) {
  const sizeClass = SIZE_CLASS[size];
  const initials = computeInitials(name);
  const palette = PALETTE[paletteIndex(seed ?? name ?? "")];
  const label = ariaLabel ?? (name ? `${name}'s avatar` : "Avatar");

  if (imageUrl) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${sizeClass} ${className}`}
        aria-label={label}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ${palette.bg} ${palette.fg} ${sizeClass} ${className}`}
      aria-label={label}
      title={name ?? undefined}
    >
      {initials || "?"}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * "Sarah Chen"           → "SC"
 * "Cameron"              → "C"
 * "Dr. Dave Eslinger"    → "DE"  (drops "Dr.")
 * ""                     → ""
 * null                   → ""
 *
 * Strips honorifics + suffixes so a real first/last initial pair surfaces.
 */
export function computeInitials(name: string | null | undefined): string {
  if (!name) return "";
  const cleaned = name
    .replace(/\b(dr|mr|ms|mrs|miss|prof|rev)\.?\b/gi, " ")
    .replace(/\b(jr|sr|ii|iii|iv|v|md|dds|dmd|rdh|cda|esq)\.?\b/gi, " ")
    .replace(/[^A-Za-z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const parts = cleaned.split(" ");
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  const first = parts[0]!.charAt(0);
  const last = parts[parts.length - 1]!.charAt(0);
  return (first + last).toUpperCase();
}

/**
 * Pick a stable palette index from a string. cyrb53 hash gives much
 * better dispersion than a simple charCodeAt sum (a charCodeAt sum
 * clusters similar names — "Sarah" and "Sara" land on the same color).
 *
 * Reference: https://stackoverflow.com/a/52171480 (cyrb53 by bryc).
 */
function paletteIndex(input: string): number {
  return cyrb53(input) % PALETTE.length;
}

function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch: number; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
