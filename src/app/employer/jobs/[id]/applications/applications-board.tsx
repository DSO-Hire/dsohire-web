/**
 * <ApplicationsBoard> — client wrapper for the per-job applications surface.
 *
 * Owns view-toggle state (List ↔ Kanban), persists to localStorage, and
 * picks the desktop kanban vs mobile stage-tabs layout based on viewport.
 *
 * Day 2 = static rendering only. Day 3 wires drag-drop, Day 4 wires realtime.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LayoutGrid, List } from "lucide-react";
import {
  ApplicationsList,
  type ApplicationsListItem,
} from "./applications-list";
import { KanbanBoard, type KanbanApplication } from "./kanban-board";
import { MobileStageTabs } from "./mobile-stage-tabs";

export type BoardView = "list" | "kanban";

interface ApplicationsBoardProps {
  initialApplications: KanbanApplication[];
  job: { id: string; title: string };
  initialView: BoardView;
  /**
   * DSO tier gate for the bulk-reject AI suggester. True only on Growth+.
   * Forwarded to the kanban board, which threads it into the bulk-reject
   * confirmation dialog.
   */
  aiSuggesterAvailable: boolean;
  /**
   * Per-application boolean: true when the application has at least one
   * screening answer or one submitted scorecard. Drives the suggester's
   * disabled state when the recruiter has selected a single candidate
   * for bulk reject.
   */
  aiSuggesterContextByAppId: Record<string, boolean>;
  /**
   * Permission gate for bulk actions. False for hiring_manager users.
   * Threads through to the kanban board's SelectionToolbar render.
   */
  canBulkAct?: boolean;
}

const VIEW_STORAGE_PREFIX = "dsohire.applications.view.";

export function ApplicationsBoard({
  initialApplications,
  job,
  initialView,
  aiSuggesterAvailable,
  aiSuggesterContextByAppId,
  canBulkAct = true,
}: ApplicationsBoardProps) {
  const [view, setView] = useState<BoardView>(initialView);
  const [hydrated, setHydrated] = useState(false);
  const isMobile = useMediaQuery("(max-width: 768px)");

  // Hydrate from localStorage; URL param wins on first paint, storage takes
  // over after mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(
      `${VIEW_STORAGE_PREFIX}${job.id}`
    );
    if (stored === "list" || stored === "kanban") setView(stored);
    setHydrated(true);
  }, [job.id]);

  function selectView(next: BoardView) {
    setView(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`${VIEW_STORAGE_PREFIX}${job.id}`, next);
    }
  }

  const listItems = useMemo<ApplicationsListItem[]>(
    () =>
      initialApplications.map((a) => ({
        id: a.id,
        job_id: a.job_id,
        candidate_id: a.candidate_id,
        status: a.status,
        created_at: a.created_at,
        candidate: a.candidate,
        jobTitle: a.jobTitle,
      })),
    [initialApplications]
  );

  return (
    <div>
      <Link
        href={`/employer/jobs/${job.id}`}
        className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Job
      </Link>

      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
            Applications · {initialApplications.length}
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink truncate">
            {job.title}
          </h1>
          <p className="mt-3 text-[14px] text-slate-body leading-relaxed max-w-[640px]">
            Pipeline view of every candidate who applied to this job. Click any
            card to review.
          </p>
        </div>

        <ViewToggle
          value={view}
          onChange={selectView}
          disabledKanbanReason={
            isMobile ? "Kanban is desktop-only. List view stays here." : undefined
          }
        />
      </header>

      {/* Render: list, kanban (desktop), or mobile stage tabs (kanban + small viewport) */}
      {view === "list" ? (
        <ApplicationsList applications={listItems} hideJobTitle />
      ) : !hydrated ? (
        // Avoid SSR/CSR mismatch — render a neutral placeholder until we know
        // viewport. Server emitted whatever initialView was; once hydrated we
        // pick desktop or mobile branch.
        <KanbanBoard
          applications={initialApplications}
          aiSuggesterAvailable={aiSuggesterAvailable}
          aiSuggesterContextByAppId={aiSuggesterContextByAppId}
          canBulkAct={canBulkAct}
        />
      ) : isMobile ? (
        <MobileStageTabs
          applications={initialApplications}
          jobId={job.id}
        />
      ) : (
        <KanbanBoard
          applications={initialApplications}
          aiSuggesterAvailable={aiSuggesterAvailable}
          aiSuggesterContextByAppId={aiSuggesterContextByAppId}
          canBulkAct={canBulkAct}
        />
      )}
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
  disabledKanbanReason,
}: {
  value: BoardView;
  onChange: (v: BoardView) => void;
  disabledKanbanReason?: string;
}) {
  const baseBtn =
    "inline-flex items-center gap-2 px-4 py-2 text-[10px] font-bold tracking-[1.5px] uppercase transition-colors border";
  return (
    <div
      className="flex border border-[var(--rule-strong)] bg-white"
      role="tablist"
      aria-label="View"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === "kanban"}
        onClick={() => onChange("kanban")}
        title={disabledKanbanReason}
        className={`${baseBtn} ${
          value === "kanban"
            ? "bg-ink text-ivory border-ink"
            : "border-transparent text-ink hover:bg-cream"
        }`}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        Kanban
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === "list"}
        onClick={() => onChange("list")}
        className={`${baseBtn} ${
          value === "list"
            ? "bg-ink text-ivory border-ink"
            : "border-transparent text-ink hover:bg-cream"
        }`}
      >
        <List className="h-3.5 w-3.5" />
        List
      </button>
    </div>
  );
}

// Inline media-query hook — keep the file self-contained so we don't add a
// global hook this Phase. SSR-safe (returns false on the server).
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setMatches(e.matches);
    };
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);
  return matches;
}
