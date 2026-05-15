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
 * Debounce / coalesce: realtime can fire many events per second during
 * an active conversation. We coalesce by waiting 500ms after the last
 * event before refreshing, so rapid bursts cost one refresh instead of
 * N.
 *
 * Rendered: returns null. This is a side-effect component.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

interface Props {
  /** Audience of the signed-in viewer; we listen for messages from the OTHER side. */
  audience: "candidate" | "employer";
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
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "application_messages",
          // server-side filter so we don't process events that aren't
          // relevant. RLS still applies — the client only sees rows it
          // could SELECT, which already scopes to this user's threads.
          filter: `sender_role=eq.${otherSide}`,
        },
        () => {
          scheduleRefresh();
        },
      )
      .subscribe();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      void supabase.removeChannel(channel);
    };
  }, [audience, router]);

  return null;
}
