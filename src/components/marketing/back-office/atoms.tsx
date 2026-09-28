/**
 * Drawn-UI twins of real product atoms, sized for the showcase frame.
 * Markup only; every label comes from story.ts (which imports the
 * source-of-truth modules).
 */

import { cn } from "@/lib/utils";

export function Panel({
  className,
  children,
  ...rest
}: { className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-card border border-[var(--rule)] shadow-[0_1px_0_rgba(20,35,63,0.04),0_8px_24px_-18px_rgba(20,35,63,0.25)]",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Kicker({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("text-2xs font-bold uppercase tracking-[1.4px] text-slate-meta", className)}>
      {children}
    </div>
  );
}

export function FitBadge({ fit, strong }: { fit: number; strong?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 text-2xs font-bold tabular whitespace-nowrap",
        strong ? "bg-heritage text-ivory" : "bg-heritage/12 text-heritage-deep"
      )}
    >
      <span aria-hidden>✦</span>
      {fit}
    </span>
  );
}

export function Avatar({
  initials,
  tone = "ink",
  size = 28,
  masked,
}: {
  initials: string;
  tone?: "ink" | "heritage" | "slate";
  size?: number;
  masked?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid place-items-center shrink-0 font-extrabold text-ivory",
        masked
          ? "bg-[repeating-linear-gradient(135deg,rgba(20,35,63,0.14)_0_4px,rgba(20,35,63,0.06)_4px_8px)] text-ink/55"
          : tone === "heritage"
            ? "bg-heritage"
            : tone === "slate"
              ? "bg-slate-body"
              : "bg-ink"
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {masked ? "?" : initials}
    </span>
  );
}

/** A faux button the cursor can target. Visual only (the stage is aria-hidden
 *  for interaction purposes; captions carry the meaning). */
export function FauxButton({
  cur,
  variant = "primary",
  pressed,
  className,
  children,
}: {
  cur?: string;
  variant?: "primary" | "heritage" | "outline" | "ai";
  pressed?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      data-cur={cur}
      className={cn(
        "bx-btn inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold whitespace-nowrap select-none",
        variant === "primary" && "bg-ink text-ivory",
        variant === "heritage" && "bg-heritage text-ivory",
        variant === "outline" && "border border-[var(--rule-strong)] bg-card text-ink",
        variant === "ai" && "bx-ai-btn text-ivory",
        pressed && "is-pressed",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Floating notification (toast / automation card). */
export function Toast({
  on,
  tone = "ink",
  icon,
  kicker,
  title,
  sub,
  className,
}: {
  on: boolean;
  tone?: "ink" | "heritage";
  icon?: React.ReactNode;
  kicker?: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-on={on ? "true" : "false"}
      className={cn(
        "bx-toast absolute z-30 w-[min(320px,calc(100%-24px))] px-4 py-3 text-ivory shadow-[0_24px_48px_-16px_rgba(10,20,40,0.55)]",
        tone === "heritage" ? "bg-heritage-deep" : "bg-hero",
        className
      )}
    >
      <div className="flex items-start gap-2.5">
        {icon && <span className="mt-0.5 shrink-0 text-heritage-bright">{icon}</span>}
        <div className="min-w-0">
          {kicker && (
            <div className="text-2xs font-extrabold uppercase tracking-[1.3px] text-heritage-bright mb-1">
              {kicker}
            </div>
          )}
          <div className="text-xs font-bold leading-snug">{title}</div>
          {sub && <div className="text-2xs text-ivory/60 mt-1 leading-snug">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

export function SceneTitle({
  title,
  sub,
  right,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-4 flex-wrap">
      <div className="min-w-0">
        <div className="text-base sm:text-lg font-extrabold tracking-[-0.02em] text-ink leading-tight">
          {title}
        </div>
        {sub && <div className="text-2xs text-slate-meta mt-1">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function LivePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-heritage/10 text-heritage-deep text-2xs font-extrabold uppercase tracking-[1.2px] whitespace-nowrap">
      <span aria-hidden className="bx-live size-1.5 bg-heritage" />
      {children}
    </span>
  );
}
