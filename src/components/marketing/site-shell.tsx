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
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MobileMenu } from "./mobile-menu";

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteNav />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}

/**
 * SiteNav is async so the "Post a Job" CTA can be context-aware:
 *   - Logged out → /pricing (marketing surface that explains what posting means)
 *   - Logged in with a DSO membership → /employer/jobs/new (skip the
 *     marketing detour; /employer/jobs/new will internally redirect to
 *     /employer/billing or /employer/onboarding if state isn't fully ready)
 *   - Logged in candidate (no DSO) → /pricing (still the right marketing
 *     surface; the page itself explains who this product is for)
 *
 * Sign-in button gets the same context awareness — once you're signed in,
 * "Sign In" becomes "Dashboard" and routes to your audience-specific home.
 */
export async function SiteNav() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let postAJobHref = "/pricing";
  let signInHref: string = "/sign-in";
  let signInLabel: string = "Sign In";

  if (user) {
    const [{ data: dsoUser }, { data: candidate }] = await Promise.all([
      supabase
        .from("dso_users")
        .select("dso_id")
        .eq("auth_user_id", user.id)
        .maybeSingle(),
      supabase
        .from("candidates")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle(),
    ]);

    if (dsoUser) {
      // Paid employer (or one in onboarding/billing) — let the destination
      // handle any state-specific redirect.
      postAJobHref = "/employer/jobs/new";
      signInHref = "/employer/dashboard";
      signInLabel = "Dashboard";
    } else if (candidate) {
      // Signed-in candidate — keep the post-a-job CTA pointed at marketing
      // (they're not the audience), but the sign-in button becomes their
      // own dashboard.
      signInHref = "/candidate/dashboard";
      signInLabel = "Dashboard";
    }
    // else: signed in but no audience row yet (mid-signup) → defaults stand.
  }

  return (
    <nav className="fixed top-0 inset-x-0 z-50 h-[80px] px-6 sm:px-14 flex items-center justify-between backdrop-blur-md bg-ivory/85 border-b border-[var(--rule)]">
      <Link href="/" className="flex items-center" aria-label="DSO Hire — home">
        <BrandLockup height={42} />
      </Link>
      <ul className="hidden md:flex items-center gap-7 list-none">
        <NavLink href="/for-dsos">For DSOs</NavLink>
        <ForDentalProsDropdown />
        <NavLink href="/jobs">Browse Jobs</NavLink>
        <NavLink href="/pricing">Pricing</NavLink>
        <NavLink href="/about">About</NavLink>
        <NavLink href="/contact">Contact</NavLink>
      </ul>
      <div className="flex items-center gap-3">
        <Link
          href={signInHref}
          className="hidden sm:inline-flex text-[12px] font-semibold tracking-[1.5px] uppercase text-slate-body hover:text-ink transition-colors"
        >
          {signInLabel}
        </Link>
        <Link
          href={postAJobHref}
          className="px-5 py-2.5 bg-ink text-ivory text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors"
        >
          Post a Job
        </Link>
        {/* Hamburger + drawer below md (768px). The drawer holds primary
            links + the For Dental Pros sub-list (hover dropdowns don't work
            on touch) + an audience-aware Sign In/Dashboard link + a
            duplicate Post a Job CTA so the primary action stays a thumb-tap
            away when the menu is open. Post a Job stays visible at every
            breakpoint so the conversion CTA is never obscured. */}
        <MobileMenu
          signInHref={signInHref}
          signInLabel={signInLabel}
          postAJobHref={postAJobHref}
        />
      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="text-[12px] font-semibold tracking-[1.8px] uppercase text-slate-body hover:text-ink transition-colors"
      >
        {children}
      </Link>
    </li>
  );
}

/**
 * ForDentalProsDropdown — hover-revealed nav menu for the candidate-side
 * surface. Shows /for-candidates as the hub plus the six role-specific
 * landing pages. Pure CSS (group-hover) — no Radix or JS framework.
 *
 * The role list here mirrors src/app/for-[role]/role-config.ts. Update
 * both when adding a new role page.
 */
