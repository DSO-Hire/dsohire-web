/**
 * SiteShell — shared marketing nav + footer used by every public page
 * (landing, /pricing, /legal, /for-dsos, /about, /contact).
 *
 * Use as a wrapper inside a page or a route layout:
 *
 *   <SiteShell>
 *     <YourPageContent />
 *   </SiteShell>
 *
 * Or use <SiteNav /> + <SiteFooter /> directly when a page needs to control
 * what goes between them.
 */

import Link from "next/link";

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteNav />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}

export function SiteNav() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 h-[80px] px-6 sm:px-14 flex items-center justify-between backdrop-blur-md bg-ivory/85 border-b border-[var(--rule)]">
      <Link href="/" className="flex items-center" aria-label="DSO Hire — home">
        <BrandLockup height={42} />
      </Link>
      <ul className="hidden md:flex items-center gap-9 list-none">
        <NavLink href="/for-dsos">For DSOs</NavLink>
        <NavLink href="/pricing">Pricing</NavLink>
        <NavLink href="/about">About</NavLink>
        <NavLink href="/contact">Contact</NavLink>
      </ul>
      <div className="flex items-center gap-3">
        <Link
          href="/employer/sign-in"
          className="hidden sm:inline-flex text-[11px] font-semibold tracking-[1.5px] uppercase text-slate-body hover:text-ink transition-colors"
        >
          Sign In
        </Link>
        <Link
          href="/pricing"
          className="px-5 py-2.5 bg-ink text-ivory text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors"
        >
          Post a Job
        </Link>
      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="text-[11px] font-semibold tracking-[1.8px] uppercase text-slate-body hover:text-ink transition-colors"
      >
        {children}
      </Link>
    </li>
  );
}

export function SiteFooter() {
  return (
    <footer className="bg-ink text-ivory px-6 sm:px-14 pt-16 pb-10 border-t border-white/10">
      <div className="max-w-[1240px] mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-10 lg:gap-14 pb-12 border-b border-white/10 mb-9">
          <div>
            <BrandLockup dark height={56} />
            <p className="text-[13px] text-ivory/55 leading-[1.7] mt-5 max-w-[280px]">
              The job board built for dental support organizations. One flat
              monthly fee. Unlimited multi-location postings. Made by operators,
              for operators.
            </p>
          </div>

          <FooterCol title="For DSOs">
            <FooterLink href="/pricing">Pricing</FooterLink>
            <FooterLink href="/for-dsos">For DSOs</FooterLink>
            <FooterLink href="/employer/sign-up">Post a Job</FooterLink>
            <FooterLink href="/employer/sign-in">Sign In</FooterLink>
          </FooterCol>

          <FooterCol title="For Candidates">
            <FooterLink href="/jobs">Browse Jobs</FooterLink>
            <FooterLink href="/companies">Browse DSOs</FooterLink>
            <FooterLink href="/candidate/sign-in">Applicant Sign In</FooterLink>
          </FooterCol>

          <FooterCol title="Company">
            <FooterLink href="/about">About</FooterLink>
            <FooterLink href="/contact">Contact</FooterLink>
            <FooterLink href="/legal">All Policies</FooterLink>
          </FooterCol>

          <FooterCol title="Legal">
            <FooterLink href="/legal/privacy">Privacy</FooterLink>
            <FooterLink href="/legal/terms">Terms of Service</FooterLink>
            <FooterLink href="/legal/cookies">Cookies</FooterLink>
            <FooterLink href="/legal/acceptable-use">Acceptable Use</FooterLink>
            <FooterLink href="/legal/dmca">DMCA</FooterLink>
          </FooterCol>
        </div>

        <div className="flex flex-wrap justify-between items-center gap-4">
          <div className="text-[11px] tracking-[0.5px] text-ivory/40">
            © {new Date().getFullYear()} DSO Hire LLC · Kansas
          </div>
          <div className="flex gap-6 text-[11px] text-ivory/40">
            <Link
              href="/legal/privacy"
              className="hover:text-ivory/70 transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="/legal/terms"
              className="hover:text-ivory/70 transition-colors"
            >
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
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] font-bold tracking-[2.5px] uppercase text-heritage mb-5">
        {title}
      </div>
      <ul className="list-none flex flex-col gap-3">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="text-[13px] text-ivory/60 hover:text-ivory transition-colors"
      >
        {children}
      </Link>
    </li>
  );
}

/**
 * BrandLockup — the locked Bold Single Arch lockup (arch + Heritage accent arc
 * + hairline divider + DSO/HIRE wordmark, width-matched). This is the canonical
 * brand mark used on the site. Keep in sync with /public/logo files and the
 * source SVGs in DSO Hire/Brand Assets/logo-files/.
 */
export function BrandLockup({
  dark,
  height = 36,
}: {
  dark?: boolean;
  height?: number;
}) {
  const ink = dark ? "#F7F4ED" : "#14233F";
  const dividerColor = dark
    ? "rgba(247,244,237,0.18)"
    : "rgba(20,35,63,0.18)";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 124 44"
      height={height}
      style={{ height, width: "auto" }}
      role="img"
      aria-label="DSO Hire"
    >
      {/* Outer arch */}
      <path
        d="M 5 38 L 5 18 Q 5 6 22 6 L 28 6 Q 45 6 45 18 L 45 38"
        fill="none"
        stroke={ink}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Heritage inner accent arc */}
      <path
        d="M 14 22 Q 14 16 22 16 L 32 16"
        fill="none"
        stroke="#4D7A60"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Vertical hairline divider between mark and wordmark */}
      <line
        x1="52"
        y1="6"
        x2="52"
        y2="38"
        stroke={dividerColor}
        strokeWidth="0.8"
      />
      {/* DSO wordmark, heavy weight — explicit textLength locks the width
          so the HIRE underneath matches exactly regardless of font rendering. */}
      <text
        x="58"
        y="28"
        fontFamily="'Manrope', 'Helvetica Neue', Arial, sans-serif"
        fontSize="26"
        fontWeight="800"
        letterSpacing="-0.8"
        fill={ink}
        textLength="52"
        lengthAdjust="spacingAndGlyphs"
      >
        DSO
      </text>
      {/* HIRE wordmark — same textLength as DSO above. lengthAdjust="spacing"
          means only inter-letter spacing is adjusted, not glyph widths. Drop
          letterSpacing so textLength is the only width driver. */}
      <text
        x="58"
        y="38"
        fontFamily="'Manrope', 'Helvetica Neue', Arial, sans-serif"
        fontSize="9.5"
        fontWeight="500"
        fill="#4D7A60"
        textLength="52"
        lengthAdjust="spacing"
      >
        HIRE
      </text>
    </svg>
  );
}

/**
 * BrandMark — compact arch-only icon. Use for favicons, app icons, or
 * tight-space contexts where the full wordmark won't fit (e.g., 24×24 cell).
 * For nav and footer use BrandLockup instead.
 */
export function BrandMark({ dark }: { dark?: boolean }) {
  const stroke = dark ? "#F7F4ED" : "#14233F";
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="DSO Hire"
    >
      <path
        d="M3 28 V16 a13 13 0 0 1 26 0 V28"
        stroke={stroke}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="square"
      />
      <path
        d="M9 28 V18 a7 7 0 0 1 14 0 V28"
        stroke="#4D7A60"
        strokeWidth="2"
        fill="none"
        strokeLinecap="square"
      />
    </svg>
  );
}
