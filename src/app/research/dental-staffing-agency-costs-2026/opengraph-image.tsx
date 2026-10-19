import { renderOgCard } from "@/lib/og/card";

export const alt = "What dental staffing agencies actually charge (2026), DSO Hire Research";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgCard({
    eyebrow: "DSO Hire Research · October 2026",
    title: "What dental staffing agencies",
    accent: "actually charge.",
    footer: "Placement fees · Temp platforms · Job boards, sourced",
  });
}
