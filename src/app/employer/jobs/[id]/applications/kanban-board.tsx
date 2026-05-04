/**
 * <KanbanBoard> — pipeline board for one job, with drag-drop (Day 3) +
 * realtime sync across recruiters (Day 4) + a11y/multi-select (Day 5).
 *
 * Architecture:
 *  - Base state lives in `useRealtimeApplications` (Day 4); it owns the
 *    committed truth, listens to `postgres_changes` UPDATEs scoped to this
 *    job_id, and reconciles into local state. Self-echoes are filtered via
 *    the shared `pendingMovesRef`.
 *  - `useOptimistic` layers in-flight moves on top of base state so the
 *    dragged card visually snaps to the new column the instant it's dropped.
 *  - `useTransition` runs the server action without blocking input.
 *  - Selection lives in `useBulkSelection` (Day 5); `count > 0` reveals a
 *    sticky toolbar with placeholder bulk actions (wired in sprint feature #3).
 *  - Closed lane is split into rejected (drop target) + withdrawn (read-only)
 *    subsections. Only `column:closed` is a droppable; withdrawn rows render
 *    italic with no checkbox / no drag handle.
 *
 * Self-echo prevention:
 *  - `pendingMovesRef` records `applicationId -> expectedStatus`. <KanbanBoard>
 *    sets it on drag-drop and clears it ONLY in the failure branch (the
 *    realtime hook clears successful entries when the echo arrives, so we
 *    have a single owner per outcome and never get a phantom "teammate moved
 *    …" toast for our own move).
 *  - Per-card `pending` flag (rendered dimmed/disabled) is owned by
 *    `pendingIds` in this component and cleared on either outcome.
 *
 * What this PR does NOT do (deferred):
 *  - In-column reorder via useSortable — Day 5+
 *  - Bulk action mutations (move-many, reject-many) — sprint feature #3
 *  - Presence indicators / "who's watching" — Day 5+
 *  - Conflict resolution UI when two recruiters race — Day 5+
 *  - INSERT events (new application appeared) — Day 5+
 */

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import {
  ChevronRight,
  ChevronDown,
  AlertCircle,
  Users,
  X,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  defaultDropAnimationSideEffects,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
} from "@dnd-kit/core";
import {
  KANBAN_STAGES,
  CLOSED_STAGES,
  STAGE_LABELS,
  type ApplicationStatus,
  type KanbanStage,
} from "@/lib/applications/stages";
import { moveApplicationStage } from "@/app/employer/applications/[id]/actions";
import type { ApplicationsListItem } from "./applications-list";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import {
  useRealtimeApplications,
  type RemoteChangeEvent,
} from "./use-realtime-applications";
import { useBulkSelection } from "./use-bulk-selection";

export interface KanbanApplication extends ApplicationsListItem {
  stage_entered_at: string;
  pipeline_position: number | null;
  /**
   * Count of non-deleted internal comments on this application — drives
   * the chat-bubble indicator on the card. Aggregated server-side via
   * the `application_comment_counts` view; defaults to 0 for new rows
   * delivered via realtime INSERT before a refresh.
   */
  comment_count: number;
  /**
   * Aggregate scorecard data for the card-side star indicator. Pulled
   * from `application_scorecard_summaries` (only submitted scorecards
   * count; drafts stay private until submission). Both fields are null
   * when no reviewer has submitted a scorecard yet.
   */
  scorecard_avg: number | null;
  scorecard_reviewer_count: number;
}

interface KanbanBoardProps {
  applications: KanbanApplication[];
}

interface OptimisticMove {
  type: "move";
  applicationId: string;
  nextStatus: ApplicationStatus;
  /**
   * Updated stage_entered_at — for the optimistic phase we approximate with
   * `new Date().toISOString()` so the heat indicator resets immediately.
   */
  nextStageEnteredAt: string;
}

/**
 * Errors come in two flavors:
 *  - "network": the request couldn't reach the server (offline, fetch threw,
 *    ambiguous failure). Recoverable; the banner offers a Retry button that
 *    re-attempts the same move.
 *  - "denied": the server returned an authorization / not-found response (RLS
 *    blocks the move, the row was deleted, etc.). Permanent for this user;
 *    only a dismiss button is offered.
 *
 * The `pendingMove` payload lets Retry re-run `moveApplicationStage` with the
 * exact same arguments without rebuilding state from the live board.
 */
