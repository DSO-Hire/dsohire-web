/**
 * <ComingSoonCard> — shared placeholder for the Phase 4.3 settings
 * tabs that haven't been built out yet (job-preferences, privacy,
 * credentials, data). Each tab gets its own page that mounts this
 * component with tab-specific copy.
 *
 * Server component — no interactivity needed. When the underlying
 * tab ships, swap out the content but keep the route stable so any
 * shared deep links the candidate has remain valid.
 */

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

interface ComingSoonCardProps {
  /** Tab title — shown as the H2. */
  title: string;
  /** Brief description of what the tab will eventually do. */
  description: string;
  /** Optional bulleted list of features that will live here. */
  features?: ReadonlyArray<string>;
  /** Optional link suggestions while this tab is empty. */
  alternatives?: ReadonlyArray<{ label: string; href: string }>;
}

export function ComingSoonCard({
  title,
  description,
  features,
  alternatives,
}: ComingSoonCardProps) {
  return (
    <div className="space-y-6">
      <section className="border border-[var(--rule)] bg-card p-7 sm:p-9">
        <h2 className="font-display text-xl font-bold text-foreground">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <div className="mt-5 flex items-start gap-3 rounded-md border border-heritage/30 bg-muted p-4">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-heritage" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-foreground">
              We&apos;re building this tab.
            </p>
            <p className="mt-0.5 text-muted-foreground">
              The IA is locked, the schema&apos;s in place, and your
              preferences here will carry over once the tab ships. No need
              to come back and reconfigure.
            </p>
            {features && features.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">
                {features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {alternatives && alternatives.length > 0 && (
        <section className="border border-[var(--rule)] bg-cream p-7">
          <p className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
            What you can do today
          </p>
          <ul className="list-none space-y-2">
            {alternatives.map((alt) => (
              <li key={alt.href}>
                <Link
                  href={alt.href}
                  className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-heritage hover:text-heritage-deep"
                >
                  {alt.label}
                  <ArrowRight className="size-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
