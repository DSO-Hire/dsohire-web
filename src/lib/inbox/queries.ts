/**
 * Inbox thread queries (Phase 4.8 — Inbox v0).
 *
 * Server-side only (called from server actions or server components).
 * Both helpers return `InboxThread[]` sorted by last_message_at desc.
 *
 * Strategy: pull every application the caller can see (RLS handles the
 * scoping), pull every application_messages row in one query, group +
 * project the latest message + unread count per application, and join
 * the archive flags. Two round trips total.
 *
 * Why not a Postgres view: the inbox shape needs to know the calling
 * user's auth.uid() to compute `unread_count` (count = messages from
 * the OTHER side, where THIS side has not yet marked read_at). A view
 * with auth.uid() works in theory, but per-row recomputation gets
 * expensive at scale. Hand-rolled aggregation in app code is cheap and
 * gives us the exact shape we need.
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { InboxThread } from "./types";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

interface MessageRowMin {
  application_id: string;
  sender_role: "candidate" | "employer";
  body: string;
  created_at: string;
  read_at: string | null;
  deleted_at: string | null;
}

/* ──────────────────────────────────────────────────────────────
 * Employer inbox
 *
 * Returns one thread per application in the caller's DSO that has at
 * least one message OR that the caller has explicitly archived.
 * ─────────────────────────────────────────────────────────── */

