"use client";

/**
 * SupportLauncher — floating bottom-right "?" button that opens the
 * SupportDrawer. Mount once per shell (EmployerShell / CandidateShell /
 * public SiteShell when we surface it there too).
 *
 * Hides itself when the drawer is open so the close affordance is the
 * drawer's own X button, not a duplicate trigger.
 *
 * Keyboard: ? key (shift+/) globally to open. Avoid hijacking when
 * the user is typing into an input/textarea/contenteditable.
 */

import { useEffect, useState } from "react";
import { HelpCircle } from "lucide-react";
import { SupportDrawer } from "./support-drawer";
import {
  setSupportDrawerOpen,
  useChatOpen,
  useInputFocused,
} from "@/lib/ui/floating-ui";

interface Props {
  audience: "employer" | "candidate" | "both";
  /** Threaded from the auth-gated shell. Null = signed-out; drawer
   *  shows a sign-in prompt instead of the chat surface. */
  authUserId: string | null;
  /** Raise the button above the docked chat bar (employer pages). */
  raised?: boolean;
}

export function SupportLauncher({ audience, authUserId, raised = false }: Props) {
  const [open, setOpen] = useState(false);
  const chatOpen = useChatOpen();
  const inputFocused = useInputFocused();

  // Tell the floating-UI coordinator when the help drawer is open so the
  // Messages widget yields the corner; clear on unmount.
  useEffect(() => {
    setSupportDrawerOpen(open);
    return () => setSupportDrawerOpen(false);
  }, [open]);

  // Global "?" shortcut. Skip when the user is typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "?" || open) return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const tag = t.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {!open && !chatOpen && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open support"
          title="Get help — press ?"
          className={
            "fixed right-5 z-30 size-12 rounded-full bg-ink text-ivory shadow-lg opacity-70 hover:opacity-100 focus-visible:opacity-100 hover:bg-ink-soft transition duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-offset-2 flex items-center justify-center " +
            // Sit higher on mobile so it clears the wider docked Messages bar.
            (raised ? "bottom-[5.5rem] lg:bottom-[4.5rem] " : "bottom-5 ") +
            // Yield on phones when a text field is focused (keeps desktop).
            (inputFocused ? "max-lg:hidden" : "")
          }
        >
          <HelpCircle className="size-5" />
        </button>
      )}
      <SupportDrawer
        open={open}
        onClose={() => setOpen(false)}
        audience={audience}
        authUserId={authUserId}
      />
    </>
  );
}
