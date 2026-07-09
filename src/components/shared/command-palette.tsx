"use client";

/**
 * SharedCommandPalette — the ⌘K palette machinery, extracted from the
 * employer palette (Phase 4.6.e) for Lane 7 (Career HQ, Model 06) so
 * BOTH sides of the house share one implementation.
 *
 * Design-excellence program 4a (2026-07-09): upgraded from search-only
 * to a Linear/Raycast-style ACTION palette. Search stays exactly as it
 * was (debounced server action, grouped results); on top of it:
 *
 *   • `commands` — static, client-side commands supplied by each side's
 *     wrapper. Visible immediately on open (no typing needed), fuzzy-
 *     filtered by the query, and ranked above search results. A command
 *     either navigates (`href`) or executes (`run`) — theme toggles,
 *     text size, etc. Privileged commands are capability-gated by the
 *     WRAPPER (the shell passes its resolved permissions down); this
 *     file stays permission-agnostic.
 *   • Proper combobox semantics — role=combobox input with
 *     aria-activedescendant over a role=listbox / role=option tree, so
 *     screen readers track the highlighted row (a11y phase 6b, done
 *     here while the DOM was open).
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
  Zap,
} from "lucide-react";
import { Eyebrow } from "@/components/brand/eyebrow";

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

/** A static command: navigate (`href`) or execute (`run`). */
export interface PaletteCommand {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Extra match terms beyond the title ("dark", "appearance", …). */
  keywords?: string[];
  href?: string;
  /** Client-side action. Wins over href when both are set. */
  run?: () => void;
  /** When true the palette stays open after run() (e.g. theme toggle,
   *  so the user sees the change land). Default: close. */
  keepOpen?: boolean;
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
  /** Static commands — shown on open, filtered while typing. */
  commands?: PaletteCommand[];
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
        className="w-full flex items-center gap-2 px-3 py-2 rounded text-left text-xs font-semibold text-hero-foreground/65 hover:bg-hero-foreground/5 hover:text-hero-foreground transition-colors"
      >
        <Search className="size-3.5 flex-shrink-0" />
        <span className="flex-1">Search…</span>
        <kbd className="text-2xs tracking-[0.5px] text-hero-foreground/40 border border-hero-foreground/15 rounded px-1.5 py-0.5 font-sans">
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

/** One row in the unified keyboard-navigable list. */
type FlatEntry =
  | { kind: "command"; cmd: PaletteCommand }
  | { kind: "result"; item: PaletteResult };

function entryId(e: FlatEntry): string {
  return e.kind === "command" ? `cmd-${e.cmd.id}` : `res-${e.item.id}`;
}

function commandMatches(cmd: PaletteCommand, q: string): boolean {
  const hay = [cmd.title, cmd.subtitle ?? "", ...(cmd.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  // Every whitespace-separated term must appear somewhere.
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => hay.includes(term));
}

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
  const listRef = useRef<HTMLDivElement | null>(null);

  const { search, groups, commands = [] } = config;

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

  // Commands: all of them at rest, term-filtered while typing.
  const visibleCommands = useMemo(() => {
    const q = query.trim();
    if (!q) return commands;
    return commands.filter((c) => commandMatches(c, q));
  }, [commands, query]);

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

  // Unified flat list for keyboard nav — commands first, then results.
  const flat = useMemo<FlatEntry[]>(
    () => [
      ...visibleCommands.map((cmd): FlatEntry => ({ kind: "command", cmd })),
      ...grouped.flatMap((g) =>
        g.items.map((item): FlatEntry => ({ kind: "result", item }))
      ),
    ],
    [visibleCommands, grouped]
  );

  // Reset highlighted index when the list changes.
  useEffect(() => {
    setActiveIdx(0);
  }, [flat.length, query]);

  const activate = useCallback(
    (entry: FlatEntry) => {
      if (entry.kind === "command") {
        const { cmd } = entry;
        if (cmd.run) {
          cmd.run();
          if (!cmd.keepOpen) onClose();
          return;
        }
        if (cmd.href) {
          onClose();
          router.push(cmd.href);
        }
        return;
      }
      onClose();
      router.push(entry.item.href);
    },
    [onClose, router]
  );

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
        if (target) activate(target);
      }
    },
    [activeIdx, flat, activate]
  );

  const activeEntry = flat[activeIdx];
  const hasAnything = flat.length > 0;
  const showNoResults =
    query.trim() !== "" && flat.length === 0 && !loading;

  // Shared row renderer keeps commands + results visually identical —
  // one dialect, whatever the row does.
  const renderRow = (
    entry: FlatEntry,
    Icon: React.ComponentType<{ className?: string }>,
    title: string,
    subtitle: string | undefined,
    trailing?: string
  ) => {
    const flatIndex = flat.findIndex((f) => entryId(f) === entryId(entry));
    const isActive = flatIndex === activeIdx;
    return (
      <li key={entryId(entry)} role="none">
        <button
          type="button"
          role="option"
          id={entryId(entry)}
          aria-selected={isActive}
          onMouseEnter={() => setActiveIdx(flatIndex)}
          onClick={() => activate(entry)}
          className={
            "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors " +
            (isActive ? "bg-cream/80 text-ink" : "hover:bg-cream/40")
          }
        >
          <Icon className="size-3.5 text-slate-meta flex-shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink truncate">
              {title}
            </span>
            {subtitle && (
              <span className="block text-2xs text-slate-meta truncate mt-0.5">
                {subtitle}
              </span>
            )}
          </span>
          {trailing && (
            <span className="text-2xs tracking-[0.5px] text-slate-meta font-semibold">
              {trailing}
            </span>
          )}
          {isActive && (
            <span className="text-2xs tracking-[0.5px] text-slate-meta font-semibold">
              ↵
            </span>
          )}
        </button>
      </li>
    );
  };

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

      {/* Panel — overlay-grade elevation (ladder rung 3). */}
      <div className="relative w-full max-w-[600px] bg-popover shadow-3 border border-[var(--rule)] overflow-hidden">
        <div className="flex items-center gap-3 border-b border-[var(--rule)] px-4 py-3">
          <Search className="size-4 text-slate-meta" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={config.placeholder}
            role="combobox"
            aria-expanded={hasAnything}
            aria-controls="palette-listbox"
            aria-activedescendant={
              activeEntry ? entryId(activeEntry) : undefined
            }
            aria-autocomplete="list"
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-slate-meta focus:outline-none"
          />
          {loading ? (
            <Loader2 className="size-4 text-slate-meta animate-spin" />
          ) : (
            <kbd className="text-2xs text-slate-meta border border-[var(--rule)] rounded px-1.5 py-0.5 font-sans">
              Esc
            </kbd>
          )}
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
          {showNoResults ? (
            <div className="px-4 py-8 text-center text-sm text-slate-meta">
              No results for{" "}
              <span className="font-mono text-ink">&ldquo;{query}&rdquo;</span>
            </div>
          ) : (
            <>
              <ul
                id="palette-listbox"
                role="listbox"
                aria-label="Commands and results"
                className="list-none py-2"
              >
                {visibleCommands.length > 0 && (
                  <li role="none" className="mb-2 last:mb-0">
                    <Eyebrow className="px-4 py-1">Commands</Eyebrow>
                    <ul className="list-none" role="none">
                      {visibleCommands.map((cmd) =>
                        renderRow(
                          { kind: "command", cmd },
                          cmd.icon ?? Zap,
                          cmd.title,
                          cmd.subtitle
                        )
                      )}
                    </ul>
                  </li>
                )}
                {grouped.map((group) => (
                  <li key={group.meta.key} role="none" className="mb-2 last:mb-0">
                    <Eyebrow className="px-4 py-1">{group.meta.label}</Eyebrow>
                    <ul className="list-none" role="none">
                      {group.items.map((item) =>
                        renderRow(
                          { kind: "result", item },
                          group.meta.icon,
                          item.title,
                          item.subtitle
                        )
                      )}
                    </ul>
                  </li>
                ))}
              </ul>
              {query.trim() === "" && <Hint items={config.hintItems} />}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--rule)] bg-cream/30 px-4 py-2 flex items-center justify-between text-2xs text-slate-meta">
          <span className="inline-flex items-center gap-1.5">
            <CommandIcon className="size-3" />
            <kbd className="font-sans">↑↓</kbd>
            <span>navigate</span>
            <kbd className="font-sans">↵</kbd>
            <span>run</span>
          </span>
          <span>DSO Hire</span>
        </div>
      </div>
    </div>
  );
}

function Hint({ items }: { items: string[] }) {
  return (
    <div className="px-4 pt-2 pb-6 text-sm text-slate-meta space-y-2 border-t border-[var(--rule)]">
      <p className="text-ink font-semibold text-xs pt-3">Or search for:</p>
      <ul className="list-none space-y-1.5 text-xs">
        {items.map((it) => (
          <li key={it}>• {it}</li>
        ))}
      </ul>
    </div>
  );
}
