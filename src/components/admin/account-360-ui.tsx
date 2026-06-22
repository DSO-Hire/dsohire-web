/**
 * Shared presentational bits for the Account 360 pages (Tranche 1, Phase 3).
 * Server-safe (no hooks). Pure layout — data passed in.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function BackLink() {
  return (
    <Link
      href="/admin/search"
      className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-6"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Search
    </Link>
  );
}

export function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[var(--rule)] bg-card p-5">
      <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
        {title}
      </div>
      {children}
    </section>
  );
}

export function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1 text-[13px]">
      <span className="text-slate-meta">{k}</span>
      <span className="text-ink font-semibold text-right">{v}</span>
    </div>
  );
}

export function HealthChips({ flags }: { flags: string[] }) {
  if (flags.length === 0) return null;
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {flags.map((h) => (
        <span
          key={h}
          className="inline-block px-2 py-1 text-[10px] font-bold tracking-[0.5px] uppercase text-danger bg-danger/10"
        >
          {h}
        </span>
      ))}
    </div>
  );
}
