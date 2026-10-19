import type { Metadata } from "next";

/* Apply flows (signed-in and guest) are forms, not content: keep them out
   of search results while still letting crawlers follow links back to the
   job. Search Console flagged them as "Crawled, currently not indexed". */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