export async function getEmployerInboxThreads(
  supabase: SupabaseClient,
  authUserId: string,
  dsoId: string
): Promise<InboxThread[]> {
  const [
    appsResult,
    messagesResult,
    archiveResult,
  ] = await Promise.all([
    supabase
      .from("applications")
      .select(
        `id, candidate_id, job_id, current_stage,
         primary_location_id,
         jobs:jobs!inner(id, title, dso_id),
         candidate:candidates(id, full_name, avatar_url)`
      )
      .eq("jobs.dso_id", dsoId),
    supabase
      .from("application_messages")
      .select("application_id, sender_role, body, created_at, read_at, deleted_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("inbox_archived_threads")
      .select("application_id")
      .eq("auth_user_id", authUserId),
  ]);

  const apps = (appsResult.data ?? []) as Array<Record<string, unknown>>;
  const messages = (messagesResult.data ?? []) as MessageRowMin[];
  const archivedSet = new Set(
    (archiveResult.data ?? []).map(
      (r) => (r as Record<string, unknown>).application_id as string
    )
  );

  // Pull all locations referenced by any of the apps in one query so
  // the location dropdown filter has names (not just ids).
  const locationIds = Array.from(
    new Set(
      apps
        .map((a) => a.primary_location_id as string | null)
        .filter((id): id is string => Boolean(id))
    )
  );
  const locationMap = new Map<string, string>();
  if (locationIds.length > 0) {
    const { data: locs } = await supabase
      .from("dso_locations")
      .select("id, name, city, state")
      .in("id", locationIds);
    for (const loc of (locs ?? []) as Array<Record<string, unknown>>) {
      const id = loc.id as string;
      const name = (loc.name as string | null) ??
        [loc.city, loc.state].filter(Boolean).join(", ") ??
        "Unnamed";
      locationMap.set(id, name);
    }
  }

  return composeThreads({
    apps,
    messages,
    archivedSet,
    locationMap,
    audience: "employer",
  });
}

/* ──────────────────────────────────────────────────────────────
 * Candidate inbox
 *
 * Returns one thread per application the candidate has submitted
 * that has at least one message OR is archived.
 * ─────────────────────────────────────────────────────────── */

export async function getCandidateInboxThreads(
  supabase: SupabaseClient,
  authUserId: string,
  candidateId: string
): Promise<InboxThread[]> {
  const [
    appsResult,
    messagesResult,
    archiveResult,
  ] = await Promise.all([
    supabase
      .from("applications")
      .select(
        `id, candidate_id, job_id, current_stage, primary_location_id,
         jobs:jobs!inner(id, title, dso_id, dso:dsos(id, name, logo_url))`
      )
      .eq("candidate_id", candidateId),
    supabase
      .from("application_messages")
      .select("application_id, sender_role, body, created_at, read_at, deleted_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("inbox_archived_threads")
      .select("application_id")
      .eq("auth_user_id", authUserId),
  ]);

  const apps = (appsResult.data ?? []) as Array<Record<string, unknown>>;
  const messages = (messagesResult.data ?? []) as MessageRowMin[];
  const archivedSet = new Set(
    (archiveResult.data ?? []).map(
      (r) => (r as Record<string, unknown>).application_id as string
    )
  );

  return composeThreads({
    apps,
    messages,
    archivedSet,
    locationMap: new Map(),
    audience: "candidate",
  });
}

/* ──────────────────────────────────────────────────────────────
 * Total unread count for the rail badge
 *
 * Audience-aware: counts messages where sender_role is the OPPOSITE
 * of the caller's audience and read_at IS NULL. RLS already restricts
 * which messages this auth.uid() can see, so we just have to filter
 * by the relevant sender_role.
 * ─────────────────────────────────────────────────────────── */

export async function getUnreadCount(
  supabase: SupabaseClient,
  audience: "candidate" | "employer"
): Promise<number> {
  const otherSide = audience === "candidate" ? "employer" : "candidate";
  const { count } = await supabase
    .from("application_messages")
    .select("id", { count: "exact", head: true })
    .eq("sender_role", otherSide)
    .is("read_at", null)
    .is("deleted_at", null);
  return count ?? 0;
}

/* ──────────────────────────────────────────────────────────────
 * Internal: shape rows into InboxThread[]
 * ─────────────────────────────────────────────────────────── */

function composeThreads({
  apps,
  messages,
  archivedSet,
  locationMap,
  audience,
}: {
  apps: Array<Record<string, unknown>>;
  messages: MessageRowMin[];
  archivedSet: Set<string>;
  locationMap: Map<string, string>;
  audience: "candidate" | "employer";
}): InboxThread[] {
  // Bucket messages by application; first message in each bucket is the
  // most recent (queries.ts ordered desc).
  const bucketed = new Map<string, MessageRowMin[]>();
  for (const m of messages) {
    const list = bucketed.get(m.application_id) ?? [];
    list.push(m);
    bucketed.set(m.application_id, list);
  }

  const otherSide = audience === "candidate" ? "employer" : "candidate";

  const threads: InboxThread[] = [];
  for (const app of apps) {
    const appId = app.id as string;
    const msgs = bucketed.get(appId) ?? [];
    const hasAnyMessage = msgs.length > 0;
    const isArchived = archivedSet.has(appId);
    // Skip applications with NO messages AND not archived — they're
    // not really "threads" yet. A user can archive an empty
    // conversation if they want to; that surfaces it on the
    // Archived tab so they don't lose it.
    if (!hasAnyMessage && !isArchived) continue;

    const last = msgs[0] ?? null;
    const unread = msgs.filter(
      (m) => m.sender_role === otherSide && m.read_at === null
    ).length;

    let peer: InboxThread["peer"];
    let stage: string | null = null;
    let locationId: string | null = null;
    let locationName: string | null = null;
    let jobId: string;
    let jobTitle: string;

    if (audience === "employer") {
      const candidate = app.candidate as Record<string, unknown> | null;
      peer = {
        display_name:
          (candidate?.full_name as string | null) ?? "(name not provided)",
        avatar_url: (candidate?.avatar_url as string | null) ?? null,
      };
      stage = (app.current_stage as string | null) ?? null;
      locationId = (app.primary_location_id as string | null) ?? null;
      locationName = locationId ? locationMap.get(locationId) ?? null : null;
      const job = app.jobs as Record<string, unknown>;
      jobId = job.id as string;
      jobTitle = job.title as string;
    } else {
      const job = app.jobs as Record<string, unknown>;
      const dso = job.dso as Record<string, unknown> | null;
      peer = {
        display_name: (dso?.name as string | null) ?? "DSO",
        avatar_url: (dso?.logo_url as string | null) ?? null,
      };
      jobId = job.id as string;
      jobTitle = job.title as string;
    }

    threads.push({
      application_id: appId,
      job_id: jobId,
      job_title: jobTitle,
      peer,
      last_message_at: last?.created_at ?? null,
      last_message_preview: last ? preview(last.body) : null,
      last_message_sender_role: last?.sender_role ?? null,
      unread_count: unread,
      archived: isArchived,
      stage,
      location_id: locationId,
      location_name: locationName,
    });
  }

  threads.sort((a, b) => {
    const at = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bt = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bt - at;
  });

  return threads;
}

function preview(body: string): string {
  const clean = body.trim().replace(/\s+/g, " ");
  return clean.length > 140 ? `${clean.slice(0, 137)}…` : clean;
}
