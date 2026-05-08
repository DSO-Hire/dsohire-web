/**
 * Inbox thread queries (Phase 4.8 — Inbox v0).
 *
 * Server-side only (called from server actions or server components).
 * Both helpers return `InboxThread[]` sorted by last_message_at desc.
 *
 * Strategy: pull every application the caller can see (RLS handles the
 * scoping), pull every application_messages row in one query, group +
 * project the latest message + unread count per application, and join
 * the archive flags. Two-to-three round trips total.
 *
 * Why not a Postgres view: the inbox shape needs to know the calling
 * user's auth.uid() to compute `unread_count` (count = messages from
 * the OTHER side, where THIS side has not yet marked read_at). A view
 * with auth.uid() works in theory, but per-row recomputation gets
 * expensive at scale. Hand-rolled aggregation in app code is cheap and
 * gives us the exact shape we need.
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCandidateApplicationAffiliations } from "@/lib/dso/affiliation-display";
import type { InboxThread } from "./types";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

interface MessageRowMin {
  application_id: string;
  sender_role: "candidate" | "employer";
  body: string;
  created_at: string;
  read_at: string | null;
  deleted_at: string | null;
  event_kind: string | null;
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
        `id, candidate_id, job_id, status,
         jobs:jobs!inner(id, title, dso_id),
         candidate:candidates(id, full_name, avatar_url)`
      )
      .eq("jobs.dso_id", dsoId),
    supabase
      .from("application_messages")
      .select("application_id, sender_role, body, created_at, read_at, deleted_at, event_kind")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("inbox_archived_threads")
      .select("application_id")
      .eq("auth_user_id", authUserId),
  ]);

  if (appsResult.error) {
    console.error("[inbox] employer apps query", appsResult.error);
  }
  if (messagesResult.error) {
    console.error("[inbox] employer messages query", messagesResult.error);
  }

  const apps = (appsResult.data ?? []) as Array<Record<string, unknown>>;
  const messages = (messagesResult.data ?? []) as MessageRowMin[];
  const archivedSet = new Set(
    (archiveResult.data ?? []).map(
      (r) => (r as Record<string, unknown>).application_id as string
    )
  );

  // Pull every job_location row for the jobs we just loaded so the
  // employer Location dropdown filter has names. Each application
  // gets the FIRST location of its job — multi-location jobs collapse
  // to one for filter purposes (still discoverable via job filter).
  const jobIds = Array.from(
    new Set(
      apps
        .map((a) => {
          const j = a.jobs as Record<string, unknown> | null;
          return j ? (j.id as string) : null;
        })
        .filter((id): id is string => Boolean(id))
    )
  );
  const jobToLocation = new Map<string, { id: string; name: string }>();
  if (jobIds.length > 0) {
    const { data: jl } = await supabase
      .from("job_locations")
      .select("job_id, location:dso_locations(id, name, city, state)")
      .in("job_id", jobIds);
    for (const row of (jl ?? []) as Array<Record<string, unknown>>) {
      const jobId = row.job_id as string;
      if (jobToLocation.has(jobId)) continue; // first location wins
      const loc = row.location as Record<string, unknown> | null;
      if (!loc) continue;
      const id = loc.id as string;
      const name =
        (loc.name as string | null) ??
        [loc.city, loc.state].filter(Boolean).join(", ") ??
        "Unnamed";
      jobToLocation.set(jobId, { id, name });
    }
  }

  return composeThreads({
    apps,
    messages,
    archivedSet,
    jobToLocation,
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
        `id, candidate_id, job_id, status, affiliation_revealed,
         jobs:jobs!inner(id, title, dso_id, dso:dsos(id, name, logo_url, affiliation_reveal_policy))`
      )
      .eq("candidate_id", candidateId),
    supabase
      .from("application_messages")
      .select("application_id, sender_role, body, created_at, read_at, deleted_at, event_kind")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("inbox_archived_threads")
      .select("application_id")
      .eq("auth_user_id", authUserId),
  ]);

  if (appsResult.error) {
    console.error("[inbox] candidate apps query", appsResult.error);
  }
  if (messagesResult.error) {
    console.error("[inbox] candidate messages query", messagesResult.error);
  }

  const apps = (appsResult.data ?? []) as Array<Record<string, unknown>>;
  const messages = (messagesResult.data ?? []) as MessageRowMin[];
  const archivedSet = new Set(
    (archiveResult.data ?? []).map(
      (r) => (r as Record<string, unknown>).application_id as string
    )
  );

  // Affiliation display per application (Phase 4.5.b launch-blocker).
  // Service-role resolver — the candidate-RLS path through
  // job_locations + dso_locations was returning empty silently, which
  // leaked the DSO name AND DSO logo as the thread peer (caught by
  // Cam's stress test 2026-05-08 PM). Helper returns name + avatar +
  // isCorporate per app; we patch BOTH peer.display_name and
  // peer.avatar_url so the masked thread doesn't ship the corporate
  // logo while hiding the corporate name.
  const appIdsForAffiliation = apps
    .map((a) => a.id as string)
    .filter((id): id is string => Boolean(id));
  const affiliationByAppId =
    appIdsForAffiliation.length > 0
      ? await resolveCandidateApplicationAffiliations(appIdsForAffiliation)
      : new Map();

  const threads = composeThreads({
    apps,
    messages,
    archivedSet,
    jobToLocation: new Map(),
    audience: "candidate",
  });

  // Patch each candidate-side thread peer to use the resolved display
  // name AND avatar URL. Keeping this outside composeThreads keeps
  // that helper audience-agnostic — the affiliation logic only
  // applies when the candidate is the viewer.
  return threads.map((t) => {
    const aff = affiliationByAppId.get(t.application_id);
    if (!aff) return t;
    return {
      ...t,
      peer: {
        ...t.peer,
        display_name: aff.name,
        avatar_url: aff.avatarUrl,
      },
    };
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
  jobToLocation,
  audience,
}: {
  apps: Array<Record<string, unknown>>;
  messages: MessageRowMin[];
  archivedSet: Set<string>;
  jobToLocation: Map<string, { id: string; name: string }>;
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
    // not really "threads" yet.
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
      // applications.status is the canonical pipeline-stage column
      // (kanban + reject flows write to it). Surfacing as `stage` on
      // the thread so the rendering layer doesn't have to know.
      stage = (app.status as string | null) ?? null;
      const job = app.jobs as Record<string, unknown>;
      jobId = job.id as string;
      jobTitle = job.title as string;
      const loc = jobToLocation.get(jobId);
      locationId = loc?.id ?? null;
      locationName = loc?.name ?? null;
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
      last_message_event_kind: last?.event_kind ?? null,
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
