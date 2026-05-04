/**
 * useRealtimeApplications — Day 4 of Phase 5A kanban.
 *
 * Subscribes to `postgres_changes` UPDATE events on `public.applications`
 * scoped to one job_id, reconciles remote moves into local state, and
 * dedupes the recruiter's own optimistic moves via a shared `pendingMovesRef`
 * so a self-echo never re-renders or flickers the card the recruiter is
 * currently dragging.
 *
 * Self-echo dedupe contract:
 *   - <KanbanBoard> records `{ applicationId -> expectedStatus }` in
 *     `pendingMovesRef` the moment a drag-drop fires (Day 3 wired this).
 *   - When the realtime UPDATE arrives for that row with a matching status,
 *     this hook treats the event as our own echo: it deletes the pending
 *     entry and DOES NOT touch local state (the optimistic + committed value
 *     already reflects the move; re-applying would just be a no-op anyway).
 *   - <KanbanBoard> still clears `pendingIds` on server-action confirmation
 *     (so the dimmed/disabled UI lifts immediately), but it intentionally
 *     does NOT clear `pendingMovesRef` itself on confirmation — the realtime
 *     echo arrives ~50–500ms after the action returns, so we let *this hook*
 *     own clearing the ref-entry on echo. That keeps the dedupe single-owner
 *     and avoids a race where the entry gets cleared by the action callback
 *     before the echo arrives, leading to a phantom "Teammate moved …" toast
 *     for our own move.
 *   - Edge: if the action fails (rollback path), <KanbanBoard> deletes the
 *     ref-entry itself in the failure branch — no echo will ever arrive in
 *     that case, so leaving it would leak.
 *
 * INSERT/DELETE are intentionally out of scope. Applications aren't created
 * or hard-deleted from the kanban surface; new applications appear on the
 * next page load. Day 5+ may add INSERT for "new candidate just applied"
 * toasts.
 *
 * Reconnection: we don't auto-reconnect on CHANNEL_ERROR/CLOSED. Supabase's
 * client retries the websocket internally; if the channel ends up wedged we
 * cover it with a `document.visibilitychange` listener that re-fetches the
 * full applications list when the tab becomes visible again. That's enough
 * to recover from sleep, network blips, and dropped events.
 *
 * --- MANUAL QA (Cam, run in two browser tabs side-by-side) ---
 *   1. Open the same /employer/jobs/[id]/applications page in two tabs.
 *      Verify each shows a small green "Live" pill in the board header.
 *   2. Drag a card from "New" to "Screening" in tab 1.
 *      Expect: tab 2 reflects the move within ~500ms, no flicker in tab 1.
 *   3. In tab 1, drag the same card back. Expect: NO snap-back in tab 1
 *      (self-echo dedupe is working) and tab 2 syncs.
 *   4. DevTools → Network → Offline on tab 2. In tab 1, drag a card.
 *      Bring tab 2 back online and switch focus to it.
 *      Expect: visibility-change fires, reconciliation refetches, board
 *      updates. No stuck "Reconnecting…" pill.
 *   5. Open /employer/applications/[id] in a third tab and change status
 *      via the detail page form. Expect both kanban tabs sync.
 *   6. Hard-refresh tab 1 mid-drag to verify nothing crashes on unmount.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  REALTIME_LISTEN_TYPES,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
  REALTIME_SUBSCRIBE_STATES,
  type RealtimePostgresUpdatePayload,
} from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { ApplicationStatus } from "@/lib/applications/stages";
import type { KanbanApplication } from "./kanban-board";

/**
 * Subset of `applications.Row` that arrives in a realtime payload. Realtime
 * only ships the table's own columns (no joins), so candidate metadata is
 * unavailable here and must be looked up from the existing local state.
 */
interface ApplicationsRow {
  id: string;
  job_id: string;
  candidate_id: string;
  status: ApplicationStatus;
  stage_entered_at: string;
  pipeline_position: number | null;
  created_at: string;
  updated_at: string;
}

export interface RemoteChangeEvent {
  applicationId: string;
  prevStatus: ApplicationStatus | null;
  nextStatus: ApplicationStatus;
  candidateName: string | null;
}

interface UseRealtimeApplicationsArgs {
  jobId: string;
  initialApplications: KanbanApplication[];
  /**
   * Shared pending-moves ledger. <KanbanBoard> writes
   * `applicationId -> expectedStatus` on drag-drop; this hook reads (and on
   * an echo match, deletes) it. See dedupe contract above.
   */
  pendingMovesRef: React.MutableRefObject<Map<string, ApplicationStatus>>;
  /**
   * Fires only for *remote* changes (after self-echo filtering). The board
   * uses this to surface a "moved by teammate" banner.
   */
  onRemoteChange?: (event: RemoteChangeEvent) => void;
}

export interface UseRealtimeApplicationsResult {
  applications: KanbanApplication[];
  isConnected: boolean;
  /**
   * Imperative commit for the optimistic-confirmation path. <KanbanBoard>
   * calls this after a successful server action so the local state advances
   * even before the realtime echo arrives.
   */
  commitLocal: (
    applicationId: string,
    nextStatus: ApplicationStatus,
    nextStageEnteredAt: string
  ) => void;
  /**
   * Imperative reseed for the SSR -> client handoff and revalidation. Lets
   * the board's `applications` prop re-flow without owning a parallel state.
   */
  reseed: (next: KanbanApplication[]) => void;
}

