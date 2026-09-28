import { renderOgCard } from "@/lib/og/card";

export const alt = "Dental hiring guides from DSO Hire";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgCard({
    eyebrow: "Dental hiring guides",
    title: "Practical playbooks for",
    accent: "hiring dental teams.",
  });
}
