"use client";

/**
 * DemoIntent: turns the live demo's strongest intent signals into leads.
 * Mounted by the employer layout ONLY for the demo viewer on the demo
 * deployment (isDemoDeployment() && isDemoViewerUser()).
 *
 * 1. Blocked action → ask. Every write in the demo is refused with
 *    DEMO_BLOCK_MESSAGE (74+ guarded actions, one central guard). Rather
 *    than touch each action, we watch server-action responses (POSTs
 *    carrying the Next-Action header) and, when one comes back with the
 *    block message, open "Want to do this for real?". Someone who just
 *    tried to post a job or send an offer is the warmest lead we get.
 * 2. Two-minute nudge. After ~2 minutes of visible time in the demo, a
 *    dismissible "Seeing enough?" card. Once per browser.
 * 3. ?for= personalization. The prospect label from the /demo link is
 *    passed in and rides along on every lead.
 *
 * Leads POST to PROD's /api/leads (the demo has its own database). Once a
 * visitor leaves a way to reach them, nothing asks again. Every ask is
 * dismissible; nothing blocks the product.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUpRight, X } from "lucide-react";
import { LeadHandoff } from "@/components/marketing/lead-handoff";
import { DEMO_BLOCK_MESSAGE } from "@/lib/demo/mode";
import { PROD_ORIGIN } from "@/lib/marketing/demo";

const MARKER = DEMO_BLOCK_MESSAGE.slice(0, 32); // survives RSC string encoding
const NUDGE_AFTER_MS = 120_000;
const K_LEAD = "dh-demo-lead"; // localStorage: they already left contact
const K_NUDGED = "dh-demo-nudged"; // localStorage: nudge shown once
const K_START = "dh-demo-start"; // sessionStorage: first demo page view
const K_ACTIVE = "dh-demo-active-ms"; // sessionStorage: visible time so far

type Mode = null | "blocked" | "nudge";

function safeGet(store: "local" | "session", key: string): string | null {
  try {
    return (store === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
function safeSet(store: "local" | "session", key: string, value: string) {
  try {
    (store === "local" ? window.localStorage : window.sessionStorage).setItem(key, value);
  } catch {
    /* storage blocked; the asks just won't remember */
  }
}

export function DemoIntent({ forLabel }: { forLabel: string | null }) {
  const pathname = usePathname();
  const [mode, setMode] = useState<Mode>(null);
  const [minimized, setMinimized] = useState(false);
  const blockedCount = useRef(0);
  const lastAction = useRef<string | null>(null);
  const group = forLabel ?? "your group";

  const hasLead = () => safeGet("local", K_LEAD) === "1";

  const onBlocked = useCallback(() => {
    blockedCount.current += 1;
    if (hasLead()) return;
    setMode("blocked");
    setMinimized(false);
  }, []);

  /* 1. Watch server-action responses for the demo block message. */
  useEffect(() => {
    const w = window as Window & { __dhDemoFetch?: typeof fetch };
    if (w.__dhDemoFetch) return;
    const original = window.fetch;
    w.__dhDemoFetch = original;
    window.fetch = async (input, init) => {
      const res = await original(input, init);
      try {
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        const hdrs = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        if (method === "POST" && hdrs.has("next-action")) {
          res
            .clone()
            .text()
            .then((body) => {
              if (body.includes(MARKER)) {
                lastAction.current = document.title || null;
                window.dispatchEvent(new CustomEvent("dh:demo-blocked"));
              }
            })
            .catch(() => {});
        }
      } catch {
        /* never interfere with the app's own request */
      }
      return res;
    };
    return () => {
      window.fetch = original;
      delete w.__dhDemoFetch;
    };
  }, []);

  useEffect(() => {
    window.addEventListener("dh:demo-blocked", onBlocked);
    return () => window.removeEventListener("dh:demo-blocked", onBlocked);
  }, [onBlocked]);

  /* 2. Two-minute nudge, counting only visible time, once per browser. */
  useEffect(() => {
    if (hasLead() || safeGet("local", K_NUDGED) === "1") return;
    if (!safeGet("session", K_START)) safeSet("session", K_START, String(Date.now()));
    let active = Number(safeGet("session", K_ACTIVE) ?? 0) || 0;
    let last = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === "visible") active += now - last;
      last = now;
      safeSet("session", K_ACTIVE, String(active));
      if (active >= NUDGE_AFTER_MS && !hasLead() && safeGet("local", K_NUDGED) !== "1") {
        safeSet("local", K_NUDGED, "1");
        setMode((m) => m ?? "nudge");
        window.clearInterval(id);
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  /* Escape closes. */
  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function dismiss() {
    if (mode === "blocked") setMinimized(true);
    else setMode(null);
  }

  if (!mode) return null;

  // After a dismissed blocked-ask, keep one small way back in.
  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed z-[70] right-6 bottom-[88px] inline-flex items-center gap-2 bg-heritage-deep text-ivory px-3.5 py-2 text-xs font-bold shadow-[0_14px_30px_-12px_rgba(7,15,28,0.6)] hover:bg-heritage transition-colors"
      >
        Want this for real?
        <ArrowUpRight className="size-3.5" />
      </button>
    );
  }

  const blocked = mode === "blocked";
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="dh-intent-title"
      className="fixed z-[70] right-4 sm:right-6 bottom-[88px] w-[min(380px,calc(100vw-2rem))] bg-hero text-ivory shadow-[0_30px_60px_-20px_rgba(7,15,28,0.65)] border border-ivory/10"
    >
      <span aria-hidden className="absolute top-0 inset-x-0 h-[3px] bg-heritage" />
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 grid place-items-center size-8 text-ivory/55 hover:text-ivory"
      >
        <X className="size-4" />
      </button>
      <div className="p-5 pr-10">
        <div className="text-2xs font-extrabold uppercase tracking-[1.4px] text-heritage-bright">
          {blocked ? "That was a real action" : forLabel ? `Prepared for ${forLabel}` : "Live demo"}
        </div>
        <h2 id="dh-intent-title" className="mt-1.5 text-lg font-extrabold tracking-[-0.02em] leading-snug">
          {blocked ? "Want to do this for real?" : "Seeing enough?"}
        </h2>
        <p className="mt-1.5 text-sm text-ivory/70 leading-relaxed">
          {blocked
            ? `The demo can't change data. Leave one way to reach you and we'll set up ${group === "your group" ? "your group's" : `${group}'s`} account.`
            : `Get a walkthrough built around ${group === "your group" ? "your locations and roles" : `${group}'s locations and roles`}.`}
        </p>
      </div>
      <div className="px-5 pb-5">
        <LeadHandoff
          kind="demo_request"
          audience="dso"
          tone="dark"
          endpoint={`${PROD_ORIGIN}/api/leads`}
          label="Work email or cell"
          cta="Reach out"
          fine="A person replies within one business day. No sequence, no autodialer."
          success="Got it. We'll reach out within one business day. Keep exploring."
          onDone={() => safeSet("local", K_LEAD, "1")}
          context={{
            trigger: blocked ? "blocked_action" : "demo_2min",
            page: pathname,
            screen: lastAction.current,
            for: forLabel,
            blocked_actions: blockedCount.current,
          }}
        />
        <a
          href={`${PROD_ORIGIN}/pricing`}
          target="_blank"
          rel="noopener"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ivory/60 hover:text-ivory transition-colors"
        >
          Or see plans and pricing
          <ArrowUpRight className="size-3" />
        </a>
      </div>
    </div>
  );
}
