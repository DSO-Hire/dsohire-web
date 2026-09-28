import { renderOgCard } from "@/lib/og/card";

export const alt = "About DSO Hire";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgCard({
    eyebrow: "About DSO Hire",
    title: "Built for dental hiring,",
    accent: "and nothing else.",
  });
}
