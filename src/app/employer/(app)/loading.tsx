import { BrandLoader } from "@/components/brand/brand-loader";

/**
 * Content-area loading fallback for shelled employer routes that don't ship
 * their own skeleton. The nav rail is supplied by the persistent layout, so
 * this is the INLINE BrandLoader (not fullScreen) — the branded D-mark draws
 * on inside the content column while a page's server data loads, with the nav
 * staying in place. Heavy routes (dashboard / applications / jobs / analytics
 * / pipeline) keep their own layout-parity skeletons (now content-only so they
 * slot inside the persistent shell instead of redrawing the rail).
 */
export default function Loading() {
  return <BrandLoader />;
}