function ForDentalProsDropdown() {
  const ROLE_LINKS = [
    { href: "/for-candidates", label: "For Dental Professionals", eyebrow: "Overview" },
    { href: "/for-dentists", label: "For Dentists", eyebrow: "DDS / DMD" },
    { href: "/for-specialists", label: "For Specialists", eyebrow: "Endo · Perio · Pedo · OS · Ortho" },
    { href: "/for-hygienists", label: "For Hygienists", eyebrow: "RDH" },
    { href: "/for-dental-assistants", label: "For Dental Assistants", eyebrow: "DA · EFDA" },
    { href: "/for-front-desk", label: "For Front Desk + Treatment Coordinators", eyebrow: "Patient-facing ops" },
    { href: "/for-office-managers", label: "For Office + Regional Managers", eyebrow: "OM · RM" },
  ];

  return (
    <li className="relative group">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold tracking-[1.8px] uppercase text-slate-body hover:text-ink transition-colors"
        aria-haspopup="menu"
      >
        For Dental Pros
        <svg
          aria-hidden
          className="h-2.5 w-2.5 transition-transform group-hover:rotate-180"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 4.5l3 3 3-3" />
        </svg>
      </button>
      {/* Bridge element — keeps hover state alive when moving cursor from
          trigger to menu so the dropdown doesn't flicker closed. */}
      <span
        aria-hidden
        className="absolute left-0 right-0 top-full h-3"
      />
      <div
        role="menu"
        className="invisible opacity-0 absolute top-full left-1/2 -translate-x-1/2 mt-3 min-w-[360px] bg-white border border-[var(--rule-strong)] shadow-[0_20px_40px_-20px_rgba(7,15,28,0.20),0_8px_20px_-12px_rgba(7,15,28,0.10)] group-hover:visible group-hover:opacity-100 transition-all duration-150 z-50"
      >
        <ul className="list-none p-2">
          {ROLE_LINKS.map((link, i) => (
            <li key={link.href}>
              <Link
                href={link.href}
                role="menuitem"
                className="block px-4 py-2.5 hover:bg-cream/60 transition-colors"
                style={{
                  // Subtle separator between the overview and the role list
                  borderTop:
                    i === 1 ? "1px solid var(--rule)" : undefined,
                  marginTop: i === 1 ? "4px" : undefined,
                  paddingTop: i === 1 ? "10px" : undefined,
                }}
              >
                <div className="text-[9px] font-bold tracking-[1.5px] uppercase text-heritage-deep mb-0.5">
                  {link.eyebrow}
                </div>
                <div className="text-[13px] font-semibold tracking-[-0.1px] text-ink">
                  {link.label}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
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
            <p className="text-[14px] text-ivory/55 leading-[1.7] mt-5 max-w-[280px]">
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
            <FooterLink href="/for-candidates">For Dental Pros</FooterLink>
            <FooterLink href="/for-dentists">For Dentists</FooterLink>
            <FooterLink href="/for-hygienists">For Hygienists</FooterLink>
            <FooterLink href="/for-office-managers">For Office Managers</FooterLink>
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
          <div className="text-[12px] tracking-[0.5px] text-ivory/40">
            © {new Date().getFullYear()} DSO Hire LLC · Kansas
          </div>
          <div className="flex gap-6 text-[12px] text-ivory/40">
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
        className="text-[14px] text-ivory/60 hover:text-ivory transition-colors"
      >
        {children}
      </Link>
    </li>
  );
}

/**
 * BrandLockup — the locked D-form mark (rotated arch opening left, curve on right)
 * with a heritage green horizontal crossbar suggesting an implied "H," paired with
 * the hairline divider and width-matched DSO/HIRE wordmark.
 *
 * Locked 2026-05-02 from the DSO Brand Identity System brand package. Colors
 * match the existing site palette (#14233F navy, #4D7A60 heritage, #F7F4ED
 * ivory) — only the mark silhouette changed, not the palette.
 *
 * Keep in sync with /public/logo-on-dark.svg, /public/logo-on-light.svg, and
 * /Users/cam/DSO Hire/Brand Assets/logo-files/.
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
      {/* Outer arch — rotated 90° CW so it opens LEFT with the curve on the
          right. Top arm extends right from x=5 to x=28 at y=5, curves down
          and around to a short vertical "spine" on the right (x=40, y=17→27),
          then curves down and around to the bottom arm extending left from
          x=28 back to x=5 at y=39. */}
      <path
        d="M 5 5 L 28 5 Q 40 5 40 17 L 40 27 Q 40 39 28 39 L 5 39"
        fill="none"
        stroke={ink}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Heritage horizontal crossbar — implied H. Sits at the vertical
          midpoint of the mark, extending from inside the open left side to
          just shy of the inner curve on the right. */}
      <line
        x1="8"
        y1="22"
        x2="24"
        y2="22"
        stroke="#4D7A60"
        strokeWidth="3"
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
 * BrandMark — compact mark-only icon (no wordmark). Use for favicons, app
 * icons, seal/stamps, or tight-space contexts where the full lockup won't fit
 * (e.g., 24×24 cell). For nav and footer use BrandLockup instead.
 *
 * Same D-form silhouette as BrandLockup, fitted to a square viewBox.
 */
export function BrandMark({ dark }: { dark?: boolean }) {
  const stroke = dark ? "#F7F4ED" : "#14233F";
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 44 44"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="DSO Hire"
    >
      {/* Outer D-form */}
      <path
        d="M 5 5 L 28 5 Q 40 5 40 17 L 40 27 Q 40 39 28 39 L 5 39"
        fill="none"
        stroke={stroke}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Heritage crossbar — implied H */}
      <line
        x1="8"
        y1="22"
        x2="24"
        y2="22"
        stroke="#4D7A60"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
