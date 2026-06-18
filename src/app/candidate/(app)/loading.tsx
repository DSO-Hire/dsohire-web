import { BrandLoader } from "@/components/brand/brand-loader";

/**
 * Content-area loading fallback for every shelled candidate route. The nav
 * rail is supplied by the persistent layout, so this is the INLINE BrandLoader
 * (not fullScreen) — the branded D-mark draws on inside the content column
 * while a page's server data loads, with the nav staying in place. Replaces
 * the old per-route fullScreen loaders from the shell-less world.
 */
export default function Loading() {
  return <BrandLoader />;
}
