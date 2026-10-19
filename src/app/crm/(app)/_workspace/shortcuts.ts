/* One list of CRM keyboard shortcuts, rendered by the ? overlay and the
   Settings card. Plain module (no "use client") so server pages can read
   the values directly. */

export type Shortcut = { keys: string[]; label: string };

export const SHORTCUTS: { group: string; items: Shortcut[] }[] = [
  {
    group: "Anywhere",
    items: [
      { keys: ["⌘", "K"], label: "Search everything" },
      { keys: ["/"], label: "Search everything" },
      { keys: ["C"], label: "Create an account or opportunity" },
      { keys: ["N"], label: "Log a note on an account" },
      { keys: ["?"], label: "Show these shortcuts" },
      { keys: ["Esc"], label: "Close a panel" },
    ],
  },
  {
    group: "Go to",
    items: [
      { keys: ["G", "T"], label: "Today" },
      { keys: ["G", "P"], label: "Pipeline" },
      { keys: ["G", "I"], label: "Inbox" },
      { keys: ["G", "R"], label: "Reports" },
      { keys: ["G", "A"], label: "Accounts" },
      { keys: ["G", "K"], label: "Tasks" },
      { keys: ["G", ","], label: "Settings" },
    ],
  },
];

/* second key after "g" → destination */
export const GO_TO: Record<string, string> = {
  t: "/crm",
  p: "/crm/pipeline",
  i: "/crm/inbox",
  r: "/crm/reports",
  a: "/crm/accounts",
  k: "/crm/tasks",
  ",": "/crm/settings",
};

export type PaletteMode = "search" | "create" | "note";

/* Window events the shell listens for. */
export const PALETTE_EVENT = "crm:palette";
export const HELP_EVENT = "crm:help";
