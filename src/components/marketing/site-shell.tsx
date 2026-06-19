/**
 * SiteShell — shared marketing nav + footer used by every public page
 * (landing, /pricing, /legal, /for-dental-groups, /about, /contact).
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
import { INFO_EMAIL as SUPPORT_EMAIL, INFO_MAILTO as SUPPORT_MAILTO } from "@/lib/contact";
import { MobileMenu } from "./mobile-menu";
import { LensToggle } from "./lens-toggle";
import { MotionMount } from "./motion";
import { PracticeFitWordmark } from "@/components/practice-fit/brand/practice-fit-wordmark";
import { ToastProvider } from "@/components/app/toast";

export function SiteShell({
  children,
  ctaIntent = "candidate",
}: {
  children: React.ReactNode;
  /**
   * Which audience this page is courting — drives the SIGNED-OUT primary CTA.
   * Defaults to "candidate" (Browse Jobs) because most public traffic is
   * job-seekers, and a job-seeker landing on the home page WILL tap Browse
   * Jobs. DSO-buyer pages (/for-dental-groups, /pricing, /vs/*, /switch) pass
   * "dso" so prospects there still see "Post a Job" — a new DSO won't impulse-
   * tap it on a candidate page anyway. Signed-in visitors always get the
   * role-correct CTA regardless of this prop. (Cam, Day 34.)
   */
  ctaIntent?: "candidate" | "dso";
}) {
  return (
    <>
      {/* #115 FOH-1 — one observer per page powers every [data-reveal]
          scroll-settle on the marketing surfaces. */}
      <MotionMount />
      <SiteNav ctaIntent={ctaIntent} />
      <main className="flex-1">
        {/* Toast layer for public pages — the job-detail SaveJobButton lives
            here (not under the candidate shell), so its "Job saved" toast had
            no provider. The <main> is a sibling of the backdrop-blurred nav, so
            the fixed toast viewport isn't trapped by a containing block. */}
        <ToastProvider>{children}</ToastProvider>
      </main>
      <SiteFooter />
    </>
  );
}

/**
 * SiteNav is async so the primary CTA can be context-aware:
 *   - Logged out → CTA follows the page's `ctaIntent` (Cam, Day 34):
 *       · candidate-leaning pages (home default, /jobs, /for-[role]) →
 *         "Browse Jobs" / /jobs. Most public traffic is job-seekers and a
 *         hygienist landing on the home page WILL tap Browse Jobs.
 *       · DSO-buyer pages (/for-dental-groups, /pricing, /vs/*, /switch) →
 *         "Post a Job" / /pricing. That's where DSO prospects actually are;
 *         a new DSO won't impulse-tap "Post a Job" off a candidate page.
 *   - Logged in with a DSO membership → "Post a Job" / /employer/jobs/new
 *     (skip the marketing detour; /employer/jobs/new will internally redirect
 *     to /employer/billing or /employer/onboarding if state isn't ready)
 *   - Logged in candidate (no DSO) → "Browse Jobs" / /jobs. A candidate is a
 *     job seeker, not an employer — surfacing "Post a Job" to them is wrong
 *     (Cam, 5G.e stress test). Their primary action is finding roles.
 *
 * Signed-in role ALWAYS overrides the page intent — a signed-in DSO sees
 * "Post a Job" everywhere, a signed-in candidate sees "Browse Jobs" everywhere.
 *
 * Sign-in button gets the same context awareness — once you're signed in,
 * "Sign In" becomes "Dashboard" and routes to your audience-specific home.
 */
