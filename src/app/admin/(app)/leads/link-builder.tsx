"use client";

/**
 * Prospect link builder (founder outreach, 2026-10-19).
 *
 * Type a group name + rough size, get the two links every outreach email
 * carries (docs/sales/outreach-kit.md):
 *   • Personalized demo: demo.dsohire.com/demo?for=Group+Name. The open
 *     is reported to demo_visits and emails the lead-notify list, and the
 *     demo greets them with "Prepared for Group Name".
 *   • Pre-filled calculator: /for-dental-groups with their size in the
 *     shareable URL params, landing on #calculator.
 */

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { DEMO_URL, sanitizeForLabel } from "@/lib/marketing/demo";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1">
      <span className="text-2xs font-bold uppercase tracking-[1.2px] text-slate-meta">{label}</span>
      <div className="flex items-stretch border border-[var(--rule-strong)] bg-ivory">
        <code className="min-w-0 flex-1 truncate px-3 py-2 text-xs text-ink">{value || "—"}</code>
        <button
          type="button"
          disabled={!value}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              /* clipboard blocked; select + copy manually */
            }
          }}
          className="inline-flex items-center gap-1.5 border-l border-[var(--rule-strong)] px-3 text-xs font-bold text-ink hover:bg-heritage hover:text-ivory disabled:opacity-40 transition-colors"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function LinkBuilder() {
  const [name, setName] = useState("");
  const [locations, setLocations] = useState(12);
  const [openRoles, setOpenRoles] = useState(10);

  const label = sanitizeForLabel(name);
  const demo = label ? `${DEMO_URL}?for=${encodeURIComponent(label).replace(/%20/g, "+")}` : "";
  const loc = Math.min(300, Math.max(2, Math.round(locations || 2)));
  const hires = Math.min(600, Math.max(5, Math.round(loc * 1.5 / 5) * 5 || 5));
  const lst = Math.min(150, Math.max(0, Math.round(openRoles || 0)));
  const calc = label
    ? `https://dsohire.com/for-dental-groups?loc=${loc}&hires=${hires}&ag=30&fee=25000&lst=${lst}&cpl=350#calculator`
    : "";

  return (
    <section className="mb-8 border border-[var(--rule)] bg-card px-5 py-4">
      <div className="text-2xs font-bold uppercase tracking-[1.5px] text-heritage-deep">Prospect link builder</div>
      <p className="text-xs text-slate-meta mt-0.5 mb-3">
        Two links for every outreach email. Playbook: <code className="text-ink">docs/sales/outreach-kit.md</code>
      </p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] mb-4">
        <label className="grid gap-1">
          <span className="text-2xs font-bold uppercase tracking-[1.2px] text-slate-meta">Group name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bright Direction Dental"
            className="border border-[var(--rule-strong)] bg-ivory px-3 py-2 text-sm text-ink outline-none focus:border-heritage"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-2xs font-bold uppercase tracking-[1.2px] text-slate-meta">Locations</span>
          <input
            type="number"
            min={2}
            value={locations}
            onChange={(e) => setLocations(Number(e.target.value))}
            className="border border-[var(--rule-strong)] bg-ivory px-3 py-2 text-sm text-ink tabular outline-none focus:border-heritage"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-2xs font-bold uppercase tracking-[1.2px] text-slate-meta">Open roles (approx.)</span>
          <input
            type="number"
            min={0}
            value={openRoles}
            onChange={(e) => setOpenRoles(Number(e.target.value))}
            className="border border-[var(--rule-strong)] bg-ivory px-3 py-2 text-sm text-ink tabular outline-none focus:border-heritage"
          />
        </label>
      </div>
      <div className="grid gap-3">
        <CopyRow label="Personalized demo link" value={demo} />
        <CopyRow label="Pre-filled cost calculator" value={calc} />
      </div>
    </section>
  );
}
