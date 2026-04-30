export default function Home() {
  return (
    <div className="min-h-screen bg-ivory text-ink flex flex-col">
      {/* ───────── NAV ───────── */}
      <nav className="fixed top-0 inset-x-0 z-50 h-[72px] px-8 sm:px-14 flex items-center justify-between backdrop-blur-md bg-ivory/85 border-b border-[rgba(20,35,63,0.08)]">
        <div className="flex items-center gap-3">
          <BrandMark />
          <span className="font-extrabold tracking-tight text-lg leading-none">
            DSO<span className="text-accent ml-1">Hire</span>
          </span>
        </div>
        <ul className="hidden md:flex items-center gap-9 list-none">
          <NavLink href="#for-dsos">For DSOs</NavLink>
          <NavLink href="#pricing">Pricing</NavLink>
          <NavLink href="#about">About</NavLink>
          <NavLink href="#contact">Contact</NavLink>
        </ul>
        <a
          href="#post-a-job"
          className="px-5 py-2.5 bg-ink text-ivory text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors"
        >
          Post a Job
        </a>
      </nav>

      {/* ───────── HERO ───────── */}
      <main className="flex-1 flex items-center pt-[140px] pb-28 px-8 sm:px-14 relative overflow-hidden">
        {/* Subtle 80px grid backdrop */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(20,35,63,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(20,35,63,0.08) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
            maskImage:
              "radial-gradient(ellipse at 30% 40%, #000 0%, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at 30% 40%, #000 0%, transparent 75%)",
          }}
        />
        {/* Heritage glow */}
        <div
          aria-hidden
          className="absolute -top-[15%] -right-[10%] w-[60vw] h-[60vw] pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(77,122,96,0.18), transparent 60%)",
            filter: "blur(40px)",
          }}
        />

        <div className="relative z-10 max-w-5xl mx-auto w-full">
          <div className="inline-flex items-center gap-3 mb-6">
            <span className="text-[10px] font-bold tracking-[3px] uppercase text-accent-deep">
              Built for Mid-Market DSOs
            </span>
            <span className="h-px w-12 bg-accent/40" />
          </div>

          <h1 className="text-5xl sm:text-7xl lg:text-[80px] font-extrabold tracking-[-0.02em] leading-[0.98] max-w-4xl">
            Multi-location hiring,
            <br />
            <span className="text-accent">one flat fee.</span>
          </h1>

          <p className="mt-8 max-w-2xl text-lg sm:text-xl text-slate-body leading-relaxed">
            The job board built for DSOs running 10 to 50 practice locations.
            Unlimited postings, no placement fees, no per-listing surcharges —
            priced for operators, not for staffing agencies.
          </p>

          <div className="mt-12 flex flex-col sm:flex-row gap-4">
            <a
              href="#post-a-job"
              className="inline-flex items-center justify-center px-8 py-4 bg-ink text-ivory text-[11px] font-bold tracking-[1.8px] uppercase hover:bg-ink-soft transition-colors"
            >
              Post a Job
            </a>
            <a
              href="#pricing"
              className="inline-flex items-center justify-center px-8 py-4 border border-ink text-ink text-[11px] font-bold tracking-[1.8px] uppercase hover:bg-ink hover:text-ivory transition-colors"
            >
              View Pricing
            </a>
          </div>

          <div className="mt-20 pt-10 border-t border-[rgba(20,35,63,0.08)]">
            <p className="text-[10px] font-semibold tracking-[2.5px] uppercase text-slate-meta mb-6">
              Foundation Live · Phase 2 Week 1 incoming
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-ink/10 max-w-3xl">
              <Stat label="Tech Stack" value="Locked" />
              <Stat label="Brand" value="Locked" />
              <Stat label="Pipeline" value="17 DSOs" />
              <Stat label="Target" value="$5–10K MRR" />
            </div>
          </div>
        </div>
      </main>

      {/* ───────── FOOTER ───────── */}
      <footer className="bg-ink text-ivory px-8 sm:px-14 py-10 text-[10px] tracking-[2px] uppercase font-semibold flex flex-col sm:flex-row gap-3 sm:gap-6 items-center justify-between">
        <div className="text-ivory/60">
          © 2026 DSO Hire LLC · Kansas
        </div>
        <div className="flex gap-6 text-ivory/60">
          <a href="/legal/privacy" className="hover:text-ivory transition-colors">
            Privacy
          </a>
          <a href="/legal/terms" className="hover:text-ivory transition-colors">
            Terms
          </a>
          <a href="mailto:cam@dsohire.com" className="hover:text-ivory transition-colors">
            cam@dsohire.com
          </a>
        </div>
      </footer>
    </div>
  );
}

/* ───────── tiny components ───────── */

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <a
        href={href}
        className="text-[11px] font-semibold tracking-[1.8px] uppercase text-slate-body hover:text-ink transition-colors"
      >
        {children}
      </a>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-cream p-4 sm:p-5">
      <div className="text-base sm:text-lg font-extrabold tracking-tight text-ink leading-tight">
        {value}
      </div>
      <div className="mt-1.5 text-[9px] font-semibold tracking-[1.8px] uppercase text-slate-meta">
        {label}
      </div>
    </div>
  );
}

function BrandMark() {
  // Bold Single Arch — outer Navy arch + Heritage inner accent arc.
  // Width-matched HIRE wordmark lives in the parent <span> via tracking + font-weight.
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="DSO Hire mark"
    >
      <path
        d="M3 28 V16 a13 13 0 0 1 26 0 V28"
        stroke="currentColor"
        strokeWidth="2.5"
        fill="none"
        className="text-ink"
        strokeLinecap="square"
      />
      <path
        d="M9 28 V18 a7 7 0 0 1 14 0 V28"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        className="text-accent"
        strokeLinecap="square"
      />
    </svg>
  );
}
