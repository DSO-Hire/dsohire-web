import { renderOgCard } from "@/lib/og/card";

export const alt = "DSO Hire for dental groups";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgCard({
    eyebrow: "For dental groups",
    title: "Every practice. Every role.",
    accent: "One pipeline.",
  });
}
