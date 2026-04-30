/**
 * /contact — contact form that emails cam@dsohire.com via Resend.
 *
 * Spam mitigation per the schema sketch:
 *   - Honeypot field (`website` hidden input) — bots fill it, humans don't
 *   - Server-side validation
 *   - Rate-limit middleware (TODO Week 4 — add IP-based rate limit)
 */

import Link from "next/link";
import { SiteShell } from "@/components/marketing/site-shell";
import { ContactForm } from "./contact-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with DSO Hire. Email cam@dsohire.com or use the contact form.",
};

export default function ContactPage() {
  return (
    <SiteShell>
      <section className="pt-[140px] pb-24 px-6 sm:px-14 max-w-[1100px] mx-auto">
        <div className="flex items-center gap-3.5 mb-8">
          <span className="block w-7 h-px bg-heritage" />
          <span className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep">
            Contact
          </span>
        </div>
        <h1 className="text-4xl sm:text-7xl font-extrabold tracking-[-2px] leading-[1.02] text-ink mb-6 max-w-[820px]">
          Talk to Cameron.
        </h1>
        <p className="text-lg sm:text-xl text-slate-body leading-relaxed max-w-[640px] mb-14">
          The fastest way to get a real answer is to email me directly. The
          form below routes to the same inbox.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-px bg-[var(--rule)] border border-[var(--rule)]">
          {/* Form column */}
          <div className="bg-white p-8 sm:p-10">
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-5">
              Send a Message
            </div>
            <ContactForm />
          </div>

          {/* Direct contact column */}
          <div className="bg-cream p-8 sm:p-10">
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-5">
              Direct
            </div>
            <ul className="list-none space-y-7">
              <ContactRow label="Email">
                <Link
                  href="mailto:cam@dsohire.com"
                  className="text-[15px] font-semibold text-ink hover:text-heritage-deep transition-colors"
                >
                  cam@dsohire.com
                </Link>
              </ContactRow>
              <ContactRow label="Founding Customers">
                <Link
                  href="mailto:cam@dsohire.com?subject=Founding%20customer%20interest"
                  className="text-[15px] font-semibold text-ink hover:text-heritage-deep transition-colors"
                >
                  Apply for Founding tier
                </Link>
              </ContactRow>
              <ContactRow label="Press / partnerships">
                <Link
                  href="mailto:cam@dsohire.com?subject=Press%20%2F%20partnership%20inquiry"
                  className="text-[15px] font-semibold text-ink hover:text-heritage-deep transition-colors"
                >
                  Send a partnership inquiry
                </Link>
              </ContactRow>
              <ContactRow label="Legal / DPA / Compliance">
                <Link
                  href="mailto:cam@dsohire.com?subject=Legal%20%2F%20DPA%20inquiry"
                  className="text-[15px] font-semibold text-ink hover:text-heritage-deep transition-colors"
                >
                  Request a DPA or legal review
                </Link>
              </ContactRow>
              <ContactRow label="DMCA notices">
                <Link
                  href="/legal/dmca"
                  className="text-[15px] font-semibold text-ink hover:text-heritage-deep transition-colors"
                >
                  See takedown procedure
                </Link>
              </ContactRow>
            </ul>

            <div className="mt-12 pt-8 border-t border-[var(--rule)]">
              <div className="text-[9px] font-bold tracking-[2.5px] uppercase text-slate-meta mb-2">
                DSO Hire LLC
              </div>
              <p className="text-[13px] text-slate-body leading-[1.7]">
                Kansas, USA · Founded 2026 · Built and operated by Cameron
                Eslinger.
              </p>
            </div>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

function ContactRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <div className="text-[9px] font-bold tracking-[2px] uppercase text-slate-meta mb-1.5">
        {label}
      </div>
      <div>{children}</div>
    </li>
  );
}
