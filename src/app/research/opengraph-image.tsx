import { renderOgCard } from "@/lib/og/card";

export const alt = "DSO Hire Research: what dental hiring actually costs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgCard({
    eyebrow: "DSO Hire Research",
    title: "What dental hiring",
    accent: "actually costs.",
    footer: "Every number cited · Every calculation labeled",
  });
}
