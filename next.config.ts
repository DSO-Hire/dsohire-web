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
  async redirects() {
    return [
      {
        // 2026-05-22 — employer lens renamed "For DSOs" → "Dental Groups";
        // the page moved to /for-dental-groups. Keep the old URL alive.
        source: "/for-dsos",
        destination: "/for-dental-groups",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
