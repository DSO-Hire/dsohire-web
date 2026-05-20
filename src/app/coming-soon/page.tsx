/**
 * /coming-soon — pre-launch gate screen (testing period).
 *
 * Shown by src/proxy.ts to anyone without a valid preview cookie. Standalone
 * (no SiteShell nav/footer, which would link back into the gated app). The
 * code-entry form GETs to "/" with ?preview=<code>; the proxy validates it,
 * sets the cookie, and redirects in. A wrong code lands back here with the
 * ?preview param still present, which we use to show an error.
 */

import type { Metadata } from "next";
import { SUPPORT_MAILTO } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Coming soon",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ preview?: string }>;
}

export default async function ComingSoonPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const wrongCode = typeof sp.preview === "string" && sp.preview.length > 0;

  return (
    <div className="min-h-screen w-full bg-ink text-ivory flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-[460px]">
        {/* Wordmark */}
        <div className="flex items-baseline gap-2 mb-12">
          <span className="text-[22px] font-extrabold tracking-[-0.5px] text-ivory">
            DSO
          </span>
          <span className="text-[22px] font-medium tracking-[6px] text-ivory/80">
            HIRE
          </span>
          <span className="ml-1 h-2 w-2 rounded-full bg-heritage" aria-hidden="true" />
        </div>

        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-light mb-4">
          Private Testing
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-[-1px] leading-[1.12] mb-5">
          We&apos;re putting the finishing touches on DSO Hire.
        </h1>
        <p className="text-[15px] leading-[1.7] text-ivory/70 mb-8">
          The platform is in private testing right now. If you&apos;re an invited
          tester, enter your access code to continue.
        </p>

        {/* Access-code form → /?preview=CODE (proxy sets the cookie + lets you in) */}
        <form method="get" action="/" className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            name="preview"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Access code"
            aria-label="Access code"
            className="flex-1 bg-ivory/5 border border-ivory/20 px-4 py-3 text-[15px] text-ivory placeholder:text-ivory/40 outline-none focus:border-heritage focus:bg-ivory/10 transition-colors"
          />
          <button
            type="submit"
            className="px-6 py-3 bg-heritage text-ivory text-[12px] font-bold tracking-[1.8px] uppercase hover:bg-heritage-deep transition-colors whitespace-nowrap"
          >
            Enter
          </button>
        </form>

        {wrongCode && (
          <p className="mt-3 text-[13px] text-red-300">
            That code didn&apos;t work — double-check it, or email us for access.
          </p>
        )}

        <p className="mt-10 pt-6 border-t border-ivory/15 text-[13px] text-ivory/55 leading-relaxed">
          Testers only. Need a code?{" "}
          <a
            href={SUPPORT_MAILTO}
            className="text-heritage-light hover:text-ivory underline underline-offset-2"
          >
            Email us for access
          </a>
        </p>
      </div>
    </div>
  );
}
