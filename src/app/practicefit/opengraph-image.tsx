import { renderOgCard } from "@/lib/og/card";

export const alt = "PracticeFit by DSO Hire";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgCard({
    eyebrow: "PracticeFit",
    title: "A fit score on every job,",
    accent: "with the plain-English why.",
    footer: "Free for candidates · Apply direct",
  });
}
