/**
 * <EmptyState /> — BOH Remodel Lane 1 (Day 32, Model 08 engineering note).
 *
 * ONE empty-state pattern for the whole app: icon, one true sentence,
 * one action. The first-week experience is mostly empty states — this
 * makes them designed instead of incidental. Server-safe; surfaces
 * adopt it lane by lane (zero consumers tonight by design).
 *
 *   <EmptyState
 *     icon={<Inbox className="h-5 w-5" />}
 *     title="No conversations yet"
 *     body="When a candidate writes back, the thread lands here."
 *     action={<Link href="/employer/applications" className="...">Review applications</Link>}
 *   />
 *
 * Rules: `body` is ONE sentence that tells the truth about why it's
 * empty; `action` is the single most useful next step — never a list.
 */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border border-[var(--rule-strong)] bg-cream px-8 py-12 text-center">
      {icon && (
        <span
          aria-hidden
          className="mx-auto mb-4 flex h-11 w-11 items-center justify-center text-heritage-deep"
          style={{ background: "var(--heritage-tint)" }}
        >
          {icon}
        </span>
      )}
      <div className="text-[15px] font-extrabold tracking-[-0.3px] text-ink">
        {title}
      </div>
      {body && (
        <p className="mx-auto mt-1.5 max-w-[420px] text-[13px] leading-[1.7] text-slate-body">
          {body}
        </p>
      )}
      {action && <div className="mt-5 inline-flex">{action}</div>}
    </div>
  );
}
