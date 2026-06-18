/**
 * <KanbanBoard> — pipeline board for one job, with drag-drop, realtime sync,
 * and a11y/multi-select. Configurable per-DSO stages as of Track B (2026-05-12).
 *
 * Architecture:
 *  - Base state lives in `useRealtimeApplications`; it owns the committed
 *    truth, listens to `postgres_changes` UPDATEs scoped to this job_id, and
 *    reconciles into local state. Self-echoes are filtered via the shared
 *    `pendingMovesRef` (now keyed by next stage_id, not status enum).
 *  - `useOptimistic` layers in-flight moves on top of base state so the
 *    dragged card visually snaps to the new column the instant it's dropped.
 *  - Columns are now driven by the DSO's live `dso_pipeline_stages` list
 *    (visible, non-terminal). The "closed lane" is the terminal stages
 *    (rejected + withdrawn kinds) collapsed into a single droppable area.
 *  - droppable IDs are `column:<stage_id>` and `column:closed`; the closed
 *    drop target maps to the DSO's default rejected-kind stage at server
 *    action time.
 *
 * Self-echo prevention:
 *  - `pendingMovesRef` records `applicationId -> expectedStageId`.
 *  - Realtime hook clears successful entries when the echo arrives; we clear
 *    failure-path entries here.
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
import { useRouter } from "next/navigation";
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
  KIND_DEFAULT_LABELS,
  isTerminalKind,
  partitionStagesForKanban,
  type PipelineStage,
  type StageKind,
} from "@/lib/applications/stages";
import { moveApplicationStage } from "@/app/employer/(app)/applications/[id]/actions";
import {
  bulkMoveApplications,
  bulkRejectApplications,
  bulkArchiveApplications,
  type BulkActionResult,
} from "./bulk-actions";
import { bulkMessageApplications } from "@/lib/messages/actions";
import type { ApplicationsListItem } from "./applications-list";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import {
  useRealtimeApplications,
  type RemoteChangeEvent,
} from "./use-realtime-applications";
import { useBulkSelection } from "./use-bulk-selection";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RejectReasonAiSuggester } from "@/app/employer/(app)/applications/[id]/reject-reason-ai-suggester";
import { DispositionSelect } from "@/components/applications/disposition-select";
import {
  validateDisposition,
  type DispositionKind,
} from "@/lib/applications/disposition-reasons";
import type { ApplicationTag } from "@/lib/applications/tags";

export interface KanbanApplication extends ApplicationsListItem {
  stage_entered_at: string;
  pipeline_position: number | null;
  comment_count: number;
  scorecard_avg: number | null;
  scorecard_reviewer_count: number;
  tags: ApplicationTag[];
}

interface KanbanBoardProps {
  applications: KanbanApplication[];
  /**
   * The DSO's pipeline stages — drives the column list + the terminal
   * (closed lane) partition. Passed from the server entry; reseeded if
   * the prop changes.
   */
  stages: PipelineStage[];
  aiSuggesterAvailable: boolean;
  aiSuggesterContextByAppId: Record<string, boolean>;
  canBulkAct?: boolean;
  /**
   * FOH-10 (Day 32) — Pipeline HQ passes the full DSO job-id set so the
   * realtime subscription covers every job on the cross-job board.
   * Omitted on the per-job board, which keeps deriving the single id
   * from its applications (unchanged behavior).
   */
  realtimeJobIds?: string[];
  /**
   * Lane 5 — DSO trailing-90 median dwell per stage kind (lib/
   * applications/stage-dwell). Drives the column-health header tone.
   * Optional: absent → columns render neutral health.
   */
  dwellNorms?: Record<string, number>;
  /**
   * Lane 5 — swimlane accessor. When provided, the toolbar offers a
   * "Lanes" toggle that visually groups each column's cards under
   * dashed labels (purely presentational — droppables and drag are
   * untouched). Pipeline HQ passes the job title; the per-job board
   * omits this (no per-application location exists to lane by).
   */
  laneAccessor?: (app: KanbanApplication) => string;
}

interface OptimisticMove {
  type: "move";
  applicationId: string;
  nextStageId: string;
  nextKind: StageKind;
  nextStageEnteredAt: string;
}

interface ErrorState {
  kind: "network" | "denied";
  candidateName: string;
  stageLabel: string;
  /** Server-side reason (Track B follow-up — surface the real error
   *  instead of always rendering "no permission") */
  reason: string | null;
  pendingMove: {
    applicationId: string;
    nextStageId: string;
    nextKind: StageKind;
    prevStageId: string;
    prevKind: StageKind;
  } | null;
}

interface RemoteToast {
  applicationId: string;
  candidateName: string;
  stageLabel: string;
}

interface BulkResultBanner {
  succeededCount: number;
  actionLabel: string; // "Moved", "Rejected", "Archived"
  destinationLabel: string;
  destinationKind: StageKind | null;
  /** Exact destination stage_id — preserved so a Retry routes to the
   * same column the user originally clicked, not just any stage of the
   * same kind. Null for Reject/Archive paths which resolve server-side. */
  destinationStageId: string | null;
  failures: Array<{ id: string; candidateName: string; error: string }>;
}

const CLOSED_DROPPABLE_ID = "column:closed";

const DROP_ANIMATION: DropAnimation = {
  duration: 150,
  easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.3" } },
  }),
};

