"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setTasksDone } from "./actions";

/* Bulk "mark done" for the tasks page, ported from the EDC CRM. Rows render
   plain checkboxes with name="bulk" inside the list; this bar reads them,
   so the list itself stays server-rendered. */
export default function TaskBulk({ scope }: { scope: string }) {
  const router = useRouter();
  const [ids, setIds] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const root = document.getElementById(scope);
    if (!root) return;
    const read = () =>
      setIds(
        Array.from(root.querySelectorAll<HTMLInputElement>('input[name="bulk"]:checked')).map((el) => el.value),
      );
    root.addEventListener("change", read);
    return () => root.removeEventListener("change", read);
  }, [scope]);

  if (ids.length === 0 && !err) return null;

  return (
    <div className="dx-bulk" role="region" aria-label="Bulk actions">
      {err ? <span role="alert">{err}</span> : <span>{ids.length} selected</span>}
      {ids.length > 0 ? (
        <button
          type="button"
          className="dbtn dbtn-green dbtn-sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await setTasksDone(ids);
              setErr(res.error);
              if (!res.error) {
                document
                  .getElementById(scope)
                  ?.querySelectorAll<HTMLInputElement>('input[name="bulk"]:checked')
                  .forEach((el) => {
                    el.checked = false;
                  });
                setIds([]);
              }
              router.refresh();
            })
          }
        >
          {pending ? "Saving…" : "Mark done"}
        </button>
      ) : null}
    </div>
  );
}
