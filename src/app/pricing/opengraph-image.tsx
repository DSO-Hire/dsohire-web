import { renderOgCard } from "@/lib/og/card";

export const alt = "DSO Hire pricing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgCard({
    eyebrow: "Pricing",
    title: "One flat fee.",
    accent: "No placement fees, ever.",
    footer: "From $399/mo · No placement fees · No per-listing fees",
  });
}
