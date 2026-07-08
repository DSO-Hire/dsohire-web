"use client";

/**
 * MessengerLauncher — single bottom-right launcher (Option B, 2026-07-08).
 * One FAB with the chat-bubble icon + live unread badge; opens a docked
 * panel with Messages | Help tabs. Replaces the separate ChatWidget FAB +
 * SupportLauncher "?" on the employer shell (candidate keeps its Help-only
 * SupportLauncher — candidates have no floating Messages surface).
 *
 * The top navy bar IS the tab strip (Messages | Help + X) — each tab's
 * content keeps its own contextual header (thread title / support context),
 * so we don't stack a third redundant title bar.
 *
 * ChatPanel stays MOUNTED while the panel is closed so its realtime
 * subscriptions and unread count keep feeding the badge. Keyboard: ? opens
 * on the Help tab (same typing guard as the old SupportLauncher); Esc closes.
 */

import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { ChatPanel } from "@/components/chat/chat-widget";
import { SupportContent } from "@/components/support/support-drawer";
import { useInputFocused } from "@/lib/ui/floating-ui";

type Tab = "messages" | "help";

export function MessengerLauncher({
  dsoId,
  authId,
  audience = "employer",
}: {
  dsoId: string;
  authId: string;
  audience?: "employer" | "candidate" | "both";
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("messages");
  const [unread, setUnread] = useState(0);
  const inputFocused = useInputFocused();

  // Global "?" opens Help (skip while typing — same guard as the old
  // SupportLauncher, which the /help page's OpenSupportButton relies on);
  // Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        setOpen(false);
        return;
      }
      if (e.key !== "?" || open) return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable) {
        return;
      }
      e.preventDefault();
      setTab("help");
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
    { key: "messages", label: "Messages" },
    { key: "help", label: "Help" },
  ];

  return (
    <>
      {/* Docked panel — kept mounted (hidden) so ChatPanel's realtime
          subscriptions + unread badge survive while closed. */}
      <div
        className={
          "fixed bottom-0 right-6 z-[56] print:hidden" + (open ? "" : " hidden")
        }
      >
        <div className="w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-5rem)] bg-card border border-[var(--rule-strong)] border-b-0 shadow-2xl rounded-t-lg overflow-hidden flex flex-col">
          {/* Tab strip (navy) — the panel's header bar. */}
          <div className="bg-hero text-hero-foreground flex items-stretch shrink-0">
            {TABS.map(({ key, label }) => {
              const activeTab = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  aria-selected={activeTab}
                  role="tab"
                  className={
                    "px-4 py-2.5 text-xs font-bold tracking-[0.5px] transition-opacity " +
                    (activeTab
                      ? "opacity-100 shadow-[inset_0_-2px_0_0_var(--heritage-bright)]"
                      : "opacity-60 hover:opacity-100")
                  }
                >
                  {label}
                  {key === "messages" && unread > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-heritage text-primary-foreground text-2xs font-bold align-middle">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </button>
              );
            })}
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="px-3 text-hero-foreground/80 hover:text-hero-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages — always mounted; hidden when the Help tab is up. */}
          <div
            className={
              "flex-1 min-h-0 flex-col " +
              (tab === "messages" ? "flex" : "hidden")
            }
          >
            <ChatPanel
              dsoId={dsoId}
              authId={authId}
              visible
              onUnreadChange={setUnread}
            />
          </div>

          {/* Help — mounted on demand; conversation persists via
              localStorage, so tab switches restore the thread. */}
          {tab === "help" && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <SupportContent
                audience={audience}
                authUserId={authId}
                onClose={() => setOpen(false)}
                active={open}
              />
            </div>
          )}
        </div>
      </div>

      {/* FAB — hidden while the panel is open (the panel's X closes). */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open messages and help"
          title="Messages & help — press ? for help"
          className={
            "fixed bottom-5 right-6 z-[55] size-14 rounded-full bg-primary text-primary-foreground shadow-lg opacity-80 hover:opacity-100 focus-visible:opacity-100 hover:bg-primary/90 transition duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-offset-2 flex items-center justify-center print:hidden" +
            // Yield on phones when a text field is focused (keeps desktop).
            (inputFocused ? " max-lg:hidden" : "")
          }
        >
          <MessageCircle className="size-6" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-heritage text-primary-foreground text-2xs font-bold flex items-center justify-center border-2 border-ivory">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      )}
    </>
  );
}
