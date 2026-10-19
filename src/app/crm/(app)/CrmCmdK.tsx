"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { quickCreate, quickLogNote } from "./_workspace/actions";
import { trapTab } from "./_workspace/focus";
import { HELP_EVENT, PALETTE_EVENT, type PaletteMode } from "./_workspace/shortcuts";
import { IcSearch } from "./icons";
import type { SearchGroup } from "./search/route";

/*
 * The CRM command palette. Global search across accounts, opportunities,
 * contacts and website leads (through /crm/search), page jumps, recent
 * picks, and two quick flows: create a record by name, and log a note on
 * a deal. Opens with Cmd-K, the topbar button, or a "crm:palette" window
 * event ({mode: "search" | "create" | "note"}). Reuses the site's .ck-*
 * styles; CRM tweaks live in workspace.css.
 */

type Row = {
  key: string;
  label: string;
  sub?: string;
  hint: string;
  ico: string;
  href?: string;
  run?: () => void;
};
type Group = { label: string; rows: Row[] };
type Recent = { label: string; sub?: string; hint: string; ico: string; href: string };
type Kind = "account" | "opportunity";

const RECENT_KEY = "dsohire-crm-recent";

const STATIC: (Recent & { keywords: string })[] = [
  { label: "Today", hint: "PAGE", ico: "☀", href: "/crm", keywords: "today home dashboard brief morning" },
  { label: "Pipeline", hint: "PAGE", ico: "≡", href: "/crm/pipeline", keywords: "pipeline stages drag opportunities deals board" },
  { label: "Inbox", hint: "PAGE", ico: "✉", href: "/crm/inbox", keywords: "inbox leads demo opens calculator convert" },
  { label: "Reports", hint: "PAGE", ico: "▁", href: "/crm/reports", keywords: "reports charts funnel numbers win loss" },
  { label: "Accounts", hint: "PAGE", ico: "▸", href: "/crm/accounts", keywords: "accounts dso dsos groups prospects customers" },
  { label: "Tasks", hint: "PAGE", ico: "☰", href: "/crm/tasks", keywords: "tasks todo follow up due overdue" },
  { label: "Admin console", hint: "PAGE", ico: "⌂", href: "/admin", keywords: "admin leads dsos analytics" },
  { label: "Settings", hint: "PAGE", ico: "⚙", href: "/crm/settings", keywords: "settings preferences weights password" },
  { label: "Open the public site", hint: "SITE", ico: "↗", href: "/", keywords: "website marketing public home" },
];

const KIND_LABEL: Record<Kind, string> = { account: "account", opportunity: "opportunity" };
const KIND_HINT: Record<Kind, string> = {
  account: "Group name, e.g. Bright Direction Dental",
  opportunity: "Group name (reuses its account when one exists)",
};
const GROUP_ICO: Record<string, string> = { opportunity: "◈", account: "▸", contact: "☺", lead: "✉" };

