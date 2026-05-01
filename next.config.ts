import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Packages that should NOT be bundled by the server build — Next.js will
   * `require()` them from node_modules at runtime instead.
   *
   * `isomorphic-dompurify` pulls in `jsdom`, which has CommonJS-only
   * dependencies (canvas, ws, etc.) that Turbopack/webpack cannot bundle for
   * a serverless function. Without this, every page that imports it (e.g.
   * /jobs/[id], /companies/[slug]) throws "Failed to load external" at runtime
   * and renders a 500.
   */
  serverExternalPackages: ["isomorphic-dompurify", "jsdom"],
};

export default nextConfig;