export function useRealtimeApplications({
  jobId,
  initialApplications,
  pendingMovesRef,
  onRemoteChange,
}: UseRealtimeApplicationsArgs): UseRealtimeApplicationsResult {
  // The list state lives here; <KanbanBoard> projects it through useOptimistic.
  const [applications, setApplications] =
    useState<KanbanApplication[]>(initialApplications);
  const [isConnected, setIsConnected] = useState(false);

  // Keep the latest onRemoteChange in a ref so the channel effect doesn't
  // tear down on every parent re-render.
  const onRemoteChangeRef = useRef<typeof onRemoteChange>(onRemoteChange);
  useEffect(() => {
    onRemoteChangeRef.current = onRemoteChange;
  }, [onRemoteChange]);

  // We also need to look up candidate metadata + previous status when an
  // event arrives. Stash the latest applications list in a ref so the channel
  // callback always reads fresh data without re-subscribing.
  const applicationsRef = useRef<KanbanApplication[]>(applications);
  useEffect(() => {
    applicationsRef.current = applications;
  }, [applications]);

  const commitLocal = useCallback(
    (
      applicationId: string,
      nextStatus: ApplicationStatus,
      nextStageEnteredAt: string
    ) => {
      setApplications((current) =>
        current.map((app) =>
          app.id === applicationId
            ? {
                ...app,
                status: nextStatus,
                stage_entered_at: nextStageEnteredAt,
              }
            : app
        )
      );
    },
    []
  );

  const reseed = useCallback((next: KanbanApplication[]) => {
    setApplications(next);
  }, []);

  // Re-fetch reconciliation: pull a fresh applications list and merge it in.
  // Used by the visibility-change listener to recover after sleep / dropped
  // events. We preserve `candidate` + `jobTitle` from existing rows because
  // realtime / this minimal select doesn't include them.
  const refetch = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("applications")
      .select(
        "id, job_id, candidate_id, status, created_at, stage_entered_at, pipeline_position"
      )
      .eq("job_id", jobId);
    if (error || !data) return;

    setApplications((current) => {
      const byId = new Map(current.map((a) => [a.id, a]));
      const next: KanbanApplication[] = [];
      for (const row of data as ApplicationsRow[]) {
        const existing = byId.get(row.id);
        if (existing) {
          next.push({
            ...existing,
            status: row.status,
            stage_entered_at: row.stage_entered_at,
            pipeline_position: row.pipeline_position,
            created_at: row.created_at,
          });
        } else {
          // New row that wasn't in our seed (e.g., applied while we slept).
          // Render with an Anonymous candidate stub; the next full SSR pass
          // will hydrate the real metadata. Out-of-scope for Day 4 to fetch
          // candidate inline; we just don't lose the row.
          next.push({
            id: row.id,
            job_id: row.job_id,
            candidate_id: row.candidate_id,
            status: row.status,
            created_at: row.created_at,
            stage_entered_at: row.stage_entered_at,
            pipeline_position: row.pipeline_position,
            candidate: null,
            jobTitle: current[0]?.jobTitle ?? "",
            comment_count: 0,
            scorecard_avg: null,
            scorecard_reviewer_count: 0,
          });
        }
      }
      return next;
    });
  }, [jobId]);

  // --- Channel subscription ---
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`applications:job:${jobId}`)
      .on(
        REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
        {
          event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.UPDATE,
          schema: "public",
          table: "applications",
          filter: `job_id=eq.${jobId}`,
        },
        (payload: RealtimePostgresUpdatePayload<ApplicationsRow>) => {
          const row = payload.new;
          if (!row?.id) return;

          // --- Self-echo dedupe ---
          const expected = pendingMovesRef.current.get(row.id);
          if (expected !== undefined && expected === row.status) {
            // Our own move; drop the ledger entry and bail. Local state is
            // already up to date via commitLocal().
            pendingMovesRef.current.delete(row.id);
            return;
          }

          // --- Remote change (or stale echo from a different recruiter) ---
          // If `expected` is set but to a different status, someone else won
          // the race. RLS / our action will roll back our optimistic move on
          // its own; we accept the remote value here.
          const prev = applicationsRef.current.find((a) => a.id === row.id);
          const prevStatus = prev?.status ?? null;

          // Idempotent: if status didn't actually change relative to local,
          // we still want to advance stage_entered_at (heat indicator
          // matters), but skip the toast.
          const statusChanged = prevStatus !== row.status;

          setApplications((current) => {
            const idx = current.findIndex((a) => a.id === row.id);
            if (idx === -1) return current;
            const updated: KanbanApplication = {
              ...current[idx],
              status: row.status,
              stage_entered_at: row.stage_entered_at,
              pipeline_position: row.pipeline_position,
            };
            const next = current.slice();
            next[idx] = updated;
            return next;
          });

          if (statusChanged && onRemoteChangeRef.current) {
            onRemoteChangeRef.current({
              applicationId: row.id,
              prevStatus,
              nextStatus: row.status,
              candidateName: prev?.candidate?.full_name ?? null,
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          setIsConnected(true);
        } else if (
          status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
          status === REALTIME_SUBSCRIBE_STATES.CLOSED ||
          status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
        ) {
          setIsConnected(false);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
    // pendingMovesRef is a stable ref object; we don't need it in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // --- Visibility change reconciliation ---
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = () => {
      if (document.visibilityState === "visible") {
        void refetch();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [refetch]);

  return useMemo(
    () => ({ applications, isConnected, commitLocal, reseed }),
    [applications, isConnected, commitLocal, reseed]
  );
}
