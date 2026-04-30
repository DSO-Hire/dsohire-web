/**
 * /legal/[slug] — renders a single legal document from src/content/legal/.
 *
 * Server component: reads the markdown file at build/request time, runs it
 * through react-markdown + remark-gfm, and styles output with the .dso-prose
 * shared rules from globals.css.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { LEGAL_INDEX, loadLegalDoc, listLegalSlugs } from "@/lib/legal/loader";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return listLegalSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!LEGAL_INDEX.find((entry) => entry.slug === slug)) {
    return { title: "Not found" };
  }
  const doc = loadLegalDoc(slug);
  return {
    title: doc.title,
    description: `${doc.title} for DSO Hire LLC. Effective ${doc.effectiveDate}.`,
  };
}

export default async function LegalDocPage({ params }: PageProps) {
  const { slug } = await params;
  const entry = LEGAL_INDEX.find((e) => e.slug === slug);
  if (!entry) notFound();

  const doc = loadLegalDoc(slug);

  return (
    <article className="pt-[120px] pb-24 px-6 sm:px-14 max-w-[860px] mx-auto">
      {/* Back to index */}
      <Link
        href="/legal"
        className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-6"
      >
        ← All policies
      </Link>

      {/* Title block */}
      <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3">
        Legal
      </div>
      <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.1] text-ink mb-3">
        {doc.title}
      </h1>
      <div className="text-[11px] font-semibold tracking-[1.5px] uppercase text-slate-meta mb-10 pb-6 border-b border-[var(--rule)]">
        Effective {doc.effectiveDate} · DSO Hire LLC
      </div>

      {/* Body — rendered through .dso-prose for consistency with the Tiptap renderer */}
      <div className="dso-prose">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.body}</ReactMarkdown>
      </div>

      {/* Footer note */}
      <div className="mt-16 pt-8 border-t border-[var(--rule)]">
        <p className="text-[13px] text-slate-meta leading-relaxed">
          Questions? Email{" "}
          <a
            href="mailto:cam@dsohire.com"
            className="text-heritage underline underline-offset-2 hover:text-heritage-deep"
          >
            cam@dsohire.com
          </a>
          . See all{" "}
          <Link
            href="/legal"
            className="text-heritage underline underline-offset-2 hover:text-heritage-deep"
          >
            DSO Hire policies
          </Link>
          .
        </p>
      </div>
    </article>
  );
}