function readRecent(): Recent[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const v = raw ? (JSON.parse(raw) as Recent[]) : [];
    return Array.isArray(v) ? v.filter((r) => r && typeof r.href === "string" && r.href.startsWith("/")).slice(0, 8) : [];
  } catch {
    return [];
  }
}
function pushRecent(r: Recent) {
  try {
    const next = [r, ...readRecent().filter((x) => x.href !== r.href)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* per-browser convenience only */
  }
}

/* The topbar's backdrop-filter makes it the containing block for fixed
   children, so the overlay renders into .crm-root (keeps the .crm-root
   scoped styles) instead of inside the bar. Null during SSR. */
const noopSubscribe = () => () => {};
const getPortalRoot = () => document.querySelector<HTMLElement>(".crm-root");
const getServerPortalRoot = () => null;

export default function CrmCmdK() {
  const portalRoot = useSyncExternalStore(noopSubscribe, getPortalRoot, getServerPortalRoot);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PaletteMode>("search");
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [remote, setRemote] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [createKind, setCreateKind] = useState<Kind | null>(null);
  const [name, setName] = useState("");
  const [noteDeal, setNoteDeal] = useState<{ id: string; label: string } | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: string; label: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const inputRef = useRef<HTMLInputElement>(null);
  const formInputRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const listId = useId();

  const reset = useCallback((m: PaletteMode) => {
    setMode(m);
    setQuery("");
    setSel(0);
    setRemote([]);
    setLoading(false);
    setCreateKind(null);
    setName("");
    setNoteDeal(null);
    setNoteBody("");
    setErr(null);
    setSaved(null);
  }, []);

  const openWith = useCallback(
    (m: PaletteMode) => {
      if (document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement;
      reset(m);
      setRecent(readRecent());
      setOpen(true);
    },
    [reset],
  );

  const close = useCallback(() => {
    setOpen(false);
    const back = returnFocus.current ?? triggerRef.current;
    requestAnimationFrame(() => back?.focus?.());
  }, []);

  /* Cmd-K, Escape, and the window event other parts of the shell fire */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) close();
        else openWith("search");
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    };
    const onEvent = (e: Event) => {
      const m = (e as CustomEvent<{ mode?: PaletteMode }>).detail?.mode;
      openWith(m === "create" || m === "note" ? m : "search");
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(PALETTE_EVENT, onEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(PALETTE_EVENT, onEvent);
    };
  }, [open, close, openWith]);

  /* focus the right field for the current step */
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      if (createKind) formInputRef.current?.focus();
      else if (noteDeal) noteRef.current?.focus();
      else inputRef.current?.focus();
    }, 40);
    return () => clearTimeout(t);
  }, [open, createKind, noteDeal]);

  /* debounced remote search, one AbortController per keystroke */
  const q = query.trim();
  const searching = open && !createKind && !noteDeal && q.length >= 2 && (mode === "search" || mode === "note");
  useEffect(() => {
    if (!searching) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `/crm/search?q=${encodeURIComponent(q)}${mode === "note" ? "&type=account" : ""}`;
        const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
        const body = (await res.json()) as { groups?: SearchGroup[]; error?: string };
        if (!ctrl.signal.aborted) {
          setRemote(body.groups ?? []);
          setErr(res.ok ? null : body.error ?? "Search did not load.");
        }
      } catch (e) {
        if (!ctrl.signal.aborted && !(e instanceof DOMException && e.name === "AbortError")) {
          setRemote([]);
          setErr("Search did not load. Check the connection and try again.");
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [searching, q, mode]);

  const go = useCallback(
    (r: Recent) => {
      pushRecent(r);
      setOpen(false);
      router.push(r.href);
    },
    [router],
  );

  const startCreate = useCallback((k: Kind) => {
    setCreateKind(k);
    setName(query.trim().length >= 2 ? query.trim() : "");
    setErr(null);
  }, [query]);

  const groups = useMemo<Group[]>(() => {
    const ql = q.toLowerCase();
    const out: Group[] = [];
    const toRow = (r: Recent, key: string): Row => ({ key, ...r, run: () => go(r) });

    if (mode === "create") {
      out.push({
        label: "Create",
        rows: (["account", "opportunity"] as Kind[]).map((k) => ({
          key: `create-${k}`,
          label: `New ${KIND_LABEL[k]}`,
          sub: KIND_HINT[k],
          hint: "CREATE",
          ico: "+",
          run: () => startCreate(k),
        })),
      });
      return out;
    }

    if (mode === "note") {
      const deals = remote.find((g) => g.type === "account")?.items ?? [];
      if (deals.length)
        out.push({
          label: "Pick an account",
          rows: deals.map((d) => ({
            key: `nd-${d.id}`,
            label: d.label,
            sub: d.sub,
            hint: "ACCOUNT",
            ico: "▸",
            run: () => {
              setNoteDeal({ id: d.id, label: d.label });
              setErr(null);
            },
          })),
        });
      return out;
    }

    const actions: Row[] = [
      { key: "qa-account", label: "New account", hint: "CREATE", ico: "+", run: () => startCreate("account") },
      { key: "qa-opp", label: "New opportunity", hint: "CREATE", ico: "+", run: () => startCreate("opportunity") },
      {
        key: "qa-note",
        label: "Log a note",
        sub: "Pick an account, then write",
        hint: "NOTE",
        ico: "✎",
        run: () => {
          setMode("note");
          setQuery("");
          setRemote([]);
          setSel(0);
        },
      },
      {
        key: "qa-keys",
        label: "Keyboard shortcuts",
        hint: "HELP",
        ico: "?",
        run: () => {
          setOpen(false);
          window.dispatchEvent(new CustomEvent(HELP_EVENT));
        },
      },
    ];

    if (!ql) {
      if (recent.length) out.push({ label: "Recent", rows: recent.map((r, i) => toRow(r, `rec-${i}-${r.href}`)) });
      out.push({ label: "Quick actions", rows: actions });
      out.push({ label: "Pages", rows: STATIC.map((s) => toRow(s, `pg-${s.href}`)) });
      return out;
    }

    for (const g of remote) {
      out.push({
        label: g.label,
        rows: g.items.map((it) =>
          toRow(
            { label: it.label, sub: it.sub, hint: g.type.toUpperCase(), ico: GROUP_ICO[g.type] ?? "•", href: it.href },
            `${g.type}-${it.id}`,
          ),
        ),
      });
    }
    const pages = STATIC.filter((s) => s.label.toLowerCase().includes(ql) || s.keywords.includes(ql));
    if (pages.length) out.push({ label: "Pages", rows: pages.map((s) => toRow(s, `pg-${s.href}`)) });
    const acts = actions.filter((a) => a.label.toLowerCase().includes(ql));
    if (acts.length) out.push({ label: "Quick actions", rows: acts });
    return out;
  }, [mode, q, remote, recent, go, startCreate]);

  const flat = useMemo(() => groups.flatMap((g) => g.rows), [groups]);
  /* each group's first flat index, so options get stable ids */
  const offsets = useMemo(() => {
    const out: number[] = [];
    let n = 0;
    for (const g of groups) {
      out.push(n);
      n += g.rows.length;
    }
    return out;
  }, [groups]);
  const selIdx = Math.min(sel, Math.max(flat.length - 1, 0));
  const optId = (i: number) => `${listId}-opt-${i}`;

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && flat[selIdx]) {
      e.preventDefault();
      flat[selIdx].run?.();
    } else if (e.key === "Backspace" && !query && mode !== "search") {
      reset("search");
    }
  }

  /* keep the selected option in view */
  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-opt-${selIdx}`)?.scrollIntoView({ block: "nearest" });
  }, [selIdx, open, listId]);

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createKind || pending) return;
    const kind = createKind;
    const n = name.trim();
    if (n.length < 2) return setErr("Use a name of at least 2 characters.");
    setErr(null);
    startTransition(async () => {
      const res = await quickCreate(kind, n);
      if (res.error || !res.id) {
        setErr(res.error ?? "That did not save.");
        return;
      }
      /* quickCreate returns "a:<uuid>" or "o:<uuid>" */
      const [t, id] = res.id.split(":");
      const href = t === "o" ? `/crm/opportunities/${id}` : `/crm/accounts/${id}`;
      pushRecent({ label: n, hint: kind.toUpperCase(), ico: GROUP_ICO[kind], href });
      setOpen(false);
      router.push(href);
    });
  }

  function submitNote() {
    if (!noteDeal || pending) return;
    const body = noteBody.trim();
    if (!body) return setErr("Write the note first.");
    if (body.length > 4000) return setErr("Keep a note under 4,000 characters.");
    setErr(null);
    const deal = noteDeal;
    startTransition(async () => {
      const res = await quickLogNote(deal.id, body);
      if (res.error) {
        setErr(res.error);
        return;
      }
      setSaved({ id: deal.id, label: res.name ?? deal.label });
      setNoteBody("");
      router.refresh();
    });
  }

  const title =
    createKind ? `New ${KIND_LABEL[createKind]}` : mode === "note" ? (noteDeal ? `Note on ${noteDeal.label}` : "Log a note") : mode === "create" ? "Create" : "Search";
  const showList = !createKind && !noteDeal;
  const placeholder =
    mode === "note"
      ? "Which account? Type a group name"
      : mode === "create"
        ? "Pick what to create"
        : "Search accounts, opportunities, contacts, leads";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="ws-searchbtn"
        onClick={() => openWith("search")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Search the CRM (Command K)"
      >
        <IcSearch />
        <span className="ws-searchbtn-l">Search</span>
        <kbd className="ws-searchbtn-k">⌘K</kbd>
      </button>
      {portalRoot ? createPortal(
      <div
        className={`ck-overlay ws-ck${open ? " open" : ""}`}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        aria-hidden={!open}
        inert={!open}
      >
        <div
          className="ck-panel"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={`CRM palette: ${title}`}
          onKeyDown={(e) => trapTab(e, panelRef.current)}
        >
          {mode !== "search" || createKind ? (
            <div className="ws-ck-mode">
              <button type="button" className="ws-ck-back" onClick={() => reset("search")}>
                ← All
              </button>
              <span>{title.toUpperCase()}</span>
            </div>
          ) : null}

          {showList ? (
            <>
              <input
                ref={inputRef}
                className="ck-input"
                placeholder={placeholder}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSel(0);
                  if (e.target.value.trim().length < 2) setRemote([]);
                }}
                onKeyDown={onInputKey}
                role="combobox"
                aria-expanded={open && flat.length > 0}
                aria-controls={listId}
                aria-activedescendant={flat.length ? optId(selIdx) : undefined}
                aria-autocomplete="list"
                aria-label={placeholder}
                maxLength={60}
                autoComplete="off"
                spellCheck={false}
              />
              <div className="ck-list" id={listId} role="listbox" aria-label="Results">
                {loading && q.length >= 2 ? (
                  <div className="ws-ck-loading" role="presentation">
                    Searching…
                  </div>
                ) : null}
                {flat.length === 0 && !loading ? (
                  <div className="ck-empty" role="presentation">
                    {err
                      ? err
                      : mode === "note"
                        ? q.length < 2
                          ? "Type at least two letters of an account name."
                          : "No account matches that name."
                        : q.length < 2
                          ? "Type at least two letters."
                          : "Nothing matches. Try a practice, firm, person or email."}
                  </div>
                ) : null}
                {groups.map((g, gi) => (
                  <div key={g.label} role="presentation">
                    <div className="ws-ck-gh" role="presentation">
                      {g.label.toUpperCase()}
                    </div>
                    {g.rows.map((r, ri) => {
                      const i = offsets[gi] + ri;
                      return (
                        <div
                          key={r.key}
                          id={optId(i)}
                          role="option"
                          aria-selected={i === selIdx}
                          className={`ck-item${i === selIdx ? " sel" : ""}`}
                          onMouseEnter={() => setSel(i)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => r.run?.()}
                        >
                          <span className="ico" aria-hidden="true">
                            {r.ico}
                          </span>
                          <span className="ws-ck-txt">
                            <span className="ws-ck-l">{r.label}</span>
                            {r.sub ? <span className="ws-ck-sub">{r.sub}</span> : null}
                          </span>
                          <span className="meta">{r.hint}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {createKind ? (
            <form className="ws-ck-form dform" onSubmit={submitCreate}>
              <label htmlFor={`${listId}-name`}>{`${KIND_LABEL[createKind].toUpperCase()} NAME`}</label>
              <input
                ref={formInputRef}
                id={`${listId}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={KIND_HINT[createKind]}
                maxLength={120}
                autoComplete="off"
              />
              <p className="ws-ck-help">
                Creates the record with just a name, then opens it so you can fill in the rest.
              </p>
              {err ? (
                <p className="ws-ck-err" role="alert">
                  {err}
                </p>
              ) : null}
              <div className="ws-ck-actions">
                <button type="submit" className="dbtn dbtn-green" disabled={pending}>
                  {pending ? "Creating…" : `Create ${KIND_LABEL[createKind]}`}
                </button>
              </div>
            </form>
          ) : null}

          {noteDeal ? (
            <form
              className="ws-ck-form dform"
              onSubmit={(e) => {
                e.preventDefault();
                submitNote();
              }}
            >
              <label htmlFor={`${listId}-note`}>{`NOTE ON ${noteDeal.label.toUpperCase()}`}</label>
              <textarea
                ref={noteRef}
                id={`${listId}-note`}
                rows={5}
                value={noteBody}
                maxLength={4000}
                onChange={(e) => {
                  setNoteBody(e.target.value);
                  if (saved) setSaved(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submitNote();
                  }
                }}
                placeholder="What happened, what is next. Practice-level business detail only, never patient information."
              />
              {err ? (
                <p className="ws-ck-err" role="alert">
                  {err}
                </p>
              ) : null}
              <div className="ws-ck-actions" aria-live="polite">
                {saved ? (
                  <span className="ws-ck-saved">
                    Saved to{" "}
                    <Link href={`/crm/accounts/${saved.id}`} onClick={() => setOpen(false)}>
                      {saved.label}
                    </Link>
                  </span>
                ) : null}
                <button type="submit" className="dbtn dbtn-green" disabled={pending}>
                  {pending ? "Saving…" : "Save note ⌘↵"}
                </button>
              </div>
            </form>
          ) : null}

          <div className="ck-foot">
            <span>↑↓ MOVE</span>
            <span>↵ OPEN</span>
            {noteDeal ? <span>⌘↵ SAVE</span> : null}
            <span>ESC CLOSE</span>
          </div>
        </div>
      </div>,
        portalRoot,
      ) : null}
    </>
  );
}
