import Link from "next/link";
import { IcEmpty } from "./icons";
import PaletteButton from "./_workspace/PaletteButton";
import type { PaletteMode } from "./_workspace/shortcuts";

/*
 * One empty state for the CRM: a quiet glyph, a plain title, an optional
 * line of help and one optional action (a link, or a palette mode).
 * Server-safe. Pass card to wrap it in its own .dcardx.
 */
export default function EmptyState({
  title,
  body,
  action,
  card = false,
  compact = false,
}: {
  title: string;
  body?: string;
  action?: { href?: string; label: string; event?: PaletteMode };
  card?: boolean;
  compact?: boolean;
}) {
  const inner = (
    <div className={`ws-empty${compact ? " compact" : ""}`}>
      <span className="ws-empty-ico" aria-hidden="true">
        <IcEmpty />
      </span>
      <div className="ws-empty-text">
        <b>{title}</b>
        {body ? <span>{body}</span> : null}
        {action ? (
          <span className="ws-empty-act">
            {action.href ? (
              <Link className="dbtn dbtn-line dbtn-sm" href={action.href}>
                {action.label}
              </Link>
            ) : action.event ? (
              <PaletteButton mode={action.event} label={action.label} className="dbtn dbtn-line dbtn-sm" />
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
  return card ? <div className="dcardx">{inner}</div> : inner;
}
