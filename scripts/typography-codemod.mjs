// Usage: node scripts/typography-codemod.mjs [--apply]
// Default is DRY RUN (prints per-file change counts, writes nothing).
import { readFileSync, writeFileSync, globSync } from "node:fs";

const APPLY = process.argv.includes("--apply");

const MAP = [
  [/text-\[10px\]/g, "text-2xs"],
  [/text-\[11px\]/g, "text-2xs"],
  [/text-\[12px\]/g, "text-xs"],
  [/text-\[13px\]/g, "text-xs"],
  [/text-\[14px\]/g, "text-sm"],
  [/text-\[15px\]/g, "text-sm"],
];

// Pixel-locked / print / canvas — never touch:
const EXCLUDE = [
  "src/components/resume/resume-pdf-document.tsx",
  "src/components/resume/resume-document.tsx",
  "src/app/candidate/resume/build/resume-builder.tsx",
  "src/app/candidate/(app)/resume/resume-toolbar.tsx",
  // Designed fixed-size marketing gauges/strips — px are intentional:
  "src/components/marketing/fit-dial.tsx",
  "src/components/marketing/film-strip.tsx",
];
const EXCLUDE_RE = [/opengraph-image/, /twitter-image/, /\/og\//];

const files = globSync("src/**/*.tsx");
let touched = 0,
  edits = 0;
for (const f of files) {
  if (EXCLUDE.includes(f) || EXCLUDE_RE.some((re) => re.test(f))) continue;
  const src = readFileSync(f, "utf8");
  // Skip OG/satori files defensively:
  if (/ImageResponse|next\/og|from ["']satori["']/.test(src)) continue;
  let out = src,
    n = 0;
  for (const [re, rep] of MAP) out = out.replace(re, () => (n++, rep));
  if (n > 0) {
    edits += n;
    touched++;
    console.log(`${n.toString().padStart(4)}  ${f}`);
    if (APPLY) writeFileSync(f, out);
  }
}
console.log(`\n${APPLY ? "APPLIED" : "DRY RUN"} — ${edits} edits across ${touched} files`);
