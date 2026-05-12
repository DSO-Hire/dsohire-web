/**
 * useRealtimeApplications — Day 4 of Phase 5A kanban, post-Track-B rewrite.
 *
 * Subscribes to `postgres_changes` UPDATE events on `public.applications`
 * scoped to one job_id, reconciles remote stage moves into local state, and
 * dedupes the recruiter's own optimistic moves via a shared `pendingMovesRef`
 * so a self-echo never re-renders or flickers the card the recruiter is
 * currently dragging.
 *
 * Self-echo dedupe contract:
 *   - <KanbanBoard> records `{ applicationId -> expectedStageId }` in
 *     `pendingMovesRef` the moment a drag-drop fires.
 *   - When the realtime UPDATE arrives for that row with a matching
 *     stage_id, this hook treats the event as our own echo: it deletes
 *     the pending entry and DOES NOT touch local state.
 *   - <KanbanBoard> still clears `pendingIds` on server-action confirmation
 *     (so the dimmed/disabled UI lifts immediately), but it intentionally
 *     does NOT clear `pendingMovesRef` itself on confirmation — the
 *     realtime echo arrives ~50–500ms after the action returns, so we let
 *     this hook own clearing the ref-entry on echo.
 *   - Edge: if the action fails (rollback path), <KanbanBoard> deletes the
 *     ref-entry itself in the failure branch.
 *
 * Remote events need to be enriched with the kind for the toast copy — the
 * realtime payload only carries the stage_id (the bare applications row).
 * We resolve kind from the live local state when possible; on a stage_id
 * we've never seen before (e.g., a fresh custom stage added by a teammate
 * mid-session), we fall back to "open" so the rest of the flow stays sane
 * and a subsequent revalidation can fix it.
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
import type { StageKind } from "@/lib/applications/stages";
import type { KanbanApplication } from "./kanban-board";

interface ApplicationsRow {
  id: string;
  job_id: string;
  candidate_id: string;
  stage_id: string;
  stage_entered_at: string;
  pipeline_position: number | null;
  created_at: string;
  updated_at: string;
}

export interface RemoteChangeEvent {
  applicationId: string;
  prevStageId: string | null;
  prevKind: StageKind | null;
  nextStageId: string;
  nextKind: StageKind;
  candidateName: string | null;
}

interface UseRealtimeApplicationsArgs {
  jobId: string;
  initialApplications: KanbanApplication[];
  pendingMovesRef: React.MutableRefObject<Map<string, string>>;
  onRemoteChange?: (event: RemoteChangeEvent) => void;
}

export interface UseRealtimeApplicationsResult {
  applications: KanbanApplication[];
  isConnected: boolean;
  /**
   * Imperative commit for the optimistic-confirmation path. Sets stage_id +
   * kind + stage_entered_at in one shot.
   */
  commitLocal: (
    applicationId: string,
    nextStageId: string,
    nextKind: StageKind,
    nextStageEnteredAt: string
  ) => void;
  reseed: (next: KanbanApplication[]) => void;
}

export function useRealtimeApplications({
  jobId,
  initialApplications,
  pendingMovesRef,
  onRemoteChange,
}: UseRealtimeApplicationsArgs): UseRealtimeApplicationsResult {
  const [applications, setApplications] =
    useState<KanbanApplication[]>(initialApplications);
  const [isConnected, setIsConnected] = useState(false);

  const onRemoteChangeRef = useRef<typeof onRemoteChange>(onRemoteChange);
  useEffect(() => {
    onRemoteChangeRef.current = onRemoteChange;
  }, [onRemoteChange]);

  const applicationsRef = useRef<KanbanApplication[]>(applications);
  useEffect(() => {
    applicationsRef.current = applications;
  }, [applications]);

  const commitLocal = useCallback(
    (
      applicationId: string,
      nextStageId: string,
      nextKind: StageKind,
      nextStageEnteredAt: string
    ) => {
      setApplications((current) =>
        current.map((app) =>
          app.id === applicationId
            ? {
                ...app,
                stage_id: nextStageId,
                kind: nextKind,
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

  // Visibility-change reconciliation refetch. Pulls fresh applications +
  // their stage kind via embed and merges in. Service-RLS-friendly read.
  const refetch = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("applications")
      .select(
        "id, job_id, candidate_id, stage_id, created_at, stage_entered_at, pipeline_position, stage:dso_pipeline_stages!stage_id(kind)"
      )
      .eq("job_id", jobId);
    if (error || !data) {
      if (error) console.warn("[realtime] applications refetch failed", error);
      return;
    }

    type EmbeddedRow = ApplicationsRow & {
      stage: { kind: string } | Array<{ kind: string }> | null;
    };

    setApplications((current) => {
      const byId = new Map(current.map((a) => [a.id, a]));
      const next: KanbanApplication[] = [];
      for (const row of data as EmbeddedRow[]) {
        const stageRel = Array.isArray(row.stage)
          ? row.stage[0] ?? null
          : row.stage;
        const kind = (stageRel?.kind ?? "open") as StageKind;
        const existing = byId.get(row.id);
        if (existing) {
          next.push({
            ...existing,
            stage_id: row.stage_id,
            kind,
            stage_entered_at: row.stage_entered_at,
            pipeline_position: row.pipeline_position,
            created_at: row.created_at,
          });
        } else {
          next.push({
            id: row.id,
            job_id: row.job_id,
            candidate_id: row.candidate_id,
            stage_id: row.stage_id,
            kind,
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

  // Resolve a stage_id to a kind using local state. Returns "open" as the
  // safest fallback when the id is unseen (a teammate just created a
  // custom stage). The visibility-change refetch will correct any stale
  // values shortly after.
  const kindForStageId = useCallback(
    (stageId: string): StageKind => {
      const hit = applicationsRef.current.find((a) => a.stage_id === stageId);
      return hit?.kind ?? "open";
    },
    []
  );

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

          // Self-echo dedupe — keyed by next stage_id.
          const expected = pendingMovesRef.current.get(row.id);
          if (expected !== undefined && expected === row.stage_id) {
            pendingMovesRef.current.delete(row.id);
            return;
          }

          const prev = applicationsRef.current.find((a) => a.id === row.id);
          const prevStageId = prev?.stage_id ?? null;
          const prevKind = prev?.kind ?? null;
          const stageChanged = prevStageId !== row.stage_id;
          const nextKind = kindForStageId(row.stage_id);

          setApplications((current) => {
            const idx = current.findIndex((a) => a.id === row.id);
            if (idx === -1) return current;
            const updated: KanbanApplication = {
              ...current[idx],
              stage_id: row.stage_id,
              kind: nextKind,
              stage_entered_at: row.stage_entered_at,
              pipeline_position: row.pipeline_position,
            };
            const next = current.slice();
            next[idx] = updated;
            return next;
          });

          if (stageChanged && onRemoteChangeRef.current) {
            onRemoteChangeRef.current({
              applicationId: row.id,
              prevStageId,
              prevKind,
              nextStageId: row.stage_id,
              nextKind,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

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
