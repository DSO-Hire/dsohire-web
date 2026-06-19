/**
 * /unsubscribe — public, session-less unsubscribe confirmation + manage page
 * (Phase E8.14).
 *
 * Reached two ways, both of which complete the opt-out immediately (so the
 * action is never gated behind a second click — CAN-SPAM + RFC 8058):
 *   1. The visible "unsubscribe" footer link in a commercial email points here
 *      directly (?token=…). We apply the opt-out on load.
 *   2. The /api/unsubscribe GET handler applies the opt-out and redirects here
 *      with ?done=1 for a human-readable confirmation.
 *
 * The page offers a one-tap Resubscribe and a link to full preferences (which
 * does require login — that's fine, it's not the legal opt-out surface).
 */

import Link from "next/link";
import { Check, RotateCcw, AlertCircle } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import { verifyUnsubscribeToken } from "@/lib/notifications/unsubscribe-token";
import {
  applyCategoryUnsubscribe,
  type UnsubscribeResult,
} from "@/lib/notifications/unsubscribe";
import { getUnsubscribeCategory } from "@/lib/notifications/categories";
import { resubscribeAction } from "./actions";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Email preferences",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{
    token?: string;
    done?: string;
    status?: string;
    resubscribed?: string;
  }>;
}

export default async function UnsubscribePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const decoded = verifyUnsubscribeToken(sp.token);

  // Invalid / missing / tampered token.
  if (!decoded) {
    return (
      <Shell>
        <Eyebrow>Email preferences</Eyebrow>
        <Title>This unsubscribe link isn&apos;t valid.</Title>
        <Body>
          The link may be incomplete or have been altered. You can manage every
          email preference from your account settings instead.
        </Body>
        <ManageLinks />
      </Shell>
    );
  }

  const category = getUnsubscribeCategory(decoded.categoryKey);
  if (!category) {
    return (
      <Shell>
        <Eyebrow>Email preferences</Eyebrow>
        <Title>We couldn&apos;t find that email category.</Title>
        <Body>
          It may have been renamed. Manage all of your email preferences from
          your account settings.
        </Body>
        <ManageLinks />
      </Shell>
    );
  }

  const settingsHref =
    category.audience === "candidate"
      ? "/candidate/settings/notifications"
      : "/employer/settings/notifications";

  // Resubscribed state (came back from the Resubscribe action).
  if (sp.resubscribed === "1") {
    return (
      <Shell>
        <Eyebrow>Email preferences</Eyebrow>
        <Title>You&apos;re resubscribed.</Title>
        <Body>
          You&apos;ll once again receive{" "}
          <strong className="text-ink font-semibold">{category.label}</strong>{" "}
          emails. Change this anytime from your notification settings.
        </Body>
        <div className="mt-7">
          <Link
            href={settingsHref}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground text-[12px] font-bold tracking-[1.8px] uppercase hover:bg-primary/90 transition-colors"
          >
            Manage all preferences
          </Link>
        </div>
      </Shell>
    );
  }

  // Default path: apply the opt-out (idempotent — safe if /api already did it).
  const result: UnsubscribeResult = await applyCategoryUnsubscribe(
    decoded.userId,
    decoded.categoryKey
  );

  if (!result.ok) {
    return (
      <Shell>
        <Eyebrow>Email preferences</Eyebrow>
        <Title>
          <span className="inline-flex items-center gap-2">
            <AlertCircle className="h-7 w-7 text-danger" />
            Something went wrong.
          </span>
        </Title>
        <Body>
          We couldn&apos;t update your preferences just now. Please try the link
          again, or manage your preferences from settings.
        </Body>
        <ManageLinks />
      </Shell>
    );
  }

  return (
    <Shell>
      <Eyebrow>Email preferences</Eyebrow>
      <Title>
        <span className="inline-flex items-start gap-2.5">
          <span className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-heritage text-primary-foreground">
            <Check className="h-4 w-4" strokeWidth={3} />
          </span>
          You&apos;ve been unsubscribed.
        </span>
      </Title>
      <Body>
        You&apos;ll no longer receive{" "}
        <strong className="text-ink font-semibold">{category.label}</strong>{" "}
        emails. {category.description}
      </Body>
      <Body>
        Transactional emails — application receipts, direct messages, and account
        or billing notices — will still be sent, since they&apos;re required to
        use your account.
      </Body>

      <div className="mt-8 flex flex-wrap items-center gap-3.5">
        <form action={resubscribeAction}>
          <input type="hidden" name="token" value={sp.token} />
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-6 py-3 border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[1.8px] uppercase hover:border-ink transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Resubscribe
          </button>
        </form>
        <Link
          href={settingsHref}
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground text-[12px] font-bold tracking-[1.8px] uppercase hover:bg-primary/90 transition-colors"
        >
          Manage all preferences
        </Link>
      </div>
    </Shell>
  );
}

/* ───────────────────────── presentational ───────────────────────── */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SiteShell>
      <section className="pt-[140px] pb-28 px-6 sm:px-14 max-w-[720px] mx-auto">
        {children}
      </section>
    </SiteShell>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-4">
      {children}
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.1] text-ink mb-5">
      {children}
    </h1>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-base text-slate-body leading-[1.7] mb-3 max-w-[560px]">
      {children}
    </p>
  );
}

function ManageLinks() {
  return (
    <div className="mt-7 flex flex-wrap gap-3.5">
      <Link
        href="/employer/settings/notifications"
        className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground text-[12px] font-bold tracking-[1.8px] uppercase hover:bg-primary/90 transition-colors"
      >
        Employer settings
      </Link>
      <Link
        href="/candidate/settings/notifications"
        className="inline-flex items-center gap-2 px-6 py-3 border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[1.8px] uppercase hover:border-ink transition-colors"
      >
        Candidate settings
      </Link>
    </div>
  );
}
