/**
 * /auth/error — landing for any auth failure (expired link, missing code, etc.).
 *
 * Friendly message + path back to sign-in. The actual error reason is in
 * ?reason=... query param for debugging.
 */

import Link from "next/link";
import { SiteShell } from "@/components/marketing/site-shell";

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  return (
    <SiteShell>
      <section className="pt-[160px] pb-24 px-6 sm:px-14 max-w-[640px] mx-auto text-center">
        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-4">
          Sign-in problem
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.1] text-ink mb-5">
          That sign-in link didn&apos;t work.
        </h1>
        <p className="text-base text-slate-body leading-[1.7] mb-9">
          The link may have expired (links are single-use and last 15 minutes)
          or we couldn&apos;t verify the session. Request a fresh sign-in link below.
        </p>
        <div className="flex flex-wrap gap-3.5 justify-center">
          <Link
            href="/employer/sign-in"
            className="inline-flex items-center px-9 py-4 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
          >
            Request a New Link
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center px-9 py-[15px] border border-[var(--rule-strong)] text-ink text-[11px] font-bold tracking-[2px] uppercase hover:border-ink transition-colors"
          >
            Contact Support
          </Link>
        </div>
        {reason && (
          <p className="mt-12 text-[11px] text-slate-meta tracking-[0.5px]">
            Error code: <code className="font-mono">{reason}</code>
          </p>
        )}
      </section>
    </SiteShell>
  );
}
