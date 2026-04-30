/**
 * /legal/* layout — adds the marketing nav + footer wrapper around any
 * page rendered at /legal/...
 *
 * The marketing nav is the same one used on the homepage; we duplicate the
 * minimal version here so /legal pages don't depend on a wrapper component
 * import that gets refactored elsewhere.
 */

import Link from "next/link";

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
    <nav className="fixed top-0 inset-x-0 z-50 h-[72px] px-6 sm:px-14 flex items-center justify-between backdrop-blur-md bg-ivory/85 border-b border-[var(--rule)]">
      <Link href="/" className="flex items-center gap-3">
        <BrandMark />
        <span className="font-extrabold tracking-tight text-lg leading-none text-ink">
          DSO<span className="text-heritage ml-1">Hire</span>
        </span>
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

function BrandMark() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-label="DSO Hire">
      <path d="M3 28 V16 a13 13 0 0 1 26 0 V28" stroke="#14233F" strokeWidth="2.5" fill="none" strokeLinecap="square" />
      <path d="M9 28 V18 a7 7 0 0 1 14 0 V28" stroke="#4D7A60" strokeWidth="2" fill="none" strokeLinecap="square" />
    </svg>
  );
}
