"use client";

/**
 * SupportDrawer — Tier 1 in-app support contact form.
 *
 * Right slide-out drawer triggered by the global "?" button in the
 * shell or the "Open support" CTA on the help pages. Three sections:
 *
 *   1. Suggested articles — filtered from HELP_CONTENT by current URL
 *      pattern so the user sees the most relevant help docs first
 *      without searching. Click navigates to the public /help/[key]
 *      article page (opens in same tab since we want them to return
 *      to whatever they were doing if they didn't find their answer).
 *   2. Message form — textarea + character counter. Submits to
 *      /api/support/send which gathers DSO/role/tier/recent-activity
 *      context server-side and emails support@dsohire.com.
 *   3. Auto-attached context badge — transparent disclosure of what
 *      we're sending alongside the message so the user isn't surprised.
 *
 * State: closed → form → sending → sent (with "thanks, you'll hear back"
 * copy) → close. Reopening starts a fresh form.
 *
 * Tier 2 will swap the form for an AI chat surface inside the same
 * drawer chrome — the slide-out animation, header, and submit affordance
 * are intentionally reusable so the transition isn't jarring.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Lightbulb,
  Loader2,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { HELP_CONTENT, type HelpEntry } from "@/lib/help/help-content";

const MAX_BODY = 5000;
const MAX_SUGGESTIONS = 3;

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Audience determines which help entries are eligible to surface as
   * suggestions. Pass "employer" from EmployerShell, "candidate" from
   * CandidateShell, "both" from public surfaces.
   */
  audience: "employer" | "candidate" | "both";
}

