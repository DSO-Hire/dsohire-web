import { renderOgCard } from "@/lib/og/card";

export const alt = "The dental hiring shortage, by the numbers (2026), DSO Hire Research";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgCard({
    eyebrow: "DSO Hire Research · October 2026",
    title: "The dental hiring shortage,",
    accent: "by the numbers.",
    footer: "Hygienists · Time to fill · Federal outlook, sourced",
  });
}
