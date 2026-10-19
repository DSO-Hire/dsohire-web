/**
 * IndexNow: tells Bing, Yandex, Seznam, Naver (and anyone else in the
 * IndexNow network) that URLs changed, so they recrawl quickly instead of
 * waiting for their own schedule. Google does not participate; it reads the
 * sitemap.
 *
 * Ownership proof: the key below is served verbatim at
 * https://dsohire.com/<key>.txt from public/<key>.txt. Rotating the key means
 * replacing both (new random 32-hex string, new file).
 *
 * submitIndexNow() is a no-op unless indexing is allowed (launched, not the
 * demo deployment) AND this is Vercel production, so previews and local dev
 * never ping search engines. It never throws.
 */

import { isIndexingAllowed } from "@/lib/launch/gate";

export const INDEXNOW_KEY = "636518808ed7d64fae95049420124393";
export const INDEXNOW_HOST = "dsohire.com";
export const INDEXNOW_KEY_LOCATION = `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`;
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** IndexNow accepts up to 10,000 URLs per POST. */
const MAX_URLS_PER_REQUEST = 10_000;

export type IndexNowResult =
  | { ok: true; submitted: number; batches: number; statuses: number[] }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string; submitted: number };

/** Keep only absolute https URLs on our own host; dedupe. */
export function filterIndexNowUrls(urls: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of urls) {
    try {
      const u = new URL(raw);
      if (u.protocol === "https:" && u.hostname === INDEXNOW_HOST) out.add(u.toString());
    } catch {
      // not a URL; drop it
    }
  }
  return Array.from(out);
}

export function isIndexNowEnabled(): boolean {
  return isIndexingAllowed() && process.env.VERCEL_ENV === "production";
}

export async function submitIndexNow(urls: readonly string[]): Promise<IndexNowResult> {
  try {
    if (!isIndexNowEnabled()) {
      return { ok: false, skipped: true, reason: "indexing not allowed or not Vercel production" };
    }
    const urlList = filterIndexNowUrls(urls);
    if (urlList.length === 0) {
      return { ok: false, skipped: true, reason: "no eligible URLs" };
    }

    const statuses: number[] = [];
    let submitted = 0;
    for (let i = 0; i < urlList.length; i += MAX_URLS_PER_REQUEST) {
      const batch = urlList.slice(i, i + MAX_URLS_PER_REQUEST);
      const res = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          host: INDEXNOW_HOST,
          key: INDEXNOW_KEY,
          keyLocation: INDEXNOW_KEY_LOCATION,
          urlList: batch,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      statuses.push(res.status);
      // 200 = accepted, 202 = accepted, key validation pending.
      if (res.status !== 200 && res.status !== 202) {
        const text = await res.text().catch(() => "");
        return {
          ok: false,
          skipped: false,
          error: `IndexNow HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
          submitted,
        };
      }
      submitted += batch.length;
    }
    return { ok: true, submitted, batches: statuses.length, statuses };
  } catch (e) {
    return { ok: false, skipped: false, error: (e as Error).message ?? String(e), submitted: 0 };
  }
}
