/**
 * JSON-LD primitives shared by every public page.
 *
 * `serializeJsonLd` escapes the characters that could break out of an inline
 * <script> block (`<`, `>`, `&`, and the U+2028/U+2029 line separators), so
 * copy containing "</script>" can never terminate the tag early. JSON parsers
 * read the \u escapes back as the original characters, so the structured data
 * is unchanged.
 *
 * `<JsonLd data={...} />` renders server-side as
 * <script type="application/ld+json">, which is what crawlers read.
 */

export type JsonLdObject = Record<string, unknown>;

export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