export async function SiteNav({
  ctaIntent = "candidate",
}: {
  ctaIntent?: "candidate" | "dso";
} = {}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed-out default is candidate-first (Browse Jobs); DSO-buyer pages opt
  // into "Post a Job" via ctaIntent="dso".
  let primaryCtaHref = ctaIntent === "dso" ? "/pricing" : "/jobs";
  let primaryCtaLabel = ctaIntent === "dso" ? "Post a Job" : "Browse Jobs";
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
      // handle any state-specific redirect. Force "Post a Job" so a DSO on a
      // candidate-leaning page (where the signed-out default is Browse Jobs)
      // still gets their employer action.
      primaryCtaHref = "/employer/jobs/new";
      primaryCtaLabel = "Post a Job";
      signInHref = "/employer/dashboard";
      signInLabel = "Dashboard";
    } else if (candidate) {
      // Signed-in candidate — they're a job seeker. Swap the employer
      // "Post a Job" CTA for "Browse Jobs", and point Sign In at their
      // own dashboard.
      primaryCtaHref = "/jobs";
      primaryCtaLabel = "Browse Jobs";
      signInHref = "/candidate/dashboard";
      signInLabel = "Dashboard";
    }
    // else: signed in but no audience row yet (mid-signup) → defaults stand.
  }

  return (
    <nav className="fixed top-0 inset-x-0 z-50 h-[80px] px-6 sm:px-14 flex items-center justify-between backdrop-blur-md bg-ivory/85 border-b border-[var(--rule)]">
      <Link href="/" className="flex items-center" aria-label="DSO Hire — home">
        <BrandLockup height={42} draw />
      </Link>
      <ul className="hidden md:flex items-center gap-7 list-none">
        {/* Dual-lens segmented control — "For DSOs | Job Candidates".
            Client island (needs usePathname for active-lens state); the
            right segment is also the hover trigger for the role dropdown. */}
        <LensToggle />
        {/* On candidate-leaning surfaces the primary CTA is already
            "Browse Jobs" — drop the redundant text link so it doesn't sit
            beside the button. On DSO pages (CTA = "Post a Job") the link
            stays, keeping Browse Jobs one click away. */}
        {primaryCtaLabel !== "Browse Jobs" && (
          <NavLink href="/jobs">Browse Jobs</NavLink>
        )}
        {/* #115 FOH (Cam, Day 31) — the proprietary wow-feature gets the nav
            slot: the trademarked PracticeFit wordmark links its dedicated
            page (which covers DSOFit too). Companies moved to the footer +
            mobile menu — the directory is a browse surface, not a headline. */}
        <li>
          <Link
            href="/practicefit"
            aria-label="PracticeFit"
            className="flex items-center hover:opacity-75 transition-opacity"
          >
            <PracticeFitWordmark surface="light" tm className="text-[15.5px]" />
          </Link>
        </li>
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
          href={primaryCtaHref}
          className="px-5 py-2.5 bg-primary text-primary-foreground text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-primary/90 transition-colors"
        >
          {primaryCtaLabel}
        </Link>
        {/* Hamburger + drawer below md (768px). The drawer holds primary
            links + the Job Candidates sub-list (hover dropdowns don't work
            on touch) + an audience-aware Sign In/Dashboard link + a
            duplicate primary CTA so it stays a thumb-tap away when the menu
            is open. The CTA stays visible at every breakpoint. */}
        <MobileMenu
          signInHref={signInHref}
          signInLabel={signInLabel}
          primaryCtaHref={primaryCtaHref}
          primaryCtaLabel={primaryCtaLabel}
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

export function SiteFooter() {
  return (
    <footer className="bg-hero text-hero-foreground px-6 sm:px-14 pt-16 pb-10 border-t border-hero-foreground/10">
      <div className="max-w-[1240px] mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-10 lg:gap-14 pb-12 border-b border-hero-foreground/10 mb-9">
          <div>
            <BrandLockup dark height={56} />
            <p className="text-[14px] text-hero-foreground/55 leading-[1.7] mt-5 max-w-[280px]">
              Dental hiring, done direct. The hiring platform built for
              multi-location DSOs. One flat monthly fee, unlimited postings.
              Born from ten years inside the business of dentistry.
            </p>
          </div>

          <FooterCol title="Dental Groups">
            <FooterLink href="/pricing">Pricing</FooterLink>
            <FooterLink href="/for-dental-groups">Why DSO Hire</FooterLink>
            <FooterLink href="/switch">Switch to DSO Hire</FooterLink>
            <FooterLink href="/vs/job-boards">vs Job Boards</FooterLink>
            <FooterLink href="/vs/staffing-agencies">vs Staffing Agencies</FooterLink>
            <FooterLink href="/employer/sign-in">Sign In</FooterLink>
          </FooterCol>

          <FooterCol title="For Candidates">
            <FooterLink href="/jobs">Browse Jobs</FooterLink>
            <FooterLink href="/practicefit">PracticeFit™</FooterLink>
            <FooterLink href="/for-candidates">Job Candidates</FooterLink>
            <FooterLink href="/for-dentists">For Dentists</FooterLink>
            <FooterLink href="/for-hygienists">For Hygienists</FooterLink>
            <FooterLink href="/for-office-managers">For Office Managers</FooterLink>
            <FooterLink href="/companies">Browse DSOs</FooterLink>
            <FooterLink href="/candidate/sign-in">Applicant Sign In</FooterLink>
          </FooterCol>

          <FooterCol title="Company">
            <FooterLink href="/about">About</FooterLink>
            <FooterLink href="/changelog">Changelog</FooterLink>
            <FooterLink href="/hiring-pulse">Hiring Pulse</FooterLink>
            <FooterLink href="/security">Security &amp; Trust</FooterLink>
            <FooterLink href="/contact">Contact</FooterLink>
            <FooterLink href="/help">Help Center</FooterLink>
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
          <div className="text-[12px] tracking-[0.5px] text-hero-foreground/40">
            © {new Date().getFullYear()} DSO Hire LLC
          </div>
          <div className="flex gap-6 text-[12px] text-hero-foreground/40">
            <Link
              href="/legal/privacy"
              className="hover:text-hero-foreground/70 transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="/legal/terms"
              className="hover:text-hero-foreground/70 transition-colors"
            >
              Terms
            </Link>
            <Link
              href={SUPPORT_MAILTO}
              className="hover:text-hero-foreground/70 transition-colors"
            >
              {SUPPORT_EMAIL}
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
        className="text-[14px] text-hero-foreground/60 hover:text-hero-foreground transition-colors"
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
  draw,
}: {
  dark?: boolean;
  height?: number;
  /**
   * #115 FOH-1 — opt-in draw-on: the arch sweeps on, the heritage crossbar
   * follows, wordmark + divider fade up. Pure CSS (globals.css
   * `.lockup-draw`), reduced-motion safe. Used by the marketing SiteNav;
   * keep OFF for in-app shells unless FOH-9 decides otherwise.
   */
  draw?: boolean;
}) {
  // `dark` forces light ink for placement on a dark surface (e.g. the navy
  // footer) regardless of app theme. When omitted (e.g. the page header,
  // which goes dark in dark mode) the lockup follows the theme via tokens.
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 124 44"
      height={height}
      style={{ height, width: "auto" }}
      role="img"
      aria-label="DSO Hire"
      className={draw ? "lockup-draw" : undefined}
    >
      {/* Outer arch — rotated 90° CW so it opens LEFT with the curve on the
          right. Top arm extends right from x=5 to x=28 at y=5, curves down
          and around to a short vertical "spine" on the right (x=40, y=17→27),
          then curves down and around to the bottom arm extending left from
          x=28 back to x=5 at y=39. */}
      <path
        className={dark ? "lockup-arch" : "lockup-arch stroke-ink"}
        d="M 5 5 L 28 5 Q 40 5 40 17 L 40 27 Q 40 39 28 39 L 5 39"
        fill="none"
        stroke={dark ? "#F7F4ED" : undefined}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Heritage horizontal crossbar — implied H. Sits at the vertical
          midpoint of the mark, extending from inside the open left side to
          just shy of the inner curve on the right. */}
      <line
        className="lockup-bar stroke-heritage"
        x1="8"
        y1="22"
        x2="24"
        y2="22"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Vertical hairline divider between mark and wordmark */}
      <line
        className={dark ? "lockup-fade" : "lockup-fade stroke-border-2"}
        x1="52"
        y1="6"
        x2="52"
        y2="38"
        stroke={dark ? "rgba(247,244,237,0.18)" : undefined}
        strokeWidth="0.8"
      />
      {/* DSO wordmark, heavy weight — explicit textLength locks the width
          so the HIRE underneath matches exactly regardless of font rendering. */}
      <text
        className={dark ? "lockup-fade" : "lockup-fade fill-ink"}
        x="58"
        y="28"
        fontFamily="'Manrope', 'Helvetica Neue', Arial, sans-serif"
        fontSize="26"
        fontWeight="800"
        letterSpacing="-0.8"
        fill={dark ? "#F7F4ED" : undefined}
        textLength="52"
        lengthAdjust="spacingAndGlyphs"
      >
        DSO
      </text>
      {/* HIRE wordmark — same textLength as DSO above. lengthAdjust="spacing"
          means only inter-letter spacing is adjusted, not glyph widths. Drop
          letterSpacing so textLength is the only width driver. */}
      <text
        className="lockup-fade fill-heritage"
        x="58"
        y="38"
        fontFamily="'Manrope', 'Helvetica Neue', Arial, sans-serif"
        fontSize="9.5"
        fontWeight="500"
        textLength="52"
        lengthAdjust="spacing"
      >
        HIRE
      </text>
    </svg>
  );
}

// BrandMark moved to its own reusable primitive (used by tier-gate badges,
// etc.) — re-exported here so existing/marketing imports keep working.
export { BrandMark } from "@/components/brand/brand-mark";
