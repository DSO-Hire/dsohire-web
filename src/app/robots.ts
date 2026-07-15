import type { MetadataRoute } from "next";
import { isIndexingAllowed } from "@/lib/launch/gate";

/**
 * robots.txt — env-driven launch gate.
 *
 * Locked (blanket Disallow, no sitemap) whenever indexing is not allowed:
 *   - pre-launch (PREVIEW_GATE_DISABLED unset/false), or
 *   - the demo deployment (DEMO_SITE=true on demo.dsohire.com — demo data
 *     must never be crawled or indexed, permanently).
 *
 * Open (real policy + sitemap) once PREVIEW_GATE_DISABLED=true on prod.
 * This mirrors the site-wide `robots` metadata in src/app/layout.tsx via
 * the shared isIndexingAllowed() helper, so the two never disagree.
 *
 * Launch day: set PREVIEW_GATE_DISABLED=true in Vercel and redeploy —
 * no code change needed here.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexingAllowed()) {
    return {
      rules: [
        {
          userAgent: "*",
          disallow: "/",
        },
      ],
    };
  }

  // Open policy per docs/ClaudeCode_Launch_SEO_GoLive_Spec_2026-07-13.md:
  // app/auth/tokenized surfaces stay out; /feeds/ deliberately NOT disallowed
  // (Indeed's crawler needs it); /embed/ disallowed (iframe content, already
  // noindexed inline). No AI-crawler blocks — GPTBot/ClaudeBot/PerplexityBot
  // readability is the point of the AI-visibility effort.
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/employer/",
          "/candidate/",
          "/admin/",
          "/api/",
          "/o/",
          "/r/",
          "/auth/",
          "/embed/",
        ],
      },
    ],
    sitemap: "https://dsohire.com/sitemap.xml",
  };
}
