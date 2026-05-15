"use client";

/**
 * Bumps the SSR-rendered Inbox nav badge by calling router.refresh()
 * when a new application_messages row arrives from the OTHER side.
 *
 * Why this is needed:
 *   The shell is a server component, so `getUnreadCount` runs once at
 *   render time and the count is baked into HTML. Without a client-side
 *   trigger, you only see new-message counts after navigating. This
 *   component subscribes to Supabase realtime for INSERTs on
 *   application_messages and asks the router to refresh whenever the
 *   sender_role is the other audience — that re-runs the layout's data
 *   fetches and the badge updates in place.
 *
 * Implementation notes:
 *   - We DROP the server-side filter on sender_role and apply it
 *     in the callback instead. The Postgres filter for realtime is
 *     finicky on text columns and silently produces zero events when
 *     it fails; the all-INSERTS subscription is gated by RLS (the
 *     user only sees rows they could SELECT, which already scopes
 *     to their threads), so it's still cheap.
 *   - Debounce / coalesce: realtime can fire many events per second
 *     during an active conversation. We coalesce by waiting 500ms
 *     after the last event before refreshing.
 *   - Subscribe status callback exists so a SUBSCRIBED → CHANNEL_ERROR
 *     transition becomes visible in DevTools rather than silently
 *     leaving the badge stale.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  REALTIME_LISTEN_TYPES,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
  type RealtimePostgresInsertPayload,
} from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

interface Props {
  /** Audience of the signed-in viewer; we listen for messages from the OTHER side. */
  audience: "candidate" | "employer";
}

interface MinimalMessageRow {
  id?: string;
  sender_role?: string | null;
  read_at?: string | null;
}

export function NavBadgeRealtime({ audience }: Props) {
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const otherSide = audience === "candidate" ? "employer" : "candidate";
    const supabase = createSupabaseBrowserClient();

    const scheduleRefresh = (): void => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        router.refresh();
      }, 500);
    };

    const channel = supabase
      .channel(`nav-inbox-badge-${audience}`)
      .on(
        REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
        {
          event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.INSERT,
          schema: "public",
          table: "application_messages",
        },
        (payload: RealtimePostgresInsertPayload<MinimalMessageRow>) => {
          const row = payload.new;
          // Only count messages from the OTHER side.
          if (!row || row.sender_role !== otherSide) return;
          // Already-read messages don't bump the badge (the dispatch
          // never marks read_at on insert, but be defensive).
          if (row.read_at) return;
          scheduleRefresh();
        },
      )
      .subscribe((status) => {
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          // Soft logging — don't blow up the UI, just surface this so
          // it's debuggable if a user reports the badge not updating.
          console.warn("[inbox] nav badge realtime status:", status);
        }
      });

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      void supabase.removeChannel(channel);
    };
  }, [audience, router]);

  return null;
}