export function SupportDrawer({ open, onClose, audience }: Props) {
  const pathname = usePathname() ?? "";
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Focus the textarea on open + reset state when (re)opening.
  useEffect(() => {
    if (open) {
      setError(null);
      setSent(false);
      // Short delay so the slide-in animation finishes first.
      const t = setTimeout(() => textareaRef.current?.focus(), 150);
      return () => clearTimeout(t);
    } else {
      // Reset body when closing so the next open is fresh.
      setBody("");
    }
  }, [open]);

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Suggested articles — filter the registry by the current URL pattern.
  const suggestions = useMemo(
    () => suggestArticles(pathname, audience),
    [pathname, audience]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    const trimmed = body.trim();
    if (!trimmed) {
      setError("Add a message before sending.");
      return;
    }
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/support/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: trimmed,
          page_url: typeof window !== "undefined" ? window.location.href : null,
          page_title:
            typeof document !== "undefined" ? document.title : null,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Couldn't send. Try again or email support directly.");
        setSending(false);
        return;
      }
      setSent(true);
      setSending(false);
    } catch (err) {
      console.error("[SupportDrawer] submit failed", err);
      setError("Network error. Check your connection and try again.");
      setSending(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={
          "fixed inset-0 z-40 bg-black/40 transition-opacity " +
          (open ? "opacity-100" : "opacity-0 pointer-events-none")
        }
      />
      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Support"
        className={
          "fixed top-0 right-0 z-50 h-full w-full sm:w-[440px] bg-white shadow-2xl flex flex-col transition-transform duration-200 ease-out " +
          (open ? "translate-x-0" : "translate-x-full")
        }
      >
        <header className="flex items-start justify-between gap-3 p-5 border-b border-[var(--rule)]">
          <div>
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1.5 inline-flex items-center gap-2">
              <ShieldCheck className="size-3" />
              Get help
            </div>
            <h2 className="font-display text-xl font-extrabold tracking-[-0.4px] text-ink leading-tight">
              We&apos;re a real human email away.
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close support"
            className="p-1.5 rounded text-slate-meta hover:text-ink hover:bg-cream/60"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {sent ? (
            <SentSuccess onClose={onClose} />
          ) : (
            <>
              {suggestions.length > 0 && (
                <section>
                  <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2 inline-flex items-center gap-1.5">
                    <Lightbulb className="size-3 text-heritage-deep" />
                    Might help — based on this page
                  </div>
                  <ul className="space-y-1">
                    {suggestions.map(({ key, entry }) => (
                      <li key={key}>
                        <Link
                          href={`/help/${key.replace(/\./g, "-")}`}
                          className="group flex items-start gap-2 px-3 py-2 -mx-3 rounded hover:bg-cream/60 transition-colors"
                          onClick={onClose}
                        >
                          <ChevronRight className="size-3.5 text-slate-meta mt-1 shrink-0 group-hover:text-heritage-deep group-hover:translate-x-0.5 transition-all" />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-ink text-[13px] leading-tight">
                              {entry.title}
                            </div>
                            <p className="mt-0.5 text-[11.5px] text-slate-meta leading-snug line-clamp-2">
                              {entry.tip}
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <form onSubmit={onSubmit} className="space-y-3">
                <label
                  htmlFor="support-body"
                  className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body"
                >
                  Your message
                </label>
                <textarea
                  ref={textareaRef}
                  id="support-body"
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value.slice(0, MAX_BODY));
                    setError(null);
                  }}
                  rows={6}
                  placeholder="What's going on? The more detail the better — we'll see exactly which page you're on automatically."
                  className="w-full resize-y min-h-[140px] max-h-[320px] px-4 py-3 bg-cream/30 border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage"
                />
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-meta">
                  <span>
                    {body.length}/{MAX_BODY}
                  </span>
                </div>

                {error && (
                  <div className="text-[12.5px] text-red-700 inline-flex items-start gap-1.5">
                    <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                    {error}
                  </div>
                )}

                <ContextDisclosure pathname={pathname} />

                <button
                  type="submit"
                  disabled={sending || body.trim().length === 0}
                  className="inline-flex w-full items-center justify-center gap-2 bg-ink text-ivory px-5 py-3 text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send className="size-3.5" />
                      Send to support
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function SentSuccess({ onClose }: { onClose: () => void }) {
  return (
    <div className="text-center py-8">
      <div className="inline-flex items-center justify-center size-12 rounded-full bg-heritage/[0.12] mb-4">
        <CheckCircle2 className="size-6 text-heritage-deep" />
      </div>
      <h3 className="font-display text-lg font-bold text-ink mb-2">
        Sent. Thanks for reaching out.
      </h3>
      <p className="text-[13px] text-slate-body leading-relaxed max-w-[320px] mx-auto mb-6">
        A real human reads every support message — typically a reply
        within one business day. Replies come straight to your email.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="inline-flex items-center justify-center px-5 py-2.5 border border-[var(--rule-strong)] text-ink text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-cream/60"
      >
        Close
      </button>
    </div>
  );
}

function ContextDisclosure({ pathname }: { pathname: string }) {
  return (
    <details className="border border-[var(--rule)] bg-cream/20 px-3 py-2 text-[11.5px] text-slate-meta">
      <summary className="cursor-pointer font-semibold text-ink/80 leading-snug">
        What we&apos;ll send along with your message
      </summary>
      <ul className="mt-2 space-y-1 list-disc pl-5">
        <li>
          Your account email + display name (so we can reply directly)
        </li>
        <li>Your DSO name + role + plan</li>
        <li>
          The page you&apos;re on:{" "}
          <code className="font-mono text-[11px] text-ink">{pathname}</code>
        </li>
        <li>Your last 5 in-app actions (helps us see what just happened)</li>
      </ul>
      <p className="mt-2">
        We don&apos;t send candidate PII or any other DSO&apos;s data.
      </p>
    </details>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Suggested articles — URL-pattern matching against HELP_CONTENT keys.
 *
 * v1 heuristic: each registry key has a "surface" inferred from its
 * dotted namespace prefix (jd.* → job posting wizard, pipeline.* →
 * kanban, inbox.* → messaging, settings.* → settings, etc.). The
 * pathname pattern below maps URL substrings to those prefixes; we
 * return entries whose key starts with the matched prefix, ranked
 * by registry order (already curated).
 *
 * Tier 2 will replace this with semantic matching (Claude scores each
 * entry's relevance to the page + recent activity). For Tier 1 the
 * substring map is enough to show the right thing on the most common
 * surfaces.
 * ────────────────────────────────────────────────────────── */

interface Suggestion {
  key: string;
  entry: HelpEntry;
}

const URL_TO_PREFIXES: Array<{ match: RegExp; prefixes: string[] }> = [
  { match: /\/employer\/jobs\/new|\/employer\/jobs\/[^/]+\/edit/, prefixes: ["jd."] },
  { match: /\/employer\/jobs\/[^/]+\/applications/, prefixes: ["pipeline."] },
  { match: /\/employer\/applications\//, prefixes: ["pipeline.", "inbox."] },
  { match: /\/employer\/inbox/, prefixes: ["inbox."] },
  { match: /\/employer\/talent-pool/, prefixes: ["talent.", "candidate.profile_view"] },
  { match: /\/employer\/billing/, prefixes: ["billing."] },
  { match: /\/employer\/locations\/bulk/, prefixes: ["locations.bulk_import", "locations."] },
  { match: /\/employer\/locations/, prefixes: ["locations.", "settings.affiliation"] },
  { match: /\/employer\/settings\/templates/, prefixes: ["settings.templates", "settings.custom_templates"] },
  { match: /\/employer\/settings\/account/, prefixes: ["settings.mfa"] },
  { match: /\/employer\/settings/, prefixes: ["settings."] },
  { match: /\/candidate\/profile/, prefixes: ["cand.onboarding", "cand.import", "cand.privacy"] },
  { match: /\/candidate\/applications/, prefixes: ["cand.applications", "cand.practice_fit"] },
  { match: /\/candidate\/settings/, prefixes: ["cand.privacy", "cand.credentials"] },
  { match: /\/candidate/, prefixes: ["cand."] },
];

function suggestArticles(
  pathname: string,
  audience: "employer" | "candidate" | "both"
): Suggestion[] {
  const matchedPrefixes: string[] = [];
  for (const rule of URL_TO_PREFIXES) {
    if (rule.match.test(pathname)) {
      for (const p of rule.prefixes) {
        if (!matchedPrefixes.includes(p)) matchedPrefixes.push(p);
      }
    }
  }
  // Fallback: if no rule matched, return a generic starter set.
  if (matchedPrefixes.length === 0) {
    matchedPrefixes.push(
      audience === "candidate" ? "cand.onboarding" : "jd.overview"
    );
  }

  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const prefix of matchedPrefixes) {
    for (const [key, entry] of Object.entries(HELP_CONTENT)) {
      if (out.length >= MAX_SUGGESTIONS) break;
      if (seen.has(key)) continue;
      // Exact-match keys (no trailing dot) OR prefix matches.
      const isExact = key === prefix;
      const isPrefix = prefix.endsWith(".") && key.startsWith(prefix);
      if (!isExact && !isPrefix) continue;
      // Audience filter.
      if (audience === "employer" && entry.lens === "candidate") continue;
      if (audience === "candidate" && entry.lens === "employer") continue;
      seen.add(key);
      out.push({ key, entry });
    }
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}
