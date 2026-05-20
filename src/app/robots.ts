import type { MetadataRoute } from "next";

/**
 * robots.txt — PRE-LAUNCH LOCKDOWN (testing period).
 *
 * The entire site currently serves seeded / demo / test data. We block ALL
 * crawlers from the whole site so no test content (especially fake JobPosting
 * data) gets discovered or indexed while we build. This is paired with the
 * site-wide `noindex` in src/app/layout.tsx as defense-in-depth.
 *
 * ⚠️ AT LAUNCH: replace this with the real robots policy — allow crawling and
 *    re-add the sitemap reference, e.g.:
 *
 *      return {
 *        rules: [{ userAgent: "*", allow: "/", disallow: ["/employer/", "/candidate/", "/admin/", "/api/"] }],
 *        sitemap: "https://dsohire.com/sitemap.xml",
 *      };
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: "/",
      },
    ],
  };
}
