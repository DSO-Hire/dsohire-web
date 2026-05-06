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
};

export default nextConfig;
