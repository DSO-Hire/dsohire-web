import type { CSSProperties } from "react";

/*
 * Cam's headshot on CRM avatars (both of his sign-ins). Each chip keeps its initials in
 * the markup (screen readers, hover titles) and shows the photo as its
 * background; anyone else on file keeps the plain initials chip.
 */
const PHOTOS: Record<string, string> = {
  "cameron@eslingerdental.com": "/crm/cam-avatar.jpg",
  "cam@dsohire.com": "/crm/cam-avatar.jpg",
};

type Person = { email?: string | null } | null | undefined;

export function photoOf(p: Person): string | null {
  return PHOTOS[(p?.email ?? "").toLowerCase()] ?? null;
}

/** className suffix for a chip that should show the person's photo */
export function photoClass(p: Person): string {
  return photoOf(p) ? " has-photo" : "";
}

export function photoStyle(p: Person, extra?: CSSProperties): CSSProperties | undefined {
  const url = photoOf(p);
  if (!url) return extra;
  return { ...extra, backgroundImage: `url(${url})` };
}
