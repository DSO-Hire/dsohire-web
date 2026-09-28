import { renderOgCard } from "@/lib/og/card";

export const alt = "Dental jobs on DSO Hire";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgCard({
    eyebrow: "Dental jobs",
    title: "Dental roles at multi-location groups.",
    accent: "Apply direct.",
    footer: "Free for candidates · No agency middlemen",
  });
}
