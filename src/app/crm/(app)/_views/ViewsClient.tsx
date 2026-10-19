"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteView, moveView, renameView, saveView } from "./actions";
import { VIEW_NAME_MAX, type ViewSurface } from "./query";

/* Inline "Save this view" form: a small disclosure with a name field. */
export function SaveViewForm({ surface, query, full }: { surface: ViewSurface; query: string; full: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDetailsElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (!name) {
      setErr("Give the view a name.");
      return;
    }
    setErr(null);
    start(async () => {
      const res = await saveView(surface, name, query);
      if (res.error) {
        setErr(res.error);
        return;
      }
      form.reset();
      if (ref.current) ref.current.open = false;
      router.refresh();
    });
  }

  if (full) return <span className="sv-note">20 saved views is the limit here.</span>;
  return (
    <details className="sv-save" ref={ref}>
      <summary className="sv-savebtn">+ Save this view</summary>
      <form className="sv-form" onSubmit={onSubmit}>
        <label className="ws-sr" htmlFor={`sv-name-${surface}`}>
          View name
        </label>
        <input
          id={`sv-name-${surface}`}
          name="name"
          maxLength={VIEW_NAME_MAX}
          placeholder="Name this view"
          autoComplete="off"
          disabled={pending}
        />
        <button className="dbtn dbtn-green dbtn-sm" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        {err ? (
          <span className="sv-err" role="alert">
            {err}
          </span>
        ) : null}
      </form>
    </details>
  );
}

/* Per-chip controls: move left/right, rename, delete. */
export function ViewChipTools({ id, name, first, last }: { id: string; name: string; first: boolean; last: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ error: string | null }>) {
    start(async () => {
      const res = await fn();
      if (res.error) window.alert(res.error);
      else router.refresh();
    });
  }

  return (
    <span className="sv-tools">
      {!first ? (
        <button type="button" className="sv-t" disabled={pending} onClick={() => run(() => moveView(id, "up"))} aria-label={`Move ${name} left`} title="Move left">
          ‹
        </button>
      ) : null}
      {!last ? (
        <button type="button" className="sv-t" disabled={pending} onClick={() => run(() => moveView(id, "down"))} aria-label={`Move ${name} right`} title="Move right">
          ›
        </button>
      ) : null}
      <button
        type="button"
        className="sv-t"
        disabled={pending}
        onClick={() => {
          const next = window.prompt("Rename this view", name);
          if (next === null || !next.trim() || next.trim() === name) return;
          run(() => renameView(id, next));
        }}
        aria-label={`Rename ${name}`}
        title="Rename"
      >
        ✎
      </button>
      <button
        type="button"
        className="sv-t sv-x"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Delete the saved view "${name}"?`)) return;
          run(() => deleteView(id));
        }}
        aria-label={`Delete ${name}`}
        title="Delete"
      >
        ×
      </button>
    </span>
  );
}
