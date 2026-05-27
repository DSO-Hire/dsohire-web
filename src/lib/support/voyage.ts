/**
 * Voyage AI embeddings wrapper.
 *
 * Voyage is Anthropic-recommended for retrieval — voyage-3-lite is the
 * sweet spot for cost ($0.02/M tokens) + quality. No official Node SDK
 * at time of writing; we hit the REST endpoint directly.
 *
 * VOYAGE_API_KEY env var required. Set in Vercel (production + preview)
 * AND in local .env.local for the offline generator script. Without it,
 * embedTexts throws — the caller surfaces a clear error rather than
 * silently failing.
 *
 * Model dimensions for voyage-3-lite: 512.
 */

const VOYAGE_ENDPOINT = "https://api.voyageai.com/v1/embeddings";

/** voyage-3-lite returns 512-dim float vectors. */
export const VOYAGE_MODEL = "voyage-3-lite";
export const VOYAGE_DIMENSIONS = 512;

interface VoyageEmbedResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage: { total_tokens: number };
}

/**
 * Embed an array of strings. Returns embeddings in the same order as
 * inputs. Throws on missing key or HTTP failure.
 *
 * `input_type` parameter:
 *   - "document" for the help registry entries (longer-form, will be
 *     retrieved against). Optimizes for being-retrieved.
 *   - "query" for user queries (short, will retrieve documents).
 *     Optimizes for retrieval-quality.
 *
 * Per Voyage docs, asymmetric input types boost retrieval accuracy ~5%
 * vs. using the same type for both sides.
 */
export async function embedTexts(
  texts: string[],
  inputType: "document" | "query"
): Promise<number[][]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) {
    throw new Error(
      "VOYAGE_API_KEY is not set. Add it to Vercel env vars + local .env.local."
    );
  }
  if (texts.length === 0) return [];

  const response = await fetch(VOYAGE_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: texts,
      input_type: inputType,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "(no body)");
    throw new Error(
      `Voyage API ${response.status} ${response.statusText}: ${errorBody.slice(0, 240)}`
    );
  }

  const data = (await response.json()) as VoyageEmbedResponse;
  // Defensive: sort by index so order matches input even if API doesn't preserve.
  const sorted = [...data.data].sort((a, b) => a.index - b.index);
  return sorted.map((d) => d.embedding);
}

/**
 * Cosine similarity between two equal-length vectors.
 *
 * Both vectors must be 512-dim (voyage-3-lite). Returns a score in
 * [-1, 1]; ~0.5+ usually means "topically related," ~0.7+ means
 * "directly relevant." For retrieval we sort descending and take top-N.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `cosineSimilarity dimension mismatch: ${a.length} vs ${b.length}`
    );
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
