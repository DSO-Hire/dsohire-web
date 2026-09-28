import { renderOgCard } from "@/lib/og/card";

export const alt = "DSO Hire FAQ";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgCard({
    eyebrow: "FAQ",
    title: "Straight answers about DSO Hire,",
    accent: "in plain English.",
  });
}