export function KanbanBoard({
  applications,
  stages,
  aiSuggesterAvailable,
  aiSuggesterContextByAppId,
  canBulkAct = true,
  realtimeJobIds,
  dwellNorms,
  laneAccessor,
}: KanbanBoardProps) {
  const [closedExpanded, setClosedExpanded] = useState(false);

  // ── Lane 5 board modes ─────────────────────────────────────────
  // Density / focus / lanes are personal working preferences —
  // persisted globally (not per job) in localStorage. SSR renders the
  // defaults; the hydrate effect syncs after mount (the accepted
  // expanded-SSR-flash pattern, same as the sidebar collapse).
  const [density, setDensity] = useState<"comfy" | "compact">("comfy");
  const [focusMode, setFocusMode] = useState(false);
  const [lanesOn, setLanesOn] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem("dsohire.board.density") === "compact") {
      setDensity("compact");
    }
    if (window.localStorage.getItem("dsohire.board.focus") === "on") {
      setFocusMode(true);
    }
    if (window.localStorage.getItem("dsohire.board.lanes") === "on") {
      setLanesOn(true);
    }
  }, []);
  function selectDensity(next: "comfy" | "compact") {
    setDensity(next);
    window.localStorage.setItem("dsohire.board.density", next);
  }
  function toggleFocus() {
    setFocusMode((v) => {
      window.localStorage.setItem("dsohire.board.focus", v ? "off" : "on");
      return !v;
    });
  }
  function toggleLanes() {
    setLanesOn((v) => {
      window.localStorage.setItem("dsohire.board.lanes", v ? "off" : "on");
      return !v;
    });
  }
  const [activeId, setActiveId] = useState<string | null>(null);
  // Set on drag start when the active card is part of a multi-select.
  // Frozen for the duration of the drag so the move uses the exact
  // selection at pickup time even if the user changes selection mid-drag.
  // Null when the drag is a normal single-card move.
  const [bulkDragIds, setBulkDragIds] = useState<string[] | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [remoteToast, setRemoteToast] = useState<RemoteToast | null>(null);
  const [bulkBanner, setBulkBanner] = useState<BulkResultBanner | null>(null);
  const [bulkInFlight, setBulkInFlight] = useState(false);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  // Last broadcast body — lets the result banner's Retry resend to the
  // failed subset without re-opening the compose dialog.
  const lastBulkMessageBodyRef = useRef<string>("");
  // #8 — remember the last reject/archive (reason, disposition) so a retry
  // from the failure banner re-applies the same documented reason instead of
  // closing candidates with no code (which the server now rejects).
  const lastRejectRef = useRef<{ reason: string; code: string | null }>({
    reason: "",
    code: null,
  });
  const lastArchiveRef = useRef<{ reason: string; code: string | null }>({
    reason: "",
    code: null,
  });
  const router = useRouter();
  const [, startTransition] = useTransition();

  // pendingMovesRef tracks {applicationId -> expectedStageId}.
  const pendingMovesRef = useRef<Map<string, string>>(new Map());

  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(
    new Set<string>()
  );

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const selection = useBulkSelection();

  // Compute the kanban + terminal lanes from the DSO's stages list.
  const { kanban: kanbanStages, terminal: terminalStages } = useMemo(
    () => partitionStagesForKanban(stages),
    [stages]
  );

  // Quick lookups.
  const stageById = useMemo(
    () => new Map(stages.map((s) => [s.id, s])),
    [stages]
  );

  // First rejected-kind row in sort_order — that's the destination for a
  // drop on the closed lane (the most natural recruiter-driven terminal).
  const rejectedStage = useMemo(
    () => terminalStages.find((s) => s.kind === "rejected") ?? null,
    [terminalStages]
  );

  const { applications: appsState, isConnected, commitLocal, reseed } =
    useRealtimeApplications({
      jobId: realtimeJobIds ?? (applications[0]?.job_id ?? ""),
      initialApplications: applications,
      pendingMovesRef,
      onRemoteChange: (event: RemoteChangeEvent) => {
        const row = stageById.get(event.nextStageId);
        const stageLabel =
          row?.label ?? KIND_DEFAULT_LABELS[event.nextKind] ?? null;
        if (!stageLabel) return;
        setRemoteToast({
          applicationId: event.applicationId,
          candidateName: event.candidateName ?? "a candidate",
          stageLabel,
        });
      },
    });

  // Reseed on parent prop change. Hash by id+stage_id so we don't clobber
  // realtime updates with a stale prop.
  const lastSeedKeyRef = useRef<string>("");
  useEffect(() => {
    const key = applications.map((a) => `${a.id}:${a.stage_id}`).join("|");
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
            stage_id: action.nextStageId,
            kind: action.nextKind,
            stage_entered_at: action.nextStageEnteredAt,
          }
        : app
    );
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor)
  );

  // Bucket apps by stage_id for rendering.
  const byStageId = useMemo(() => {
    const m = new Map<string, KanbanApplication[]>();
    for (const stage of kanbanStages) m.set(stage.id, []);
    for (const stage of terminalStages) m.set(stage.id, []);
    for (const app of optimisticApps) {
      const bucket = m.get(app.stage_id);
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
  }, [optimisticApps, kanbanStages, terminalStages]);

  // Apps in any rejected-kind stage (drop-target lane) vs withdrawn-kind
  // (read-only). Collapse all rejected-kind rows across all rejected
  // stages into one list — same for withdrawn.
  const rejectedApps = useMemo(() => {
    const out: KanbanApplication[] = [];
    for (const s of terminalStages) {
      if (s.kind === "rejected") {
        out.push(...(byStageId.get(s.id) ?? []));
      }
    }
    return out;
  }, [byStageId, terminalStages]);

  const withdrawnApps = useMemo(() => {
    const out: KanbanApplication[] = [];
    for (const s of terminalStages) {
      if (s.kind === "withdrawn") {
        out.push(...(byStageId.get(s.id) ?? []));
      }
    }
    return out;
  }, [byStageId, terminalStages]);

  const closedCount = rejectedApps.length + withdrawnApps.length;

  // Column-major id-order array for shift-click range select. Excludes
  // withdrawn rows. Open columns first in sort order, then rejected.
  const selectionOrder = useMemo<string[]>(() => {
    const out: string[] = [];
    for (const stage of kanbanStages) {
      for (const app of byStageId.get(stage.id) ?? []) out.push(app.id);
    }
    for (const app of rejectedApps) out.push(app.id);
    return out;
  }, [byStageId, kanbanStages, rejectedApps]);

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
    const id = String(event.active.id);
    setActiveId(id);
    // If the dragged card is currently selected AND the selection has
    // more than one card, treat this as a bulk drag. Freeze the id list
    // here so the move uses what was selected at pickup, even if the
    // user toggles selection mid-drag.
    if (selection.selected.has(id) && selection.selected.size > 1) {
      setBulkDragIds(Array.from(selection.selected));
    } else {
      setBulkDragIds(null);
    }
  }

  const runMove = useCallback(
    (
      applicationId: string,
      nextStageId: string,
      nextKind: StageKind,
      prevStageId: string,
      prevKind: StageKind,
      candidateName: string
    ) => {
      const nextStageEnteredAt = new Date().toISOString();

      pendingMovesRef.current.set(applicationId, nextStageId);
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
          nextStageId,
          nextKind,
          nextStageEnteredAt,
        });

        let result:
          | {
              ok: true;
              nextStageId: string;
              nextKind: StageKind;
              stageEnteredAt: string;
            }
          | { ok: false; error: string; networkError?: boolean };
        try {
          const raw = await moveApplicationStage(applicationId, {
            stageId: nextStageId,
          });
          if (raw.ok) {
            result = {
              ok: true,
              nextStageId: raw.nextStageId,
              nextKind: raw.nextKind,
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

        if (!isMountedRef.current) return;

        if (result.ok) {
          commitLocal(
            applicationId,
            result.nextStageId,
            result.nextKind,
            result.stageEnteredAt
          );
          // OFFER-UX — moving a single card into the Offer stage jumps to
          // that candidate's offer composer (opened via ?compose=offer)
          // instead of leaving the recruiter to find it on the detail page.
          // Single-card moves only (bulk goes through a separate path).
          if (result.nextKind === "offer" && prevKind !== "offer") {
            router.push(
              `/employer/applications/${applicationId}?compose=offer`
            );
          }
        } else {
          pendingMovesRef.current.delete(applicationId);
          const prevLabel =
            stageById.get(prevStageId)?.label ??
            KIND_DEFAULT_LABELS[prevKind];
          setError({
            kind: result.networkError ? "network" : "denied",
            candidateName,
            stageLabel: prevLabel,
            reason: result.error ?? null,
            pendingMove: result.networkError
              ? {
                  applicationId,
                  nextStageId,
                  nextKind,
                  prevStageId,
                  prevKind,
                }
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
    [applyOptimistic, commitLocal, stageById]
  );

  // Lane 5 — hover quick-advance: moves a card one forward stage via
  // the EXACT runMove path drag uses (optimistic move, server guard,
  // error banner, offer-compose redirect all inherit). Null when the
  // card already sits in the last forward column.
  const quickAdvanceFor = useCallback(
    (app: KanbanApplication) => {
      const idx = kanbanStages.findIndex((s) => s.id === app.stage_id);
      if (idx < 0 || idx >= kanbanStages.length - 1) return null;
      const next = kanbanStages[idx + 1];
      return {
        title: `Advance to ${next.label}`,
        run: () =>
          runMove(
            app.id,
            next.id,
            next.kind,
            app.stage_id,
            app.kind,
            app.candidate?.full_name ?? "Anonymous candidate"
          ),
      };
    },
    [kanbanStages, runMove]
  );

  const runBulkAction = useCallback(
    (
      actionFn: () => Promise<BulkActionResult>,
      params: {
        nextStageId: string;
        nextKind: StageKind;
        actionLabel: string;
        destinationLabel: string;
        ids: string[];
      }
    ) => {
      const { nextStageId, nextKind, actionLabel, destinationLabel, ids } =
        params;
      if (ids.length === 0 || bulkInFlight) return;

      const snapshots = new Map<
        string,
        {
          candidateName: string;
          prevStageId: string;
          prevKind: StageKind;
        }
      >();
      for (const id of ids) {
        const app = optimisticApps.find((a) => a.id === id);
        if (!app) continue;
        snapshots.set(id, {
          candidateName: app.candidate?.full_name ?? "Anonymous candidate",
          prevStageId: app.stage_id,
          prevKind: app.kind,
        });
      }

      for (const id of ids) {
        pendingMovesRef.current.set(id, nextStageId);
      }
      if (isMountedRef.current) {
        setPendingIds((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.add(id);
          return next;
        });
      }
      setBulkInFlight(true);
      setBulkBanner(null);
      setError(null);

      const nextStageEnteredAt = new Date().toISOString();

      startTransition(async () => {
        for (const id of ids) {
          applyOptimistic({
            type: "move",
            applicationId: id,
            nextStageId,
            nextKind,
            nextStageEnteredAt,
          });
        }

        let result: BulkActionResult;
        try {
          result = await actionFn();
        } catch (err) {
          if (!isMountedRef.current) return;
          const message =
            err instanceof Error ? err.message : "Unexpected error";
          for (const id of ids) pendingMovesRef.current.delete(id);
          setPendingIds((prev) => {
            const next = new Set(prev);
            for (const id of ids) next.delete(id);
            return next;
          });
          setBulkBanner({
            succeededCount: 0,
            actionLabel,
            destinationLabel,
            destinationKind: nextKind,
            destinationStageId: nextStageId,
            failures: ids.map((id) => ({
              id,
              candidateName:
                snapshots.get(id)?.candidateName ?? "Anonymous candidate",
              error: message,
            })),
          });
          setBulkInFlight(false);
          return;
        }

        if (!isMountedRef.current) return;

        const succeededIds = new Set(result.succeeded.map((s) => s.id));

        for (const ok of result.succeeded) {
          commitLocal(
            ok.id,
            ok.nextStageId,
            ok.nextKind,
            ok.stageEnteredAt
          );
        }

        for (const fail of result.failed) {
          pendingMovesRef.current.delete(fail.id);
        }

        setPendingIds((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.delete(id);
          return next;
        });

        const failures = result.failed.map((f) => ({
          id: f.id,
          candidateName:
            snapshots.get(f.id)?.candidateName ?? "Anonymous candidate",
          error: f.error,
        }));
        setBulkBanner({
          succeededCount: result.succeeded.length,
          actionLabel,
          destinationLabel,
          destinationKind: nextKind,
          destinationStageId: nextStageId,
          failures,
        });

        const surviving: string[] = [];
        for (const id of selection.selected) {
          if (!succeededIds.has(id)) surviving.push(id);
        }
        selection.selectAll(surviving);

        setBulkInFlight(false);
      });
    },
    [
      applyOptimistic,
      commitLocal,
      optimisticApps,
      selection,
      bulkInFlight,
    ]
  );

  const selectedIdsArray = useMemo(
    () => Array.from(selection.selected),
    [selection.selected]
  );

  function handleBulkMove(stage: PipelineStage) {
    setMoveMenuOpen(false);
    runBulkAction(
      // Pass the exact stage.id — the bulk API used to take kind and
      // collapse to the DSO's default stage of that kind, which silently
      // no-op'd when the user clicked a non-default column sharing a
      // kind with the default (e.g. Phone Screening + Interview both
      // kind=interview). See bulk-actions.ts header for the diagnosis.
      () => bulkMoveApplications(selectedIdsArray, stage.id),
      {
        nextStageId: stage.id,
        nextKind: stage.kind,
        actionLabel: "Moved",
        destinationLabel: `to ${stage.label}`,
        ids: selectedIdsArray,
      }
    );
  }

  function handleBulkReject(reason: string, dispositionCode: string | null) {
    setRejectDialogOpen(false);
    if (!rejectedStage) return;
    lastRejectRef.current = { reason, code: dispositionCode };
    runBulkAction(
      () => bulkRejectApplications(selectedIdsArray, reason, dispositionCode),
      {
        nextStageId: rejectedStage.id,
        nextKind: "rejected",
        actionLabel: "Rejected",
        destinationLabel: "",
        ids: selectedIdsArray,
      }
    );
  }

  function handleBulkArchive(reason: string, dispositionCode: string | null) {
    setArchiveDialogOpen(false);
    const withdrawnStage =
      terminalStages.find((s) => s.kind === "withdrawn") ?? null;
    if (!withdrawnStage) return;
    lastArchiveRef.current = { reason, code: dispositionCode };
    runBulkAction(
      () => bulkArchiveApplications(selectedIdsArray, reason, dispositionCode),
      {
        nextStageId: withdrawnStage.id,
        nextKind: "withdrawn",
        actionLabel: "Archived",
        destinationLabel: "",
        ids: selectedIdsArray,
      }
    );
  }

  function runBulkMessage(ids: string[], body: string) {
    if (ids.length === 0 || bulkInFlight) return;
    lastBulkMessageBodyRef.current = body;
    const nameById = new Map<string, string>();
    for (const id of ids) {
      const app = optimisticApps.find((a) => a.id === id);
      nameById.set(id, app?.candidate?.full_name ?? "Anonymous candidate");
    }
    setBulkInFlight(true);
    setBulkBanner(null);
    setError(null);
    startTransition(async () => {
      let result: { succeeded: string[]; failed: { id: string; error: string }[] };
      try {
        result = await bulkMessageApplications(ids, body);
      } catch (err) {
        if (!isMountedRef.current) return;
        const message = err instanceof Error ? err.message : "Unexpected error";
        setBulkBanner({
          succeededCount: 0,
          actionLabel: "Messaged",
          destinationLabel: "",
          destinationKind: null,
          destinationStageId: null,
          failures: ids.map((id) => ({
            id,
            candidateName: nameById.get(id) ?? "Anonymous candidate",
            error: message,
          })),
        });
        setBulkInFlight(false);
        return;
      }
      if (!isMountedRef.current) return;
      setBulkBanner({
        succeededCount: result.succeeded.length,
        actionLabel: "Messaged",
        destinationLabel: "",
        destinationKind: null,
        destinationStageId: null,
        failures: result.failed.map((f) => ({
          id: f.id,
          candidateName: nameById.get(f.id) ?? "Anonymous candidate",
          error: f.error,
        })),
      });
      if (result.succeeded.length > 0) selection.clear();
      setBulkInFlight(false);
    });
  }

  function handleBulkMessage(body: string) {
    setMessageDialogOpen(false);
    runBulkMessage(selectedIdsArray, body);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    // Capture bulk state before clearing — handleDragCancel / state
    // resets fire synchronously below.
    const bulkIds = bulkDragIds;
    setActiveId(null);
    setBulkDragIds(null);
    if (!over) return;

    // Resolve target stage. Drop targets are either `column:<stage_id>`
    // (a real DSO stage row) or `column:closed` (the rejected drop zone).
    let nextStage: PipelineStage | null = null;
    if (over.id === CLOSED_DROPPABLE_ID) {
      nextStage = rejectedStage;
    } else {
      const overData = over.data.current as
        | { type: "column"; stageId?: string }
        | undefined;
      if (overData?.type === "column" && overData.stageId) {
        nextStage = stageById.get(overData.stageId) ?? null;
      }
    }
    if (!nextStage) return;

    // Bulk-drag path — drop the whole selection on the target column.
    // Filters out cards that are already in the destination so the
    // bulk impl's no-op short-circuit doesn't double-count them in
    // the "moved N" banner.
    if (bulkIds && bulkIds.length > 1) {
      const movingIds = bulkIds.filter((id) => {
        const a = optimisticApps.find((x) => x.id === id);
        return a && a.stage_id !== nextStage!.id;
      });
      if (movingIds.length === 0) return;
      runBulkAction(
        () => bulkMoveApplications(movingIds, nextStage!.id),
        {
          nextStageId: nextStage.id,
          nextKind: nextStage.kind,
          actionLabel: "Moved",
          destinationLabel: `to ${nextStage.label}`,
          ids: movingIds,
        }
      );
      return;
    }

    // Single-card path.
    const applicationId = String(active.id);
    const app = optimisticApps.find((a) => a.id === applicationId);
    if (!app) return;
    if (app.stage_id === nextStage.id) return;

    const candidateName = app.candidate?.full_name ?? "Anonymous candidate";
    runMove(
      applicationId,
      nextStage.id,
      nextStage.kind,
      app.stage_id,
      app.kind,
      candidateName
    );
  }

  useEffect(() => {
    const inFlight = activeId !== null || pendingIds.size > 0;
    if (!inFlight) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activeId, pendingIds]);

  function handleDragCancel() {
    setActiveId(null);
    setBulkDragIds(null);
  }

  // Track start stage for SR announcements.
  const dragStartStageRef = useRef<string | null>(null);

  function labelForDroppable(droppableId: string): string | null {
    if (droppableId === CLOSED_DROPPABLE_ID) {
      return rejectedStage?.label ?? KIND_DEFAULT_LABELS.rejected;
    }
    if (droppableId.startsWith("column:")) {
      const id = droppableId.slice("column:".length);
      const row = stageById.get(id);
      if (!row) return null;
      return row.label;
    }
    return null;
  }

  const announcements: Announcements = useMemo(
    () => ({
      onDragStart({ active }) {
        const app = optimisticApps.find((a) => a.id === active.id);
        const name = app?.candidate?.full_name ?? "Anonymous candidate";
        const stageLabel = app
          ? stageById.get(app.stage_id)?.label ??
            KIND_DEFAULT_LABELS[app.kind]
          : "the board";
        dragStartStageRef.current = app?.stage_id ?? null;
        // Bulk: the active card is in a multi-select. State already
        // computed in handleDragStart; mirror the size check here so SR
        // copy matches what'll actually happen on drop.
        const isBulk =
          selection.selected.has(String(active.id)) &&
          selection.selected.size > 1;
        if (isBulk) {
          return (
            `Picked up ${selection.selected.size} candidates from ${stageLabel}. ` +
            `Use arrow keys to move between columns. ` +
            `Press Space to drop. Press Escape to cancel.`
          );
        }
        return (
          `Picked up ${name} from ${stageLabel}. ` +
          `Use arrow keys to move between columns. ` +
          `Press Space to drop. Press Escape to cancel.`
        );
      },
      onDragOver({ active, over }) {
        if (!over) return undefined;
        const targetLabel = labelForDroppable(String(over.id));
        if (!targetLabel) return undefined;
        const app = optimisticApps.find((a) => a.id === active.id);
        const name = app?.candidate?.full_name ?? "Card";
        const startStageId = dragStartStageRef.current;
        const isBulk =
          selection.selected.has(String(active.id)) &&
          selection.selected.size > 1;
        if (isBulk) {
          return `Drop ${selection.selected.size} candidates on ${targetLabel}?`;
        }
        if (
          startStageId &&
          (String(over.id) === `column:${startStageId}` ||
            (over.id === CLOSED_DROPPABLE_ID &&
              stageById.get(startStageId)?.kind === "rejected"))
        ) {
          return `Return ${name} to ${targetLabel}?`;
        }
        return `Drop ${name} on ${targetLabel}?`;
      },
      onDragEnd({ active, over }) {
        const app = optimisticApps.find((a) => a.id === active.id);
        const name = app?.candidate?.full_name ?? "Card";
        const startStageId = dragStartStageRef.current;
        const isBulk =
          selection.selected.has(String(active.id)) &&
          selection.selected.size > 1;
        const bulkCount = selection.selected.size;
        dragStartStageRef.current = null;
        if (!over) {
          const homeLabel = startStageId
            ? stageById.get(startStageId)?.label ?? "its column"
            : "its column";
          return isBulk
            ? `Cancelled. ${bulkCount} candidates returned to their columns.`
            : `Cancelled. ${name} returned to ${homeLabel}.`;
        }
        const targetLabel = labelForDroppable(String(over.id));
        if (!targetLabel) {
          const homeLabel = startStageId
            ? stageById.get(startStageId)?.label ?? "its column"
            : "its column";
          return isBulk
            ? `Cancelled. ${bulkCount} candidates returned to their columns.`
            : `Cancelled. ${name} returned to ${homeLabel}.`;
        }
        return isBulk
          ? `Moved ${bulkCount} candidates to ${targetLabel}.`
          : `Moved ${name} to ${targetLabel}.`;
      },
      onDragCancel({ active }) {
        const app = optimisticApps.find((a) => a.id === active.id);
        const name = app?.candidate?.full_name ?? "Card";
        const startStageId = dragStartStageRef.current;
        const isBulk =
          selection.selected.has(String(active.id)) &&
          selection.selected.size > 1;
        const bulkCount = selection.selected.size;
        dragStartStageRef.current = null;
        if (isBulk) {
          return `Cancelled. ${bulkCount} candidates returned to their columns.`;
        }
        const homeLabel = startStageId
          ? stageById.get(startStageId)?.label ?? "its column"
          : app
            ? stageById.get(app.stage_id)?.label ?? "its column"
            : "its column";
        return `Cancelled. ${name} returned to ${homeLabel}.`;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [optimisticApps, stageById, rejectedStage?.label, selection.selected]
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
      <div
        className={`space-y-4 ${density === "compact" ? "kb-compact" : ""} ${
          focusMode ? "kb-focus" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <LiveIndicator isConnected={isConnected} />
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 border border-red-300 bg-red-50 px-4 py-3"
          >
            <AlertCircle className="h-4 w-4 text-red-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-[14px] text-red-900 leading-relaxed">
              {error.kind === "network" ? (
                <>
                  <span className="font-bold">Move failed.</span> Check your
                  connection and try again.
                </>
              ) : (
                <>
                  <span className="font-bold">
                    Couldn&apos;t move {error.candidateName}.
                  </span>{" "}
                  Status reverted to {error.stageLabel}.
                  {error.reason && (
                    <>
                      {" "}
                      <span className="block mt-1 text-[12px] text-red-800">
                        Server said: {error.reason}
                      </span>
                    </>
                  )}
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
                    move.nextStageId,
                    move.nextKind,
                    move.prevStageId,
                    move.prevKind,
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
            <div className="flex-1 text-[14px] text-heritage-deep leading-relaxed">
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

        {selection.count > 0 && canBulkAct && (
          <SelectionToolbar
            count={selection.count}
            onClear={selection.clear}
            disabled={bulkInFlight}
            moveMenuOpen={moveMenuOpen}
            onMoveMenuOpenChange={setMoveMenuOpen}
            moveStages={kanbanStages}
            onMove={handleBulkMove}
            onOpenMessage={() => setMessageDialogOpen(true)}
            onOpenReject={() => setRejectDialogOpen(true)}
            onOpenArchive={() => setArchiveDialogOpen(true)}
          />
        )}

        {bulkBanner && (
          <BulkResultDisplay
            banner={bulkBanner}
            onDismiss={() => setBulkBanner(null)}
            onRetry={() => {
              if (bulkBanner.failures.length === 0) return;
              const ids = bulkBanner.failures.map((f) => f.id);
              const banner = bulkBanner;
              setBulkBanner(null);
              if (banner.actionLabel === "Moved" && banner.destinationStageId) {
                // Retry against the EXACT stage the user originally clicked
                // — look up by stage_id, not kind. Pre-fix this routed
                // through `s.kind === banner.destinationKind` which would
                // pick whichever stage of that kind sat first in the list
                // (typically the default), losing the user's choice when
                // multiple stages shared a kind.
                const stage = kanbanStages.find(
                  (s) => s.id === banner.destinationStageId
                );
                if (!stage) return;
                runBulkAction(
                  () => bulkMoveApplications(ids, stage.id),
                  {
                    nextStageId: stage.id,
                    nextKind: stage.kind,
                    actionLabel: "Moved",
                    destinationLabel: banner.destinationLabel,
                    ids,
                  }
                );
              } else if (banner.actionLabel === "Rejected") {
                if (!rejectedStage) return;
                runBulkAction(
                  () =>
                    bulkRejectApplications(
                      ids,
                      lastRejectRef.current.reason,
                      lastRejectRef.current.code
                    ),
                  {
                    nextStageId: rejectedStage.id,
                    nextKind: "rejected",
                    actionLabel: "Rejected",
                    destinationLabel: "",
                    ids,
                  }
                );
              } else if (banner.actionLabel === "Archived") {
                const withdrawnStage =
                  terminalStages.find((s) => s.kind === "withdrawn") ?? null;
                if (!withdrawnStage) return;
                runBulkAction(
                  () =>
                    bulkArchiveApplications(
                      ids,
                      lastArchiveRef.current.reason,
                      lastArchiveRef.current.code
                    ),
                  {
                    nextStageId: withdrawnStage.id,
                    nextKind: "withdrawn",
                    actionLabel: "Archived",
                    destinationLabel: "",
                    ids,
                  }
                );
              } else if (banner.actionLabel === "Messaged") {
                // Resend the same broadcast body to just the failed ids.
                runBulkMessage(ids, lastBulkMessageBodyRef.current);
              }
            }}
          />
        )}

        <BulkConfirmDialog
          open={rejectDialogOpen}
          onOpenChange={setRejectDialogOpen}
          title="Reject candidates"
          variant="destructive"
          count={selection.count}
          confirmLabel="Reject"
          reasonHelper="This appears in your team's audit log; the candidate doesn't see it."
          dispositionKind="rejected"
          dispositionRequired
          onConfirm={handleBulkReject}
          aiSuggester={{
            available: aiSuggesterAvailable,
            singleApplicationId:
              selection.count === 1 ? selectedIdsArray[0] : null,
            singleApplicationHasContext:
              selection.count === 1
                ? Boolean(
                    aiSuggesterContextByAppId[selectedIdsArray[0] ?? ""]
                  )
                : false,
          }}
        />

        <BulkConfirmDialog
          open={archiveDialogOpen}
          onOpenChange={setArchiveDialogOpen}
          title="Archive candidates"
          variant="neutral"
          count={selection.count}
          confirmLabel="Archive"
          reasonHelper="Archiving moves these candidates out of the active pipeline. Visible to your team only."
          dispositionKind="withdrawn"
          onConfirm={handleBulkArchive}
        />

        <BulkMessageDialog
          open={messageDialogOpen}
          onOpenChange={setMessageDialogOpen}
          count={selection.count}
          onConfirm={handleBulkMessage}
        />


        {/* Lane 5 — board toolbar: modes (left) + aging legend (right).
            Pure chrome; mirrors the card edge + pill thresholds
            (stageHeatLevel single source). */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-2">
          <div className="flex items-center gap-2">
            <div
              className="flex border border-[var(--rule-strong)] bg-white"
              role="group"
              aria-label="Board density"
            >
              {(["comfy", "compact"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => selectDensity(d)}
                  aria-pressed={density === d}
                  className={`px-2.5 py-1 text-[9px] font-bold tracking-[1px] uppercase transition-colors ${
                    density === d
                      ? "bg-ink text-ivory"
                      : "text-slate-body hover:bg-cream"
                  }`}
                >
                  {d === "comfy" ? "Comfy" : "Compact"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={toggleFocus}
              aria-pressed={focusMode}
              title="Focus — dim every column except the one under your pointer"
              className={`px-2.5 py-1 text-[9px] font-bold tracking-[1px] uppercase border transition-colors ${
                focusMode
                  ? "bg-ink text-ivory border-ink"
                  : "bg-white text-slate-body border-[var(--rule-strong)] hover:bg-cream"
              }`}
            >
              Focus
            </button>
            {laneAccessor && (
              <button
                type="button"
                onClick={toggleLanes}
                aria-pressed={lanesOn}
                title="Group each column's cards by job"
                className={`px-2.5 py-1 text-[9px] font-bold tracking-[1px] uppercase border transition-colors ${
                  lanesOn
                    ? "bg-ink text-ivory border-ink"
                    : "bg-white text-slate-body border-[var(--rule-strong)] hover:bg-cream"
                }`}
              >
                Lanes · job
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-meta">
            <span className="font-bold tracking-[1.5px] uppercase">Aging</span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 bg-heritage/70" aria-hidden />
              &lt;4d
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 bg-amber-500" aria-hidden />
              4–10d
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 bg-[#b3543f]" aria-hidden />
              10d+
            </span>
          </div>
        </div>

        {/* Open stages — horizontal scroll on desktop if needed */}
        <div className="overflow-x-auto -mx-4 px-4 pb-2">
          <div className="flex gap-4 min-w-max">
            {kanbanStages.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                applications={byStageId.get(stage.id) ?? []}
                pendingApplicationIds={pendingIds}
                selectedIds={selection.selected}
                onToggleSelect={handleToggleSelect}
                dwellNorms={dwellNorms}
                laneLabel={lanesOn ? laneAccessor : undefined}
                quickAdvanceFor={quickAdvanceFor}
              />
            ))}
          </div>
        </div>

        {/* Closed lane — rejected (drop target) + withdrawn (read-only). */}
        <ClosedLane
          rejectedApps={rejectedApps}
          withdrawnApps={withdrawnApps}
          closedCount={closedCount}
          expanded={closedExpanded}
          onToggle={() => setClosedExpanded((v) => !v)}
          selectedIds={selection.selected}
          onToggleSelect={handleToggleSelect}
          pendingApplicationIds={pendingIds}
          rejectedStage={rejectedStage}
        />
      </div>

      <DragOverlay dropAnimation={DROP_ANIMATION}>
        {activeApp ? (
          bulkDragIds && bulkDragIds.length > 1 ? (
            <BulkDragPreview activeApp={activeApp} count={bulkDragIds.length} />
          ) : (
            <KanbanCard
              application={activeApp}
              isOverlay
              selected={selection.selected.has(activeApp.id)}
            />
          )
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

function SelectionToolbar({
  count,
  onClear,
  disabled,
  moveMenuOpen,
  onMoveMenuOpenChange,
  moveStages,
  onMove,
  onOpenMessage,
  onOpenReject,
  onOpenArchive,
}: {
  count: number;
  onClear: () => void;
  disabled: boolean;
  moveMenuOpen: boolean;
  onMoveMenuOpenChange: (open: boolean) => void;
  moveStages: PipelineStage[];
  onMove: (stage: PipelineStage) => void;
  onOpenMessage: () => void;
  onOpenReject: () => void;
  onOpenArchive: () => void;
}) {
  const baseBtn =
    "inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold tracking-[1.5px] uppercase border transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-offset-2";
  return (
    <div className="sticky top-[80px] z-30 flex flex-wrap items-center justify-between gap-3 border border-heritage/40 bg-heritage/[0.08] px-4 py-2.5">
      <div className="flex items-center gap-3 text-[14px] text-heritage-deep">
        <span className="font-bold">{count} selected</span>
        <span className="text-slate-meta">·</span>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="text-heritage-deep underline-offset-2 hover:underline disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-offset-2"
        >
          Clear selection
        </button>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu open={moveMenuOpen} onOpenChange={onMoveMenuOpenChange}>
          <DropdownMenuTrigger
            disabled={disabled}
            className={`${baseBtn} border-heritage/30 text-heritage-deep bg-white hover:bg-heritage/10`}
          >
            Move to…
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            {moveStages.map((stage) => (
              <DropdownMenuItem
                key={stage.id}
                onSelect={() => onMove(stage)}
                className="text-[13px] font-semibold tracking-[0.5px] text-ink"
              >
                {stage.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={onOpenMessage}
          disabled={disabled}
          className={`${baseBtn} border-heritage/30 text-heritage-deep bg-white hover:bg-heritage/10`}
        >
          Message…
        </button>
        <button
          type="button"
          onClick={onOpenReject}
          disabled={disabled}
          className={`${baseBtn} border-red-300 text-red-700 bg-white hover:bg-red-50`}
        >
          Reject…
        </button>
        <button
          type="button"
          onClick={onOpenArchive}
          disabled={disabled}
          className={`${baseBtn} border-slate-300 text-slate-body bg-white hover:bg-cream`}
        >
          Archive
        </button>
      </div>
    </div>
  );
}

function BulkConfirmDialog({
  open,
  onOpenChange,
  title,
  variant,
  count,
  confirmLabel,
  reasonHelper,
  onConfirm,
  aiSuggester,
  dispositionKind,
  dispositionRequired = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  variant: "destructive" | "neutral";
  count: number;
  confirmLabel: string;
  reasonHelper: string;
  onConfirm: (reason: string, dispositionCode: string | null) => void;
  aiSuggester?: {
    available: boolean;
    singleApplicationId: string | null;
    singleApplicationHasContext: boolean;
  };
  /** When set, show the structured disposition picker (#8). */
  dispositionKind?: DispositionKind;
  dispositionRequired?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [disposition, setDisposition] = useState("");
  useEffect(() => {
    if (open) {
      setReason("");
      setDisposition("");
    }
  }, [open]);

  const confirmClasses =
    variant === "destructive"
      ? "bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-700"
      : "bg-heritage text-white hover:bg-heritage-deep focus-visible:ring-heritage";

  // Mirror the server gate so Confirm only enables on a valid (code, note) pair.
  const dispositionError = dispositionKind
    ? validateDisposition(dispositionKind, disposition || null, reason)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {count} candidate{count === 1 ? "" : "s"} selected.
          </DialogDescription>
        </DialogHeader>
        {dispositionKind && (
          <DispositionSelect
            kind={dispositionKind}
            value={disposition}
            onChange={setDisposition}
            required={dispositionRequired}
            id="bulk-disposition"
          />
        )}
        {aiSuggester &&
          (aiSuggester.singleApplicationId ? (
            <RejectReasonAiSuggester
              applicationId={aiSuggester.singleApplicationId}
              available={aiSuggester.available}
              hasContext={aiSuggester.singleApplicationHasContext}
              onApply={(body) => setReason(body.slice(0, 1000))}
            />
          ) : count > 1 ? (
            <p className="text-[13px] text-slate-meta border border-[var(--rule)] bg-cream/40 px-3 py-2.5 leading-relaxed">
              Generate AI suggestions one candidate at a time — select a single
              candidate to see suggestions.
            </p>
          ) : null)}
        <div className="grid gap-2">
          <label
            htmlFor="bulk-reason"
            className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-body"
          >
            Note
          </label>
          <textarea
            id="bulk-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 1000))}
            rows={3}
            placeholder="Add context for your team's audit log…"
            className="w-full resize-y border border-[var(--rule-strong)] bg-white px-3 py-2 text-[14px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage"
          />
          <p className="text-[12px] text-slate-meta">{reasonHelper}</p>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center justify-center px-4 py-2 text-[10px] font-bold tracking-[1.5px] uppercase border border-[var(--rule-strong)] bg-white text-slate-body hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={dispositionError !== null}
            onClick={() => onConfirm(reason, disposition || null)}
            className={`inline-flex items-center justify-center px-4 py-2 text-[10px] font-bold tracking-[1.5px] uppercase focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${confirmClasses}`}
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkMessageDialog({
  open,
  onOpenChange,
  count,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onConfirm: (body: string) => void;
}) {
  const MAX = 5000;
  const [body, setBody] = useState("");
  useEffect(() => {
    if (open) setBody("");
  }, [open]);
  const trimmed = body.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Message candidates</DialogTitle>
          <DialogDescription>
            {count} candidate{count === 1 ? "" : "s"} selected. Each receives
            this in their application inbox and by email.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <label
            htmlFor="bulk-message"
            className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-body"
          >
            Message
          </label>
          <textarea
            id="bulk-message"
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX))}
            rows={5}
            placeholder="Write the message your selected candidates will receive…"
            className="w-full resize-y border border-[var(--rule-strong)] bg-white px-3 py-2 text-[14px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage"
          />
          <p className="text-[12px] text-slate-meta">
            Sent individually — candidates can&apos;t see who else received it.{" "}
            {body.length}/{MAX}
          </p>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center justify-center px-4 py-2 text-[10px] font-bold tracking-[1.5px] uppercase border border-[var(--rule-strong)] bg-white text-slate-body hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={trimmed.length === 0}
            onClick={() => onConfirm(trimmed)}
            className="inline-flex items-center justify-center px-4 py-2 text-[10px] font-bold tracking-[1.5px] uppercase bg-heritage text-white hover:bg-heritage-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send to {count}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkResultDisplay({
  banner,
  onDismiss,
  onRetry,
}: {
  banner: BulkResultBanner;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  const failed = banner.failures.length;
  const succeeded = banner.succeededCount;
  const allSucceeded = failed === 0 && succeeded > 0;
  const allFailed = succeeded === 0 && failed > 0;
  const tone = allSucceeded
    ? {
        wrapper: "border-heritage/30 bg-heritage/[0.08]",
        text: "text-heritage-deep",
        ring: "focus-visible:ring-heritage",
      }
    : allFailed
      ? {
          wrapper: "border-red-300 bg-red-50",
          text: "text-red-900",
          ring: "focus-visible:ring-red-700",
        }
      : {
          wrapper: "border-amber-300 bg-amber-50",
          text: "text-amber-900",
          ring: "focus-visible:ring-amber-700",
        };

  const verbStem =
    banner.actionLabel === "Moved"
      ? "move"
      : banner.actionLabel === "Rejected"
        ? "reject"
        : banner.actionLabel === "Messaged"
          ? "message"
          : "archive";

  const summary = allSucceeded
    ? `${banner.actionLabel} ${succeeded} candidate${succeeded === 1 ? "" : "s"}${banner.destinationLabel ? ` ${banner.destinationLabel}` : ""}.`
    : allFailed
      ? `Couldn't ${verbStem} ${failed} candidate${failed === 1 ? "" : "s"}.`
      : `${banner.actionLabel} ${succeeded} of ${succeeded + failed}${banner.destinationLabel ? ` ${banner.destinationLabel}` : ""}. ${failed} failed.`;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-3 border ${tone.wrapper} px-4 py-3`}
    >
      <AlertCircle
        className={`h-4 w-4 ${tone.text} flex-shrink-0 mt-0.5`}
        aria-hidden="true"
      />
      <div className={`flex-1 text-[14px] ${tone.text} leading-relaxed`}>
        <div className="font-bold">{summary}</div>
        {failed > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-[13px]">
            {banner.failures.slice(0, 5).map((f) => (
              <li key={f.id}>
                <span className="font-semibold">{f.candidateName}</span>
                <span className="text-slate-meta"> — {f.error}</span>
              </li>
            ))}
            {banner.failures.length > 5 && (
              <li className="text-slate-meta">
                + {banner.failures.length - 5} more
              </li>
            )}
          </ul>
        )}
      </div>
      {failed > 0 && (
        <button
          type="button"
          onClick={onRetry}
          className={`text-[10px] font-bold tracking-[1.5px] uppercase px-3 py-1.5 border ${tone.text} hover:bg-white/40 transition-colors focus:outline-none focus-visible:ring-2 ${tone.ring} focus-visible:ring-offset-2`}
        >
          Retry
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className={`${tone.text} hover:opacity-70 focus:outline-none focus-visible:ring-2 ${tone.ring} focus-visible:ring-offset-2`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
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
  rejectedStage,
}: {
  rejectedApps: KanbanApplication[];
  withdrawnApps: KanbanApplication[];
  closedCount: number;
  expanded: boolean;
  onToggle: () => void;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  pendingApplicationIds: ReadonlySet<string>;
  rejectedStage: PipelineStage | null;
}) {
  // Lane wrapper is itself a droppable. Drop = first rejected-kind stage.
  // Disable as a droppable if no rejected stage exists (defensive — every
  // DSO is seeded with one).
  const { isOver, setNodeRef } = useDroppable({
    id: CLOSED_DROPPABLE_ID,
    data: rejectedStage
      ? { type: "column", stageId: rejectedStage.id }
      : { type: "column" },
    disabled: !rejectedStage,
  });

  // Disabled-cast: `isTerminalKind` lives here only to keep the import
  // tree honest when callers later add intermediate logic.
  void isTerminalKind;

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
          <div className="px-5 py-3 text-[13px] text-slate-meta italic">
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

function WithdrawnRow({ application }: { application: KanbanApplication }) {
  const cand = application.candidate;
  return (
    <Link
      href={`/employer/applications/${application.id}`}
      className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-cream transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-inset"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[14px] italic font-semibold text-slate-body truncate">
          {cand?.full_name ?? "Anonymous candidate"}
        </div>
        <div className="text-[12px] text-slate-meta truncate">
          Withdrawn · {new Date(application.created_at).toLocaleDateString()}
        </div>
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-slate-meta flex-shrink-0" />
    </Link>
  );
}

/**
 * BulkDragPreview — DragOverlay content when the user is dragging a
 * multi-card selection. Two offset "shadow" cards sit behind the active
 * card to convey stacking, plus a count badge in the top-right.
 *
 * Keeps a single source of truth for the active card's appearance by
 * delegating to <KanbanCard isOverlay /> for the front card. The shadow
 * cards behind are simple sized panels (not real KanbanCards) so we don't
 * pay the cost of rendering full cards just to be visually hinted at.
 */
function BulkDragPreview({
  activeApp,
  count,
}: {
  activeApp: KanbanApplication;
  count: number;
}) {
  return (
    <div className="relative">
      {/* Back shadow card — offset further */}
      <div
        aria-hidden
        className="absolute inset-0 translate-x-2 translate-y-2 rounded-md border border-[var(--rule)] bg-white shadow-sm opacity-70"
      />
      {/* Middle shadow card — offset less */}
      <div
        aria-hidden
        className="absolute inset-0 translate-x-1 translate-y-1 rounded-md border border-[var(--rule)] bg-white shadow-sm opacity-90"
      />
      {/* Front: the actual active card */}
      <div className="relative">
        <KanbanCard application={activeApp} isOverlay selected />
        {/* Count badge — top-right corner */}
        <div
          className="absolute -top-2 -right-2 z-10 inline-flex items-center justify-center rounded-full bg-heritage-deep px-2 min-w-[24px] h-6 text-[11px] font-bold text-white shadow-md ring-2 ring-white"
          aria-hidden
        >
          {count}
        </div>
      </div>
    </div>
  );
}
