import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server actions ship file uploads (resume parser + image upload).
    // Default 1MB body limit chokes on a 5MB image; default also chokes
    // on multi-page PDFs near the 10MB resume cap. 12MB gives headroom
    // for both without practically uncapping.
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  // NOTE: a config-level redirects() for /for-dsos -> /for-dental-groups was
  // removed 2026-05-22 while isolating a Vercel build failure at the
  // "Applying modifyConfig" step (which processes redirects). If the build
  // goes green without it, re-add the old-URL redirect as a page-level stub
  // (src/app/for-dsos/page.tsx calling redirect()) instead of via config.
};

export default nextConfig;
