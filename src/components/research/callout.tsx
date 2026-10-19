/**
 * Callout: the report's "aside-note". Three tones:
 *   - note:    context or a reading tip
 *   - calc:    a DSO Hire calculation (formula shown, inputs cited)
 *   - caveat:  a conflict, a gap, or a vendor figure to discount
 */

import { cn } from "@/lib/utils";

const TONES = {
  note: { label: "Note", box: "border-heritage bg-card", eyebrow: "text-heritage-deep" },
  calc: {
    label: "DSO Hire calculation",
    box: "border-ink bg-[var(--heritage-tint)]",
    eyebrow: "text-ink",
  },
  caveat: { label: "Caveat", box: "border-stage-bronze bg-card", eyebrow: "text-stage-bronze" },
} as const;

export function Callout({
  tone = "note",
  label,
  children,
  className,
}: {
  tone?: keyof typeof TONES;
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <aside
      className={cn(
        "my-8 max-w-[720px] border-l-[3px] px-5 sm:px-6 py-5 text-sm leading-[1.65] text-slate-body",
        "[&_p+p]:mt-2.5 [&_strong]:text-ink [&_strong]:font-bold",
        t.box,
        className,
      )}
    >
      <div className={cn("text-2xs font-bold uppercase tracking-[1.5px] mb-2", t.eyebrow)}>
        {label ?? t.label}
      </div>
      {children}
    </aside>
  );
}
