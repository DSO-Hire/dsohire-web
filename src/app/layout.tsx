import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { isIndexingAllowed } from "@/lib/launch/gate";

// Geist (the Next.js template default) was removed 2026-07-06 — it was
// dead weight: globals.css `@theme inline` already forces the font-sans
// utility to Manrope, so Geist shipped bytes to every visitor and never
// rendered. Manrope is the only UI typeface.
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
  // ENV-DRIVEN INDEXING GATE — shared with robots.ts via isIndexingAllowed()
  // so the two can never disagree. noindex applies whenever the site hasn't
  // launched (PREVIEW_GATE_DISABLED unset/false) OR this is the demo
  // deployment (DEMO_SITE=true on demo.dsohire.com, which serves seeded
  // demo data and must never be indexed — fake JobPostings risk a Google
  // for Jobs structured-data policy strike against the whole domain).
  // Launch day on prod: set PREVIEW_GATE_DISABLED=true and redeploy — the
  // noindex disappears automatically. No code edit needed.
  // ───────────────────────────────────────────────────────────────
  ...(isIndexingAllowed()
    ? {}
    : {
        robots: {
          index: false,
          follow: false,
          googleBot: { index: false, follow: false },
        },
      }),
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
      className={cn("h-full", "antialiased", manrope.variable, "font-sans")}
    >
      <head>
        {/* No-flash theme init — runs BEFORE first paint so a dark-preference
            load never flashes light. Light is the hard default: dark applies
            only when explicitly chosen (dso-theme='dark'). The ThemeToggle
            owns it thereafter. Dependency-free + inline on purpose. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('dso-theme');if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
        {/* No-flash text-size init — applies the stored text-scale multiplier
            (dso-text-scale) before first paint so Large/Larger never flashes
            at the default size. The TextSizeToggle owns it thereafter. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('dso-text-scale');if(s==='1.11'||s==='1.22'){document.documentElement.style.setProperty('--text-scale',s);}}catch(e){}})();`,
          }}
        />
        {/* Vantage analytics beacon — first-party, cookieless. Fires a pageview
            on load and on every SPA navigation (patches history.pushState +
            popstate). No cookies, no localStorage, no device storage of any
            kind; sends only {n,u,r} with the query stripped to the attribution
            whitelist. Skips automated browsers. Dependency-free + inline so it
            runs before hydration; neutral path /p/e for ad-blocker resilience. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(navigator.webdriver)return;var A=['utm_source','utm_medium','utm_campaign','utm_term','utm_content','ref','source'];function s(){try{var p=new URLSearchParams(location.search),k=new URLSearchParams();for(var i=0;i<A.length;i++){var v=p.get(A[i]);if(v)k.set(A[i],v);}var q=k.toString(),u=location.pathname+(q?'?'+q:''),d=JSON.stringify({n:'pageview',u:u,r:document.referrer});if(navigator.sendBeacon){navigator.sendBeacon('/p/e',d);}else{var g=new Image();g.src='/p/e?n=pageview&u='+encodeURIComponent(u)+'&r='+encodeURIComponent(document.referrer);}}catch(e){}}s();var h=history.pushState;if(h){history.pushState=function(){h.apply(this,arguments);s();};addEventListener('popstate',s);}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-ivory text-ink font-sans">
        {children}
      </body>
    </html>
  );
}
