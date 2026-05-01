/**
 * /legal/* layout — minimal nav + footer wrapper around any /legal/... page.
 *
 * Uses the locked BrandLockup so the logo stays consistent with the rest of
 * the site instead of a one-off wordmark.
 */

import Link from "next/link";
import { BrandLockup } from "@/components/marketing/site-shell";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <LegalNav />
      <main className="flex-1">{children}</main>
      <LegalFooter />
    </>
  );
}

function LegalNav() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 h-[80px] px-6 sm:px-14 flex items-center justify-between backdrop-blur-md bg-ivory/85 border-b border-[var(--rule)]">
      <Link href="/" className="flex items-center" aria-label="DSO Hire — home">
        <BrandLockup height={42} />
      </Link>
      <div className="flex items-center gap-6">
        <Link
          href="/"
          className="text-[11px] font-semibold tracking-[1.5px] uppercase text-slate-body hover:text-ink transition-colors"
        >
          Back to Home
        </Link>
      </div>
    </nav>
  );
}

function LegalFooter() {
  return (
    <footer className="bg-ink text-ivory px-6 sm:px-14 pt-10 pb-8 mt-16">
      <div className="max-w-[1240px] mx-auto flex flex-wrap justify-between items-center gap-4">
        <div className="text-[11px] tracking-[0.5px] text-ivory/40">
          © {new Date().getFullYear()} DSO Hire LLC · Kansas
        </div>
        <div className="flex gap-6 text-[11px] text-ivory/40">
          <Link href="/legal/privacy" className="hover:text-ivory/70 transition-colors">
            Privacy
          </Link>
          <Link href="/legal/terms" className="hover:text-ivory/70 transition-colors">
            Terms
          </Link>
          <Link
            href="mailto:cam@dsohire.com"
            className="hover:text-ivory/70 transition-colors"
          >
            cam@dsohire.com
          </Link>
        </div>
      </div>
    </footer>
  );
}
