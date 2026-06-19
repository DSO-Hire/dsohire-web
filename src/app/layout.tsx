import type { Metadata } from "next";
import { Manrope, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "DSO Hire — Dental hiring, done direct.",
    template: "%s · DSO Hire",
  },
  description:
    "Dental hiring, done direct. The hiring platform built for mid-market Dental Support Organizations — flat-fee, unlimited multi-location postings, no placement fees, no per-listing surcharges.",
  metadataBase: new URL("https://dsohire.com"),
  // ───────────────────────────────────────────────────────────────
  // PRE-LAUNCH INDEXING LOCKDOWN (testing period).
  // Every page on the site currently shows seeded / demo / test data
  // (DSOs, jobs, candidates). We do NOT want Google indexing any of it —
  // indexing fake job postings risks a Google for Jobs structured-data
  // policy strike against the whole domain, and surfaces fake content to
  // anyone who searches us. This site-wide noindex cascades to every page
  // that doesn't set its own `robots`. Paired with a hard Disallow in
  // robots.ts.
  // ⚠️ REMOVE THIS `robots` block (and relax robots.ts) at launch, once
  //    real data is in and we WANT to be indexed.
  // ───────────────────────────────────────────────────────────────
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
  openGraph: {
    type: "website",
    siteName: "DSO Hire",
    locale: "en_US",
  },
  // OG image, Twitter image, and apple-touch-icon are auto-wired by the
  // Next.js App Router file convention (opengraph-image.png, twitter-image.png,
  // apple-icon.png in src/app/). Explicit twitter.card here ensures Twitter
  // renders the large card variant rather than defaulting to summary.
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("h-full", "antialiased", manrope.variable, "font-sans", geist.variable)}
    >
      <head>
        {/* No-flash theme init — runs BEFORE first paint so a dark-preference
            load never flashes light. Reads the stored choice (dso-theme);
            "system" or unset follows prefers-color-scheme. The ThemeToggle
            owns it thereafter. Dependency-free + inline on purpose. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('dso-theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||((t==='system'||!t)&&m)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-ivory text-ink font-sans">
        {children}
      </body>
    </html>
  );
}
