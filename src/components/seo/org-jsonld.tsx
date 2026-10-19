/**
 * Organization + WebSite JSON-LD, sitewide. Mounted ONCE in the root layout
 * (src/app/layout.tsx) so every page carries the entity graph. One @graph
 * script so both entities land in a single block. No SearchAction: site
 * search is behind auth.
 */

import { JsonLd } from "./json-ld";
import { organizationGraphJsonLd } from "./schema";

export function OrgJsonLd() {
  return <JsonLd data={organizationGraphJsonLd()} />;
}
