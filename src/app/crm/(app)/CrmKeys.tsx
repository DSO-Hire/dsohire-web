"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { isTypingTarget, trapTab } from "./_workspace/focus";
import { GO_TO, HELP_EVENT, PALETTE_EVENT, SHORTCUTS, type PaletteMode } from "./_workspace/shortcuts";

/*
 * Global single-key shortcuts for the CRM, plus the ? help overlay.
 * Ignored while typing in a field or with a modifier held (Cmd-K belongs
 * to the palette). "g" then a letter within 1.2s jumps to a page.
 */
export function ShortcutTable() {
  return (
    <div className="ws-keys-grid">
      {SHORTCUTS.map((g) => (
        <table key={g.group} className="ws-keys-tbl">
          <caption>{g.group.toUpperCase()}</caption>
          <tbody>
            {g.items.map((s) => (
              <tr key={`${g.group}-${s.label}-${s.keys.join("")}`}>
                <th scope="row">
                  {s.keys.map((k, i) => (
                    <span key={i}>
                      {i > 0 ? <span className="ws-then"> then </span> : null}
                      <kbd>{k}</kbd>
                    </span>
                  ))}
                </th>
                <td>{s.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

function palette(mode: PaletteMode) {
  window.dispatchEvent(new CustomEvent(PALETTE_EVENT, { detail: { mode } }));
}

export default function CrmKeys() {
  const router = useRouter();
  const [help, setHelp] = useState(false);
  const pendingG = useRef<number>(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const openHelp = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement;
    setHelp(true);
  }, []);
  const closeHelp = useCallback(() => {
    setHelp(false);
    const back = returnFocus.current;
    requestAnimationFrame(() => back?.focus?.());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && help) {
        e.preventDefault();
        closeHelp();
        return;
      }
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (isTypingTarget(e.target)) return;
      /* leave keys alone while another dialog (the palette) is open */
      if (document.querySelector(".ck-overlay.open")) return;

      const k = e.key.toLowerCase();
      if (pendingG.current && Date.now() - pendingG.current < 1200) {
        pendingG.current = 0;
        const dest = GO_TO[k];
        if (dest) {
          e.preventDefault();
          if (help) setHelp(false);
          router.push(dest);
        }
        return;
      }
      if (k === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        if (help) closeHelp();
        else openHelp();
        return;
      }
      if (help) return;
      if (k === "g") {
        pendingG.current = Date.now();
        return;
      }
      if (k === "/") {
        e.preventDefault();
        palette("search");
      } else if (k === "c") {
        e.preventDefault();
        palette("create");
      } else if (k === "n") {
        e.preventDefault();
        palette("note");
      }
    };
    const onHelp = () => openHelp();
    window.addEventListener("keydown", onKey);
    window.addEventListener(HELP_EVENT, onHelp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(HELP_EVENT, onHelp);
    };
  }, [help, router, openHelp, closeHelp]);

  useEffect(() => {
    if (!help) return;
    const t = setTimeout(() => panelRef.current?.querySelector<HTMLElement>("button")?.focus(), 30);
    return () => clearTimeout(t);
  }, [help]);

  return (
    <>
      <button
        type="button"
        className="ws-helpbtn"
        onClick={openHelp}
        aria-haspopup="dialog"
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts (?)"
      >
        ?
      </button>
      {help ? (
        <div
          className="ws-help-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeHelp();
          }}
        >
          <div
            className="ws-help"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ws-help-title"
            onKeyDown={(e) => trapTab(e, panelRef.current)}
          >
            <div className="ws-help-hd">
              <h2 id="ws-help-title">Keyboard shortcuts</h2>
              <button type="button" className="dbtn dbtn-line dbtn-sm" onClick={closeHelp}>
                Close
              </button>
            </div>
            <ShortcutTable />
            <p className="ws-help-note">Single keys are ignored while you are typing in a field.</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
