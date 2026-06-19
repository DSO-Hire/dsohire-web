"use client";

/**
 * SharedCommandPalette — the ⌘K palette machinery, extracted from the
 * employer palette (Phase 4.6.e) for Lane 7 (Career HQ, Model 06) so
 * BOTH sides of the house share one implementation.
 *
 * The machinery (portal, ⌘K binding, debounce, keyboard nav, grouped
 * render, footer) moved here VERBATIM — only the employer-specific
 * constants (search action, group meta, placeholder, hint copy) became
 * props. The employer wrapper passes its original config so employer
 * behavior is unchanged; the candidate wrapper adds the new side.
 *
 * Wrappers import their own server action and hand it in as `search` —
 * this file stays dependency-free of either side's server code.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Command as CommandIcon,
  Loader2,
  Search,
} from "lucide-react";

export interface PaletteResult {
  group: string;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

export interface PaletteGroupMeta {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface PaletteConfig {
  /** Debounced server action: query → grouped results. */
  search: (
    query: string
  ) => Promise<{ ok: boolean; results: PaletteResult[] }>;
  /** Display order + labels + icons for result groups. */
  groups: PaletteGroupMeta[];
  placeholder: string;
  /** Bulleted examples shown before the user types. */
  hintItems: string[];
}

export function SharedCommandPaletteTrigger({ config }: { config: PaletteConfig }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Track client-side mount so the portal is only attempted in the
  // browser. document.body doesn't exist during SSR.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Cmd/Ctrl+K opens the palette globally.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded text-left text-[12px] font-semibold text-hero-foreground/65 hover:bg-hero-foreground/5 hover:text-hero-foreground transition-colors"
      >
        <Search className="size-3.5 flex-shrink-0" />
        <span className="flex-1">Search…</span>
        <kbd className="text-[10px] tracking-[0.5px] text-hero-foreground/40 border border-hero-foreground/15 rounded px-1.5 py-0.5 font-sans">
          ⌘K
        </kbd>
      </button>
      {/* Portal to document.body so the palette escapes any ancestor
          stacking context (sticky sidebar, transform-using cards, etc.)
          and renders above every page element regardless of z-index. */}
      {open && mounted &&
        createPortal(
          <PaletteModal config={config} onClose={() => setOpen(false)} />,
          document.body
        )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Palette modal
 * ────────────────────────────────────────────────────────── */

function PaletteModal({
  config,
  onClose,
}: {
  config: PaletteConfig;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PaletteResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const { search, groups } = config;

  // Lock body scroll.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Autofocus the input.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Debounced search.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await search(trimmed);
        if (controller.signal.aborted) return;
        setResults(result.ok ? result.results : []);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, search]);

  // Group results in display order.
  const grouped = useMemo(() => {
    const byGroup: Record<string, PaletteResult[]> = {};
    for (const r of results) {
      (byGroup[r.group] ??= []).push(r);
    }
    return groups.flatMap((g) =>
      byGroup[g.key]?.length ? [{ meta: g, items: byGroup[g.key] }] : []
    );
  }, [results, groups]);

  // Flat list for keyboard nav.
  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // Reset highlighted index when results change.
  useEffect(() => {
    setActiveIdx(0);
  }, [flat.length]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (flat.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % flat.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + flat.length) % flat.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const target = flat[activeIdx];
        if (target) {
          onClose();
          router.push(target.href);
        }
      }
    },
    [activeIdx, flat, onClose, router]
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4">
      {/* Backdrop — strong dim + blur so the page fades behind the
          palette instead of competing with it visually. */}
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="absolute inset-0 bg-ink/75 backdrop-blur-md"
      />

      {/* Panel */}
      <div className="relative w-full max-w-[600px] rounded-lg bg-popover shadow-2xl border border-[var(--rule)] overflow-hidden">
        <div className="flex items-center gap-3 border-b border-[var(--rule)] px-4 py-3">
          <Search className="size-4 text-slate-meta" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={config.placeholder}
            className="flex-1 bg-transparent text-[15px] text-ink placeholder:text-slate-meta focus:outline-none"
          />
          {loading ? (
            <Loader2 className="size-4 text-slate-meta animate-spin" />
          ) : (
            <kbd className="text-[10px] text-slate-meta border border-[var(--rule)] rounded px-1.5 py-0.5 font-sans">
              Esc
            </kbd>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {query.trim() === "" ? (
            <Hint items={config.hintItems} />
          ) : flat.length === 0 && !loading ? (
            <div className="px-4 py-8 text-center text-sm text-slate-meta">
              No results for{" "}
              <span className="font-mono text-ink">&ldquo;{query}&rdquo;</span>
            </div>
          ) : (
            <ul ref={listRef} className="list-none py-2">
              {grouped.map((group) => (
                <li key={group.meta.key} className="mb-2 last:mb-0">
                  <div className="px-4 py-1 text-[10px] font-bold tracking-[2px] uppercase text-slate-meta">
                    {group.meta.label}
                  </div>
                  <ul className="list-none">
                    {group.items.map((item) => {
                      const flatIndex = flat.indexOf(item);
                      const isActive = flatIndex === activeIdx;
                      const Icon = group.meta.icon;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onMouseEnter={() => setActiveIdx(flatIndex)}
                            onClick={() => {
                              onClose();
                              router.push(item.href);
                            }}
                            className={
                              "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors " +
                              (isActive
                                ? "bg-cream/80 text-ink"
                                : "hover:bg-cream/40")
                            }
                          >
                            <Icon className="size-3.5 text-slate-meta flex-shrink-0" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[14px] font-semibold text-ink truncate">
                                {item.title}
                              </span>
                              {item.subtitle && (
                                <span className="block text-[11px] text-slate-meta truncate mt-0.5">
                                  {item.subtitle}
                                </span>
                              )}
                            </span>
                            {isActive && (
                              <span className="text-[10px] tracking-[0.5px] text-slate-meta font-semibold">
                                ↵
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--rule)] bg-cream/30 px-4 py-2 flex items-center justify-between text-[10px] text-slate-meta">
          <span className="inline-flex items-center gap-1.5">
            <CommandIcon className="size-3" />
            <kbd className="font-sans">↑↓</kbd>
            <span>navigate</span>
            <kbd className="font-sans">↵</kbd>
            <span>open</span>
          </span>
          <span>DSO Hire search</span>
        </div>
      </div>
    </div>
  );
}

function Hint({ items }: { items: string[] }) {
  return (
    <div className="px-4 py-6 text-sm text-slate-meta space-y-2">
      <p className="text-ink font-semibold text-[13px]">Try searching:</p>
      <ul className="list-none space-y-1.5 text-[13px]">
        {items.map((it) => (
          <li key={it}>• {it}</li>
        ))}
      </ul>
    </div>
  );
}