interface ErrorState {
  kind: "network" | "denied";
  candidateName: string;
  stageLabel: string;
  pendingMove: {
    applicationId: string;
    nextStatus: ApplicationStatus;
    prevStatus: ApplicationStatus;
  } | null;
}

interface RemoteToast {
  applicationId: string;
  candidateName: string;
  stageLabel: string;
}

/**
 * Closed lane is rendered as a single droppable container so dragging onto
 * it transitions the application to `rejected`. Withdrawn rows live inside
 * the same expanded pane but are NOT a drop target — withdrawn is candidate-
 * side only.
 */
const CLOSED_DROPPABLE_ID = "column:closed";

/**
 * Drop animation: 150ms ease-out so cards land softly into their new column
 * instead of snapping. (Day 3 had `dropAnimation={null}` for a hard snap.)
 * `dragSourceOpacity: 0` matches our in-place dim while the overlay ghost
 * animates home.
 */
const DROP_ANIMATION: DropAnimation = {
  duration: 150,
  easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.3" } },
  }),
};

export function KanbanBoard({ applications }: KanbanBoardProps) {
  const [closedExpanded, setClosedExpanded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [remoteToast, setRemoteToast] = useState<RemoteToast | null>(null);
  const [, startTransition] = useTransition();

  // Day 4: Shared pending-moves ledger. The hook reads (and on echo, clears)
  // this; we write to it on drag-drop and clear it ONLY on failure.
  const pendingMovesRef = useRef<Map<string, ApplicationStatus>>(new Map());

  // Track which cards are currently in-flight so they render dimmed/disabled.
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(
    new Set<string>()
  );

  // Day 7: track mounted state so a server-action response that lands after
  // unmount doesn't try to setState (would log a memory-leak warning AND fire
  // rollback against state that no longer exists). Every state write inside
  // the async handler now gates on `isMountedRef.current`.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Day 5: selection state.
  const selection = useBulkSelection();

  const { applications: appsState, isConnected, commitLocal, reseed } =
    useRealtimeApplications({
      jobId: applications[0]?.job_id ?? "",
      initialApplications: applications,
      pendingMovesRef,
      onRemoteChange: (event: RemoteChangeEvent) => {
        // Don't toast for our own optimistic moves (already filtered upstream
        // via pendingMovesRef) or for stages we don't render labels for.
        const stageLabel = STAGE_LABELS[event.nextStatus];
        if (!stageLabel) return;
        setRemoteToast({
          applicationId: event.applicationId,
          candidateName: event.candidateName ?? "a candidate",
          stageLabel,
        });
      },
    });

  // Reseed on parent prop change (revalidation, view-toggle remount, etc.).
  // Hash by id+status so we don't clobber realtime updates with a stale prop.
  const lastSeedKeyRef = useRef<string>("");
  useEffect(() => {
    const key = applications.map((a) => `${a.id}:${a.status}`).join("|");
    if (key !== lastSeedKeyRef.current) {
      lastSeedKeyRef.current = key;
      reseed(applications);
    }
  }, [applications, reseed]);

  const [optimisticApps, applyOptimistic] = useOptimistic<
    KanbanApplication[],
    OptimisticMove
  >(appsState, (current, action) => {
    if (action.type !== "move") return current;
    return current.map((app) =>
      app.id === action.applicationId
        ? {
            ...app,
            status: action.nextStatus,
            stage_entered_at: action.nextStageEnteredAt,
          }
        : app
    );
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    // dnd-kit's KeyboardSensor defaults handle: Tab to focus, Space to pick
    // up, arrow keys to move between droppables, Space to drop, Esc to cancel.
    // We don't need a custom KeyboardCoordinateGetter — the sortableKeyboard
    // coordinates are for sortable lists; for cross-droppable kanban, the
    // default coordinate getter walks droppables in DOM order, which matches
    // our left-to-right column layout exactly.
    useSensor(KeyboardSensor)
  );

  // Bucket apps by stage for rendering.
  const byStage = useMemo(() => {
    const m = new Map<ApplicationStatus, KanbanApplication[]>();
    for (const stage of KANBAN_STAGES) m.set(stage, []);
    for (const stage of CLOSED_STAGES) m.set(stage, []);
    for (const app of optimisticApps) {
      const bucket = m.get(app.status);
      if (bucket) bucket.push(app);
    }
    for (const list of m.values()) {
      list.sort((a, b) => {
        const ap = a.pipeline_position ?? Number.POSITIVE_INFINITY;
        const bp = b.pipeline_position ?? Number.POSITIVE_INFINITY;
        if (ap !== bp) return ap - bp;
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
    }
    return m;
  }, [optimisticApps]);

  const rejectedApps = byStage.get("rejected") ?? [];
  const withdrawnApps = byStage.get("withdrawn") ?? [];
  const closedCount = rejectedApps.length + withdrawnApps.length;

  // Day 5: column-major id-order array for shift-click range select. Excludes
  // withdrawn rows (not selectable). Open columns first in canonical stage
  // order, then rejected.
  const selectionOrder = useMemo<string[]>(() => {
    const out: string[] = [];
    for (const stage of KANBAN_STAGES) {
      for (const app of byStage.get(stage) ?? []) out.push(app.id);
    }
    for (const app of rejectedApps) out.push(app.id);
    return out;
  }, [byStage, rejectedApps]);

  const handleToggleSelect = useCallback(
    (id: string, shiftKey: boolean) => {
      if (shiftKey) selection.shiftClick(id, selectionOrder);
      else selection.toggle(id);
    },
    [selection, selectionOrder]
  );

  const activeApp =
    activeId !== null
      ? optimisticApps.find((a) => a.id === activeId) ?? null
      : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  /**
   * Day 7: extracted from handleDragEnd so the retry button on a network-fail
   * banner can re-run the same move with the same arguments. `prevStatus` is
   * captured at the original drop time so we always roll back to the right
   * column even if the user has done other moves in between (the optimistic
   * layer carries the latest snapshot, but rollback target should match what
   * the user last saw the card at).
   */
  const runMove = useCallback(
    (
      applicationId: string,
      nextStatus: ApplicationStatus,
      prevStatus: ApplicationStatus,
      candidateName: string
    ) => {
      const nextStageEnteredAt = new Date().toISOString();

      pendingMovesRef.current.set(applicationId, nextStatus);
      if (isMountedRef.current) {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.add(applicationId);
          return next;
        });
      }

      startTransition(async () => {
        applyOptimistic({
          type: "move",
          applicationId,
          nextStatus,
          nextStageEnteredAt,
        });

        // Distinguish network-level throw (fetch failed, offline, etc.) from a
        // typed `{ ok: false }` server response. The former gets a Retry path.
        let result:
          | { ok: true; nextStatus: ApplicationStatus; stageEnteredAt: string }
          | { ok: false; error: string; networkError?: boolean };
        try {
          const raw = await moveApplicationStage(applicationId, nextStatus);
          if (raw.ok) {
            result = {
              ok: true,
              nextStatus: raw.nextStatus,
              stageEnteredAt: raw.stageEnteredAt,
            };
          } else {
            result = { ok: false, error: raw.error };
          }
        } catch (err) {
          result = {
            ok: false,
            error: err instanceof Error ? err.message : "Unexpected error",
            networkError: true,
          };
        }

        // Bail if the component unmounted while the request was in flight.
        // Don't touch state, don't clear pendingMovesRef — there's nothing
        // left to update and the hook's cleanup already tore down the
        // realtime channel.
        if (!isMountedRef.current) return;

        if (result.ok) {
          commitLocal(applicationId, result.nextStatus, result.stageEnteredAt);
        } else {
          // No echo will arrive on the failure path, so this branch owns the
          // ledger cleanup. Pick the right banner based on error kind.
          pendingMovesRef.current.delete(applicationId);
          setError({
            kind: result.networkError ? "network" : "denied",
            candidateName,
            stageLabel: STAGE_LABELS[prevStatus],
            pendingMove: result.networkError
              ? { applicationId, nextStatus, prevStatus }
              : null,
          });
        }

        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(applicationId);
          return next;
        });
      });
    },
    [applyOptimistic, commitLocal]
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const overData = over.data.current as
      | { type: "column"; status: KanbanStage }
      | undefined;

    // Resolve target status. Two valid drop targets: a regular stage column
    // (column:<stage>) or the closed lane (column:closed → rejected).
    let nextStatus: ApplicationStatus | null = null;
    if (over.id === CLOSED_DROPPABLE_ID) {
      nextStatus = "rejected";
    } else if (overData?.type === "column") {
      nextStatus = overData.status;
    }
    if (!nextStatus) return;

    const applicationId = String(active.id);
    const app = optimisticApps.find((a) => a.id === applicationId);
    if (!app) return;
    if (app.status === nextStatus) return; // same-column drop = no-op

    const prevStatus = app.status;
    const candidateName = app.candidate?.full_name ?? "Anonymous candidate";
    runMove(applicationId, nextStatus, prevStatus, candidateName);
  }

  // Day 7: warn before unload while a drag is in-flight (mid-drag OR awaiting
  // server confirmation). Without this, a click-and-close drops in-flight
  // moves silently. We add the listener only when there's actual risk so the
  // warning doesn't fire on every navigation.
  useEffect(() => {
    const inFlight = activeId !== null || pendingIds.size > 0;
    if (!inFlight) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Required by some browsers; the actual prompt copy is fixed by the UA.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activeId, pendingIds]);

  function handleDragCancel() {
    setActiveId(null);
  }

  // Day 5: custom screen-reader announcements. The board overrides every hook
  // dnd-kit fires so the recruiter hears candidate names + stage labels rather
  // than the generic "Picked up draggable item" defaults. We track the start-
  // stage in a ref so the onDragOver hook can detect "back over original" and
  // the onDragEnd hook can detect a no-change return.
  const dragStartStageRef = useRef<ApplicationStatus | null>(null);

  const announcements: Announcements = useMemo(
    () => ({
      onDragStart({ active }) {
        const app = optimisticApps.find((a) => a.id === active.id);
        const name = app?.candidate?.full_name ?? "Anonymous candidate";
        const stageLabel = app ? STAGE_LABELS[app.status] : "the board";
        dragStartStageRef.current = app?.status ?? null;
        return (
          `Picked up ${name} from ${stageLabel}. ` +
          `Use arrow keys to move between columns. ` +
          `Press Space to drop. Press Escape to cancel.`
        );
      },
      onDragOver({ active, over }) {
        if (!over) return undefined;
        const targetStage = stageFromDroppableId(String(over.id));
        if (!targetStage) return undefined;
        const app = optimisticApps.find((a) => a.id === active.id);
        const name = app?.candidate?.full_name ?? "Card";
        const startStage = dragStartStageRef.current;
        if (startStage && targetStage === startStage) {
          return `Return ${name} to ${STAGE_LABELS[startStage]}?`;
        }
        return `Drop ${name} on ${STAGE_LABELS[targetStage]}?`;
      },
      onDragEnd({ active, over }) {
        const app = optimisticApps.find((a) => a.id === active.id);
        const name = app?.candidate?.full_name ?? "Card";
        const startStage = dragStartStageRef.current;
        dragStartStageRef.current = null;
        if (!over) {
          const homeLabel = startStage ? STAGE_LABELS[startStage] : "its column";
          return `Cancelled. ${name} returned to ${homeLabel}.`;
        }
        const targetStage = stageFromDroppableId(String(over.id));
        if (!targetStage) {
          const homeLabel = startStage ? STAGE_LABELS[startStage] : "its column";
          return `Cancelled. ${name} returned to ${homeLabel}.`;
        }
        if (startStage && targetStage === startStage) {
          return `Returned ${name} to ${STAGE_LABELS[startStage]}.`;
        }
        return `Moved ${name} to ${STAGE_LABELS[targetStage]}.`;
      },
      onDragCancel({ active }) {
        const app = optimisticApps.find((a) => a.id === active.id);
        const name = app?.candidate?.full_name ?? "Card";
        const startStage = dragStartStageRef.current;
        dragStartStageRef.current = null;
        const homeLabel = startStage
          ? STAGE_LABELS[startStage]
          : app
            ? STAGE_LABELS[app.status]
            : "its column";
        return `Cancelled. ${name} returned to ${homeLabel}.`;
      },
    }),
    [optimisticApps]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      accessibility={{ announcements }}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <LiveIndicator isConnected={isConnected} />
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 border border-red-300 bg-red-50 px-4 py-3"
          >
            <AlertCircle className="h-4 w-4 text-red-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-[13px] text-red-900 leading-relaxed">
              {error.kind === "network" ? (
                <>
                  <span className="font-bold">Move failed.</span> Check your
                  connection and try again.
                </>
              ) : (
                <>
                  <span className="font-bold">
                    You don&apos;t have permission to move {error.candidateName}.
                  </span>{" "}
                  Status reverted to {error.stageLabel}.
                </>
              )}
            </div>
            {error.kind === "network" && error.pendingMove && (
              <button
                type="button"
                onClick={() => {
                  const move = error.pendingMove;
                  if (!move) return;
                  setError(null);
                  runMove(
                    move.applicationId,
                    move.nextStatus,
                    move.prevStatus,
                    error.candidateName
                  );
                }}
                className="text-[10px] font-bold tracking-[1.5px] uppercase px-3 py-1.5 border border-red-300 text-red-700 hover:bg-red-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
              >
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="text-red-700 hover:text-red-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {remoteToast && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-start gap-3 border border-heritage/30 bg-heritage/[0.08] px-4 py-3"
          >
            <Users className="h-4 w-4 text-heritage-deep flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-[13px] text-heritage-deep leading-relaxed">
              <span className="font-bold">Teammate</span> moved{" "}
              <span className="font-bold">{remoteToast.candidateName}</span> to{" "}
              <span className="font-bold">{remoteToast.stageLabel}</span>.
            </div>
            <button
              type="button"
              onClick={() => setRemoteToast(null)}
              aria-label="Dismiss notification"
              className="text-heritage-deep hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-offset-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {selection.count > 0 && (
          <SelectionToolbar
            count={selection.count}
            onClear={selection.clear}
          />
        )}

        {/* Open stages — horizontal scroll on desktop if needed */}
        <div className="overflow-x-auto -mx-4 px-4 pb-2">
          <div className="flex gap-4 min-w-max">
            {KANBAN_STAGES.map((stage) => (
              <KanbanColumn
                key={stage}
                stage={stage}
                applications={byStage.get(stage) ?? []}
                pendingApplicationIds={pendingIds}
                selectedIds={selection.selected}
                onToggleSelect={handleToggleSelect}
              />
            ))}
          </div>
        </div>

        {/* Closed lane — collapsible, splits rejected (drop target) +
            withdrawn (read-only display). */}
        <ClosedLane
          rejectedApps={rejectedApps}
          withdrawnApps={withdrawnApps}
          closedCount={closedCount}
          expanded={closedExpanded}
          onToggle={() => setClosedExpanded((v) => !v)}
          selectedIds={selection.selected}
          onToggleSelect={handleToggleSelect}
          pendingApplicationIds={pendingIds}
        />
      </div>

      <DragOverlay dropAnimation={DROP_ANIMATION}>
        {activeApp ? (
          <KanbanCard
            application={activeApp}
            isOverlay
            selected={selection.selected.has(activeApp.id)}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function LiveIndicator({ isConnected }: { isConnected: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2 px-2.5 py-1 border border-[var(--rule)] bg-white"
      title={
        isConnected
          ? "Live sync is active. Teammate moves appear within seconds."
          : "Reconnecting to live sync. Your changes still save."
      }
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isConnected
            ? "bg-emerald-500 animate-pulse"
            : "bg-slate-300"
        }`}
        aria-hidden="true"
      />
      <span className="text-[10px] font-bold tracking-[2px] uppercase text-slate-body">
        {isConnected ? "Live" : "Reconnecting…"}
      </span>
    </div>
  );
}

/**
 * Sticky selection toolbar. Sticks to `top-[80px]` to clear the existing
 * employer-shell nav offset used elsewhere in the app. Bulk-action buttons
 * are placeholders — disabled with a tooltip — until sprint feature #3
 * wires the move-many / reject-many mutations.
 */
function SelectionToolbar({
  count,
  onClear,
}: {
  count: number;
  onClear: () => void;
}) {
  const baseBtn =
    "inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold tracking-[1.5px] uppercase border transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className="sticky top-[80px] z-30 flex flex-wrap items-center justify-between gap-3 border border-heritage/40 bg-heritage/[0.08] px-4 py-2.5">
      <div className="flex items-center gap-3 text-[13px] text-heritage-deep">
        <span className="font-bold">{count} selected</span>
        <span className="text-slate-meta">·</span>
        <button
          type="button"
          onClick={onClear}
          className="text-heritage-deep underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-offset-2"
        >
          Clear selection
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled
          title="Bulk actions arrive soon"
          className={`${baseBtn} border-heritage/30 text-heritage-deep bg-white`}
        >
          Move to…
        </button>
        <button
          type="button"
          disabled
          title="Bulk actions arrive soon"
          className={`${baseBtn} border-red-300 text-red-700 bg-white`}
        >
          Reject…
        </button>
      </div>
    </div>
  );
}

function stageFromDroppableId(id: string): ApplicationStatus | null {
  if (id === CLOSED_DROPPABLE_ID) return "rejected";
  if (id.startsWith("column:")) {
    const stage = id.slice("column:".length);
    if ((KANBAN_STAGES as readonly string[]).includes(stage)) {
      return stage as ApplicationStatus;
    }
  }
  return null;
}

function ClosedLane({
  rejectedApps,
  withdrawnApps,
  closedCount,
  expanded,
  onToggle,
  selectedIds,
  onToggleSelect,
  pendingApplicationIds,
}: {
  rejectedApps: KanbanApplication[];
  withdrawnApps: KanbanApplication[];
  closedCount: number;
  expanded: boolean;
  onToggle: () => void;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  pendingApplicationIds: ReadonlySet<string>;
}) {
  // Lane wrapper is itself a droppable so cards can be dragged onto the
  // collapsed strip without expanding it first. Drop = rejected (withdrawn
  // is candidate-side only).
  const { isOver, setNodeRef } = useDroppable({
    id: CLOSED_DROPPABLE_ID,
    data: { type: "column", status: "rejected" as const },
  });

  return (
    <div
      ref={setNodeRef}
      className={`border bg-white transition-colors ${
        isOver
          ? "border-red-400 ring-2 ring-inset ring-red-300/50"
          : "border-[var(--rule)]"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-cream transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-inset"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-slate-meta" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-meta" />
          )}
          <span className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-body">
            {isOver
              ? "Drop to reject"
              : expanded
                ? "Hide closed"
                : "Show closed"}
          </span>
          <span className="text-[10px] font-bold text-slate-meta tabular-nums">
            {closedCount}
          </span>
        </div>
      </button>

      {/* Smooth expand/collapse via grid-rows trick — keeps content in DOM
          for measurement, animates max-height without a JS observer. */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-[var(--rule)]">
            <ClosedSubsection
              label="Rejected"
              apps={rejectedApps}
              variant="rejected"
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              pendingApplicationIds={pendingApplicationIds}
            />
            <ClosedSubsection
              label="Withdrawn"
              apps={withdrawnApps}
              variant="withdrawn"
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              pendingApplicationIds={pendingApplicationIds}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ClosedSubsection({
  label,
  apps,
  variant,
  selectedIds,
  onToggleSelect,
  pendingApplicationIds,
}: {
  label: string;
  apps: KanbanApplication[];
  variant: "rejected" | "withdrawn";
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  pendingApplicationIds: ReadonlySet<string>;
}) {
  return (
    <section className="border-b border-[var(--rule)] last:border-0">
      <header className="px-5 py-2 bg-cream/40 flex items-center gap-3">
        <span className="text-[9px] font-bold tracking-[2px] uppercase text-slate-meta">
          {label}
        </span>
        <span className="text-[9px] font-bold text-slate-meta tabular-nums">
          {apps.length}
        </span>
      </header>
      <div className="divide-y divide-[var(--rule)]">
        {apps.length === 0 ? (
          <div className="px-5 py-3 text-[12px] text-slate-meta italic">
            Nothing here yet.
          </div>
        ) : variant === "rejected" ? (
          apps.map((app) => (
            <div key={app.id} className="px-2 py-2">
              <KanbanCard
                application={app}
                pending={pendingApplicationIds.has(app.id)}
                selected={selectedIds.has(app.id)}
                onToggleSelect={onToggleSelect}
              />
            </div>
          ))
        ) : (
          apps.map((app) => <WithdrawnRow key={app.id} application={app} />)
        )}
      </div>
    </section>
  );
}

/**
 * Withdrawn rows are intentionally NOT a draggable card and NOT selectable.
 * Italic candidate name signals "this candidate took themselves out" — no
 * recruiter action available except viewing the detail page.
 */
function WithdrawnRow({ application }: { application: KanbanApplication }) {
  const cand = application.candidate;
  return (
    <Link
      href={`/employer/applications/${application.id}`}
      className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-cream transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-inset"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[13px] italic font-semibold text-slate-body truncate">
          {cand?.full_name ?? "Anonymous candidate"}
        </div>
        <div className="text-[11px] text-slate-meta truncate">
          Withdrawn · {new Date(application.created_at).toLocaleDateString()}
        </div>
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-slate-meta flex-shrink-0" />
    </Link>
  );
}
