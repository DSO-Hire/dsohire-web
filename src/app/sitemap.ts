/**
 * sitemap.ts — dynamic XML sitemap for dsohire.com.
 *
 * Next.js convention: a default-exported function returning a `MetadataRoute.Sitemap`
 * is automatically served at /sitemap.xml. Helps Google discover and prioritize
 * the public marketing surfaces.
 *
 * What's listed: the static marketing routes (home, dual-lens side pages, the
 * 7 role/audience pages, pricing, about, contact, the public dental hiring
 * report, jobs index, companies index, and the major legal slugs).
 *
 * What's NOT listed (intentionally): dynamic `/jobs/[id]` and `/companies/[slug]`
 * pages, dashboard routes, auth screens, the corporate-roles deep pages, and
 * tokenized endpoints (/o/[token], /r/[token]). Dynamic listings can be added
 * here later by reading from Supabase at build time — for now, keep it focused
 * on the surfaces we want crawlers prioritizing.
 *
 * `lastModified` is set to the deploy time. That's a fine signal — Google
 * treats it as a hint, not gospel, and re-stamping every route on each deploy
 * tells the crawler the site is actively maintained.
 */

import type { MetadataRoute } from "next";

const SITE_URL = "https://dsohire.com";

interface SitemapRoute {
  path: string;
  priority: number;
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
}

const ROUTES: SitemapRoute[] = [
  // Top-level marketing
  { path: "/", priority: 1.0, changeFrequency: "weekly" },
  { path: "/for-dental-groups", priority: 0.9, changeFrequency: "weekly" },
  { path: "/for-candidates", priority: 0.9, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.8, changeFrequency: "weekly" },
  { path: "/jobs", priority: 0.9, changeFrequency: "daily" },
  { path: "/companies", priority: 0.7, changeFrequency: "weekly" },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.5, changeFrequency: "monthly" },
  { path: "/dental-hiring-report", priority: 0.7, changeFrequency: "monthly" },
  { path: "/resume-templates", priority: 0.7, changeFrequency: "monthly" },
  // #115 FOH — dedicated home for the proprietary fit engine (PF + DSOFit).
  { path: "/practicefit", priority: 0.8, changeFrequency: "monthly" },

  // Role / audience landing pages — keep all of them indexable so each
  // role-specific search query has a tailored landing page to rank.
  { path: "/for-dentists", priority: 0.6, changeFrequency: "monthly" },
  { path: "/for-specialists", priority: 0.6, changeFrequency: "monthly" },
  { path: "/for-hygienists", priority: 0.6, changeFrequency: "monthly" },
  { path: "/for-dental-assistants", priority: 0.6, changeFrequency: "monthly" },
  { path: "/for-front-desk", priority: 0.6, changeFrequency: "monthly" },
  { path: "/for-office-managers", priority: 0.6, changeFrequency: "monthly" },

  // Legal — common policies the legal index page links to.
  { path: "/legal", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/cookies", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/acceptable-use", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/dmca", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/candidate-terms", priority: 0.3, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
