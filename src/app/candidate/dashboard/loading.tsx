import { BrandLoader } from "@/components/brand/brand-loader";

/**
 * Route loading fallback — shows the branded draw-on loader while the
 * dashboard's server data loads, instead of a blank screen (Cam, Day 37).
 */
export default function Loading() {
  return <BrandLoader fullScreen />;
}
