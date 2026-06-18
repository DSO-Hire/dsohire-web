import { BrandLoader } from "@/components/brand/brand-loader";

/**
 * Route loading fallback — the branded draw-on loader while the jobs pool is
 * fetched + PracticeFit-scored, instead of a blank screen (Cam, Day 37).
 */
export default function Loading() {
  return <BrandLoader fullScreen />;
}
