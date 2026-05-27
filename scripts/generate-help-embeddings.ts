/**
 * Generate embeddings for every HELP_CONTENT registry entry.
 *
 * Run locally (NOT in production) once after editing src/lib/help/
 * help-content.ts. Writes src/lib/support/help-content-embeddings.json
 * for the RAG retrieval helper to load at request time.
 *
 * Usage:
 *   cp .env.local.example .env.local  # if not already done
 *   # Add VOYAGE_API_KEY=... to .env.local
 *   npx tsx scripts/generate-help-embeddings.ts
 *   git add src/lib/support/help-content-embeddings.json && git commit
 *
 * Voyage embedding cost: voyage-3-lite at $0.02/M tokens. The full
 * HELP_CONTENT registry embeds for well under $0.01. Don't worry about
 * cost optimization here.
 *
 * Re-run any time HELP_CONTENT changes. We bump HELP_CONTENT_VERSION
 * (computed below) on every change so the RAG retrieval helper can
 * warn if embeddings are stale vs. registry.
 */

import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

// Load .env.local for VOYAGE_API_KEY before importing anything that
// reads from process.env.
const HERE = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(HERE, "..", ".env.local") });

import { HELP_CONTENT, type HelpEntry } from "../src/lib/help/help-content";
import {
  VOYAGE_DIMENSIONS,
  VOYAGE_MODEL,
  embedTexts,
} from "../src/lib/support/voyage";

const OUT_PATH = resolve(
  HERE,
  "..",
  "src",
  "lib",
  "support",
  "help-content-embeddings.json"
);

interface EmbeddedEntry {
  key: string;
  /** Concatenated text we embedded — useful for cache-invalidation hashing. */
  text: string;
  embedding: number[];
}

interface EmbeddingFile {
  /** Hash of the registry contents at generation time. */
  version: string;
  /** Voyage model used. */
  model: string;
  /** Vector dimension count. */
  dimensions: number;
  /** When generated. */
  generated_at: string;
  /** Per-entry embeddings. */
  entries: EmbeddedEntry[];
}

/** Concatenate title + tip + bullets + step bodies into one embeddable text. */
function entryToText(entry: HelpEntry): string {
  const parts: string[] = [entry.title, entry.tip];
  if (entry.bullets) parts.push(...entry.bullets);
  if (entry.steps) {
    for (const s of entry.steps) {
      if (s.heading) parts.push(s.heading);
      parts.push(s.body);
    }
  }
  return parts.join("\n");
}

/** SHA-256 of the canonical JSON of every entry, used as the version field. */
function computeRegistryHash(): string {
  const canonical = Object.entries(HELP_CONTENT)
    .map(([key, entry]) => `${key}:${entryToText(entry)}`)
    .sort()
    .join("\n---\n");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

async function main(): Promise<void> {
  const keys = Object.keys(HELP_CONTENT);
  if (keys.length === 0) {
    console.error("HELP_CONTENT is empty — nothing to embed.");
    process.exit(1);
  }

  console.log(`Embedding ${keys.length} HELP_CONTENT entries via ${VOYAGE_MODEL}...`);
  const texts = keys.map((key) => entryToText(HELP_CONTENT[key]));

  let embeddings: number[][];
  try {
    embeddings = await embedTexts(texts, "document");
  } catch (err) {
    console.error("Embed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  if (embeddings.length !== keys.length) {
    console.error(
      `Embedding count mismatch: expected ${keys.length}, got ${embeddings.length}`
    );
    process.exit(1);
  }
  for (const [i, emb] of embeddings.entries()) {
    if (emb.length !== VOYAGE_DIMENSIONS) {
      console.error(
        `Entry ${keys[i]}: expected ${VOYAGE_DIMENSIONS}-dim vector, got ${emb.length}`
      );
      process.exit(1);
    }
  }

  const file: EmbeddingFile = {
    version: computeRegistryHash(),
    model: VOYAGE_MODEL,
    dimensions: VOYAGE_DIMENSIONS,
    generated_at: new Date().toISOString(),
    entries: keys.map((key, i) => ({
      key,
      text: texts[i],
      embedding: embeddings[i],
    })),
  };

  writeFileSync(OUT_PATH, JSON.stringify(file, null, 2) + "\n", "utf8");
  console.log(`✓ Wrote ${OUT_PATH}`);
  console.log(`  Version: ${file.version}`);
  console.log(`  Entries: ${file.entries.length}`);
  console.log(`  Total tokens (rough): ${texts.reduce((n, t) => n + Math.ceil(t.length / 4), 0)}`);
  console.log("\nNext: git add src/lib/support/help-content-embeddings.json && git commit");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
