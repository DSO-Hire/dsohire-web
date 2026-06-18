"use client";

/**
 * E1.19 — "Your careers page" share affordance on the public-profile
 * settings page. The /companies/[slug] page is already a fully branded,
 * editable page listing the DSO's open roles; this surfaces it as a
 * careers page the DSO can link from their own website, with one-click
 * copy of the absolute URL.
 */

import { useState } from "react";
import { Copy, Check, ExternalLink, Globe } from "lucide-react";

export function CareersPageShare({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (insecure context / permissions) — the
      // URL is still visible to select-and-copy manually.
    }
  }

  return (
    <div className="max-w-[820px] border border-[var(--rule)] bg-cream/40 p-4">
      <div className="flex items-center gap-2 text-heritage-deep mb-2">
        <Globe className="size-4" aria-hidden />
        <span className="text-[10px] font-bold tracking-[1.5px] uppercase">
          Your careers page
        </span>
      </div>
      <p className="text-[13px] text-slate-body leading-relaxed mb-3">
        This is your hosted, branded careers page — your open roles, culture,
        and photos in one link. Add it to your website&apos;s &ldquo;Careers&rdquo;
        button or share it directly with candidates.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="flex-1 min-w-[220px] truncate border border-[var(--rule-strong)] bg-white px-3 py-2 text-[13px] text-ink">
          {url}
        </code>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold tracking-[1.5px] uppercase bg-ink text-ivory hover:bg-ink-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-offset-2"
        >
          {copied ? (
            <>
              <Check className="size-3.5" aria-hidden /> Copied
            </>
          ) : (
            <>
              <Copy className="size-3.5" aria-hidden /> Copy link
            </>
          )}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold tracking-[1.5px] uppercase border border-[var(--rule-strong)] bg-white text-slate-body hover:bg-cream transition-colors"
        >
          Open <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>
    </div>
  );
}
