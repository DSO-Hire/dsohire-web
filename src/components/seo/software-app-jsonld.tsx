/**
 * SoftwareApplication JSON-LD for the employer product. Rendered on /,
 * /for-dental-groups and /pricing. Offers are generated from PRICING_TIERS.
 */

import { JsonLd } from "./json-ld";
import { softwareApplicationJsonLd } from "./schema";

export function SoftwareAppJsonLd() {
  return <JsonLd data={softwareApplicationJsonLd()} />;
}
