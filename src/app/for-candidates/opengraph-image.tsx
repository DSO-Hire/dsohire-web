import { renderOgCard } from "@/lib/og/card";

export const alt = "DSO Hire for dental professionals";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgCard({
    eyebrow: "For dental professionals",
    title: "Find your next dental role,",
    accent: "scored to how you work.",
    footer: "Free for candidates · Apply direct",
  });
}
