/*
 * CRM sidebar icon set. Stroke-based 18px glyphs drawn on a 24 grid so the
 * CSS can animate stroke-dashoffset on hover ("draw" effect) and color on
 * active state. Keep every path's total length under ~80 units so one
 * shared dasharray works for all of them.
 */

const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function IcToday() {
  return (
    <svg {...base} className="sico">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17" />
      <path d="M8 3v4M16 3v4" />
      <path className="sico-accent" d="M7.5 14.5l2.6 2.6 5.4-5.4" />
    </svg>
  );
}

export function IcPipeline() {
  return (
    <svg {...base} className="sico">
      <rect x="3" y="4.5" width="5.2" height="15" rx="1.6" />
      <rect x="9.4" y="4.5" width="5.2" height="10.5" rx="1.6" />
      <rect className="sico-accent" x="15.8" y="4.5" width="5.2" height="6.5" rx="1.6" />
    </svg>
  );
}

export function IcInbox() {
  return (
    <svg {...base} className="sico">
      <path d="M3.5 13.5V17a2.5 2.5 0 0 0 2.5 2.5h12a2.5 2.5 0 0 0 2.5-2.5v-3.5" />
      <path d="M3.5 13.5h4.7l1.5 2.3h4.6l1.5-2.3h4.7" />
      <path className="sico-accent" d="M12 4v6m0 0l-2.6-2.6M12 10l2.6-2.6" />
    </svg>
  );
}

export function IcSellers() {
  return (
    <svg {...base} className="sico">
      <circle cx="12" cy="8.2" r="3.6" />
      <path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6" />
      <path className="sico-accent" d="M18.8 6.4l1.6 1.6" />
    </svg>
  );
}

export function IcBuyers() {
  return (
    <svg {...base} className="sico">
      <path d="M4 20V8.5L9.5 5v15" />
      <path d="M9.5 9.5L15 7v13" />
      <path d="M15 10.5l5-1.8V20" />
      <path className="sico-accent" d="M4 20h16" />
    </svg>
  );
}

export function IcRoom() {
  return (
    <svg {...base} className="sico">
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
      <path d="M8 8h8M8 12h8M8 16h4.5" />
      <path className="sico-accent" d="M15.5 15l1.6 1.6 3-3" />
    </svg>
  );
}

export function IcRequests() {
  return (
    <svg {...base} className="sico">
      <path d="M8.5 6h12M8.5 12h12M8.5 18h7" />
      <path className="sico-accent" d="M3.5 5l1.2 1.2L7 3.9" />
      <path className="sico-accent" d="M3.5 11l1.2 1.2L7 9.9" />
      <circle className="sico-accent" cx="5" cy="18" r="1.4" />
    </svg>
  );
}

export function IcActivity() {
  return (
    <svg {...base} className="sico">
      <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />
      <circle className="sico-accent" cx="19.5" cy="5.5" r="2" />
    </svg>
  );
}

export function IcReports() {
  return (
    <svg {...base} className="sico">
      <path d="M4 20V10M10 20V4M16 20v-8" />
      <path className="sico-accent" d="M22 20H2" />
    </svg>
  );
}

export function IcSettings() {
  return (
    <svg {...base} className="sico">
      <path d="M4 7.5h10M18 7.5h2" />
      <circle className="sico-accent" cx="16" cy="7.5" r="2" />
      <path d="M4 16.5h2M10 16.5h10" />
      <circle className="sico-accent" cx="8" cy="16.5" r="2" />
    </svg>
  );
}

export function IcCapital() {
  return (
    <svg {...base} className="sico">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5V12l6 6" />
      <path className="sico-accent" d="M12 12H3.5" />
    </svg>
  );
}

export function IcRadar() {
  return (
    <svg {...base} className="sico">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <path className="sico-accent" d="M12 12l5.5-5.5" />
    </svg>
  );
}

export function IcResearch() {
  return (
    <svg {...base} className="sico">
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5.5 5.5" />
      <path className="sico-accent" d="M8 10.5h5M10.5 8v5" />
    </svg>
  );
}

/* Empty-state glyph: an open tray with a small check. Drawn with the
   same stroke grid; it uses "ws-ico" instead of "sico" so it does not
   pick up the sidebar hover animation. */
export function IcEmpty() {
  return (
    <svg {...base} width={22} height={22} className="ws-ico">
      <path d="M3.5 13.5V17a2.5 2.5 0 0 0 2.5 2.5h12a2.5 2.5 0 0 0 2.5-2.5v-3.5" />
      <path d="M3.5 13.5L6 6.5h12l2.5 7" />
      <path d="M3.5 13.5h4.7l1.5 2.3h4.6l1.5-2.3h4.7" />
    </svg>
  );
}

export function IcSearch() {
  return (
    <svg {...base} width={16} height={16} className="ws-ico">
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </svg>
  );
}

export function IcDeals() {
  return (
    <svg {...base} className="sico">
      <path d="M4 8h13l-3.5-3.5" />
      <path className="sico-accent" d="M20 16H7l3.5 3.5" />
    </svg>
  );
}
