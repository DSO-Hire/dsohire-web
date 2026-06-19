/**
 * Custom 404 page (Next.js convention — auto-served for any unmatched route).
 *
 * Goals:
 *   1. On-brand (not Next's stock gray page).
 *   2. Funnel lost visitors back via the dual-lens doorway pattern that
 *      mirrors the homepage — so an arriving DSO or dental professional
 *      gets straight to where they were trying to go.
 *   3. Stay warm + light — a page-not-found shouldn't feel like a dead end.
 */

import Link from "next/link";
import { ArrowRight, Building2, Home, Stethoscope } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found · DSO Hire",
  description:
    "This page doesn't exist. Hiring across your practices, or looking for your next dental role? Either way, we'll get you back on track.",
};

export default function NotFound() {
  return (
    <SiteShell>
      <section className="relative overflow-hidden pt-[140px] pb-24 px-6 sm:px-14">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(var(--rule) 1px, transparent 1px), linear-gradient(90deg, var(--rule) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
            maskImage:
              "radial-gradient(ellipse at 50% 30%, #000 0%, transparent 72%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at 50% 30%, #000 0%, transparent 72%)",
          }}
        />
        <div
          aria-hidden
          className="absolute -top-[18%] left-1/2 -translate-x-1/2 w-[60vw] h-[60vw] pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, var(--heritage-glow), transparent 60%)",
            filter: "blur(40px)",
          }}
        />

        <div className="relative z-10 max-w-[820px] mx-auto text-center">
          <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-4">
            Error 404
          </div>
          <h1 className="text-5xl sm:text-7xl font-extrabold tracking-[-0.025em] leading-[1.02] text-ink mb-5">
            This page took a personal day.
          </h1>
          <p className="text-lg text-slate-body leading-relaxed max-w-[560px] mx-auto mb-12">
            The link might be broken, the page may have moved, or it simply
            doesn&apos;t exist. Here&apos;s where to go from here.
          </p>

          {/* Dual-lens funnel — mirrors the homepage doorways in mini */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
            <Link
              href="/for-dental-groups"
              className="group bg-hero hover:bg-hero/90 text-hero-foreground p-6 motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-1"
              style={{
                boxShadow: "0 18px 36px -18px rgba(7,15,28,0.30)",
              }}
            >
              <span className="inline-flex items-center justify-center w-9 h-9 mb-3 bg-ivory text-ink" aria-hidden>
                <Building2 className="h-4 w-4" />
              </span>
              <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-hero-foreground/65 mb-1">
                Dental Groups
              </div>
              <div className="text-[18px] font-extrabold tracking-[-0.4px] leading-tight text-hero-foreground mb-4">
                Hiring across your practices
              </div>
              <span className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[1.8px] uppercase text-hero-foreground/85 group-hover:text-hero-foreground transition-colors">
                Go to /for-dental-groups
                <ArrowRight className="h-3.5 w-3.5 motion-safe:transition-transform motion-safe:group-hover:translate-x-1" />
              </span>
            </Link>

            <Link
              href="/for-candidates"
              className="group bg-heritage hover:bg-heritage-deep text-hero-foreground p-6 motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-1"
              style={{
                boxShadow: "0 18px 36px -18px rgba(7,15,28,0.30)",
              }}
            >
              <span className="inline-flex items-center justify-center w-9 h-9 mb-3 bg-ivory text-heritage-deep" aria-hidden>
                <Stethoscope className="h-4 w-4" />
              </span>
              <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-hero-foreground/65 mb-1">
                Job Candidates
              </div>
              <div className="text-[18px] font-extrabold tracking-[-0.4px] leading-tight text-hero-foreground mb-4">
                Find your next dental role
              </div>
              <span className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[1.8px] uppercase text-hero-foreground/85 group-hover:text-hero-foreground transition-colors">
                Go to /for-candidates
                <ArrowRight className="h-3.5 w-3.5 motion-safe:transition-transform motion-safe:group-hover:translate-x-1" />
              </span>
            </Link>
          </div>

          {/* Tertiary — back home / browse jobs / contact */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-[12px] font-bold tracking-[1.8px] uppercase">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-slate-body hover:text-ink transition-colors"
            >
              <Home className="h-3.5 w-3.5" />
              Back home
            </Link>
            <Link
              href="/jobs"
              className="text-slate-body hover:text-ink transition-colors"
            >
              Browse Jobs
            </Link>
            <Link
              href="/contact"
              className="text-slate-body hover:text-ink transition-colors"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
