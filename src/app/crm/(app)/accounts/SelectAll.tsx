"use client";

import { useEffect, useState } from "react";

/* Toggles every row checkbox that belongs to the bulk form (rows attach to
   it through the HTML form attribute, so no forms are nested) and shows how
   many are ticked. Ported from the EDC CRM inbox. */
export default function SelectAll({ formId, noun = "account" }: { formId: string; noun?: string }) {
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const boxes = () =>
      Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="ids"][form="${formId}"]`));
    const sync = () => {
      const all = boxes();
      setTotal(all.length);
      setCount(all.filter((b) => b.checked).length);
    };
    sync();
    document.addEventListener("change", sync);
    return () => document.removeEventListener("change", sync);
  }, [formId]);

  function toggle(on: boolean) {
    document
      .querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="ids"][form="${formId}"]`)
      .forEach((b) => {
        b.checked = on;
      });
    setCount(on ? total : 0);
  }

  return (
    <span className="bgroup">
      <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={total > 0 && count === total}
          onChange={(e) => toggle(e.target.checked)}
          aria-label={`Select every ${noun} in this list`}
        />
        All shown
      </label>
      <span className="bcount">{count} SELECTED</span>
    </span>
  );
}
