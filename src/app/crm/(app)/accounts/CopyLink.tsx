"use client";

/* One read-only link with a Copy button: the personalized demo link on an
   account profile. Same URL format as the /admin/leads link builder. */
import { useState } from "react";

export default function CopyLink({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);
  const id = "ac-demo-link";
  return (
    <div className="ac-copy">
      <label htmlFor={id}>{label}</label>
      <div className="ac-copy-row">
        <input id={id} readOnly value={value ?? ""} placeholder="Add a name to build the link" onFocus={(e) => e.target.select()} />
        <button
          type="button"
          className="dbtn dbtn-line dbtn-sm"
          disabled={!value}
          onClick={async () => {
            if (!value) return;
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              /* clipboard blocked: the field selects on focus, copy by hand */
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <span className="ws-sr" aria-live="polite">
        {copied ? "Demo link copied" : ""}
      </span>
    </div>
  );
}
