/**
 * /help/[key] — individual help entry deep-link page.
 *
 * Public. Reads the entry from HELP_CONTENT by slug-decoded key,
 * renders title + tip + optional steps/bullets in a centered article
 * layout with SiteShell chrome. 404s on unknown keys.
 *
 * Generates static params for every registry key so the page is fully
 * static — fast + cacheable.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Mail, ShieldCheck } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import { HELP_CONTENT } from "@/lib/help/help-content";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/contact";

interface PageProps {
  params: Promise<{ key: string }>;
}

/** Slug → registry key (reverse of entryKeyToSlug in ../page.tsx). */
function slugToKey(slug: string): string {
  return slug.replace(/-/g, ".");
}

/** Find the entry; tolerant of slug ↔ key dotting differences. */
function findEntry(slug: string) {
  const candidates = [
    slug,
    slugToKey(slug),
    // Some keys use dots in a sub-namespace (e.g. cand.privacy); the
    // simple replace doesn't break those, but we also try the original
    // raw slug if it's exactly a key.
  ];
  for (const c of candidates) {
    if (HELP_CONTENT[c]) return { key: c, entry: HELP_CONTENT[c] };
  }
  return null;
}

export async function generateStaticParams() {
  return Object.keys(HELP_CONTENT).map((key) => ({
    key: key.replace(/\./g, "-"),
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { key: slug } = await params;
  const found = findEntry(slug);
  if (!found) {
    return {
      title: "Help · DSO Hire",
    };
  }
  return {
    title: `${found.entry.title} · Help · DSO Hire`,
    description: found.entry.tip,
  };
}

export default async function HelpEntryPage({ params }: PageProps) {
  const { key: slug } = await params;
  const found = findEntry(slug);
  if (!found) notFound();
  const { entry } = found;

  return (
    <SiteShell>
      <article className="mx-auto max-w-[760px] px-6 py-12 sm:py-16">
        <Link
          href="/help"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-meta hover:text-ink mb-8"
        >
          <ArrowLeft className="size-3.5" />
          All help articles
        </Link>

        <header className="mb-8 pb-6 border-b border-[var(--rule)]">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2 inline-flex items-center gap-2">
            <ShieldCheck className="size-3" />
            {lensLabel(entry.lens)}
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-[-0.8px] text-ink leading-tight">
            {entry.title}
          </h1>
          <p className="mt-4 text-[16px] text-slate-body leading-relaxed">
            {entry.tip}
          </p>
        </header>

        {entry.steps && entry.steps.length > 0 && (
          <section className="space-y-6 mb-10">
            {entry.steps.map((step, i) => (
              <div key={i}>
                {step.heading && (
                  <h2 className="font-display text-lg font-bold text-ink mb-2 leading-tight">
                    {step.heading}
                  </h2>
                )}
                <p className="text-[14.5px] text-slate-body leading-relaxed">
                  {step.body}
                </p>
              </div>
            ))}
          </section>
        )}

        {entry.bullets && entry.bullets.length > 0 && (
          <section className="mb-10">
            <ul className="list-disc pl-6 space-y-2">
              {entry.bullets.map((b, i) => (
                <li key={i} className="text-[14.5px] text-slate-body leading-relaxed">
                  {b}
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-12 pt-6 border-t border-[var(--rule)] space-y-4">
          <Link
            href="/help"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-heritage-deep hover:text-ink"
          >
            <ArrowLeft className="size-3.5" />
            More help articles
          </Link>
          <div className="border border-[var(--rule)] bg-cream/30 px-5 py-4 flex items-start gap-3">
            <Mail className="size-4 text-heritage-deep mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-slate-body leading-relaxed">
                Still stuck? Email{" "}
                <a
                  href={SUPPORT_MAILTO}
                  className="font-semibold text-heritage-deep underline underline-offset-2 hover:text-ink"
                >
                  {SUPPORT_EMAIL}
                </a>{" "}
                — a real human replies, usually within one business day.
              </p>
            </div>
            <a
              href={SUPPORT_MAILTO}
              className="inline-flex items-center gap-1 text-[11px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink whitespace-nowrap shrink-0"
            >
              Email
              <ArrowRight className="size-3" />
            </a>
          </div>
        </footer>
      </article>
    </SiteShell>
  );
}

function lensLabel(lens: "employer" | "candidate" | "both"): string {
  if (lens === "employer") return "For employers";
  if (lens === "candidate") return "For candidates";
  return "For everyone";
}
