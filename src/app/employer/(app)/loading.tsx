/**
 * Content-area loading fallback for shelled employer routes that don't ship
 * their own skeleton. The nav rail is supplied by the persistent layout, so
 * this renders inside the shell's <main>.
 *
 * #91 P0-B: upgraded from the lone inline BrandLoader to a full generic
 * page skeleton — the D-mark alone read as a blank ivory page at
 * full-screen scale (the measured "dead click" on six routes). Any future
 * route now inherits visible click-landed feedback by default; heavy
 * routes keep their own layout-parity skeletons.
 */

import { GenericRouteSkeleton } from "@/components/brand/route-skeletons";

export default function Loading() {
  return <GenericRouteSkeleton />;
}
