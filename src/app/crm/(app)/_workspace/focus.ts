/* Keep Tab inside a dialog panel. Call from the panel's onKeyDown. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function trapTab(e: { key: string; shiftKey: boolean; preventDefault: () => void }, panel: HTMLElement | null) {
  if (e.key !== "Tab" || !panel) return;
  const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
  if (items.length === 0) {
    e.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (e.shiftKey && (active === first || !panel.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
    e.preventDefault();
    first.focus();
  }
}

/* True when a key event started in a field where typing should win. */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}
