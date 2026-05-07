/**
 * Robust JSON extractor for model responses.
 *
 * Haiku 4.5 (and most LLMs) occasionally add preamble ("Here's the
 * JSON:") or trailing prose ("Hope this helps!") around the JSON
 * payload, even when the system prompt forbids it. The previous naive
 * implementation only matched a code-fenced block that wrapped the
 * ENTIRE response — anything outside the fence broke parsing.
 *
 * Caught 2026-05-07 (Cam test with Jordan Bailey on AI Write
 * Headline + Summary) — error was "Model returned in unexpected
 * format". Same pattern was duplicated across 4 different action
 * files; consolidated here.
 *
 * Strategy, in order:
 *   1. JSON.parse the trimmed text directly (happy path).
 *   2. Strip ```json … ``` fences anywhere in the text and try again.
 *   3. Find the FIRST balanced {...} block via a depth counter that
 *      tracks string state, so escaped/quoted braces don't trip it.
 *   4. Throw a clean error if all three fail — the caller logs the
 *      raw response for debugging.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  // 1. Direct parse — happy path
  try {
    return JSON.parse(trimmed);
  } catch {}

  // 2. Strip code fences (anywhere in the text, not just start/end)
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {}
  }

  // 3. Balanced-brace scan — find the first complete top-level {...}
  const start = trimmed.indexOf("{");
  if (start >= 0) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const candidate = trimmed.slice(start, i + 1);
          try {
            return JSON.parse(candidate);
          } catch {
            break;
          }
        }
      }
    }
  }

  throw new Error("No parseable JSON object found in model response");
}
