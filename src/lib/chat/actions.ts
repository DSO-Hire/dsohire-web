"use server";

/**
 * Chat widget server actions (Day 24) — the pop-up chat's data layer.
 *
 * Two thread kinds behind one unified shape:
 *   - "dm"        : teammate-to-teammate direct messages (dm_* tables, new).
 *   - "candidate" : the existing candidate↔employer application inbox
 *                   (application_messages). Sending reuses sendApplicationMessage.
 *
 * Reads run on the authenticated client (RLS-gated). Conversation + participant
 * creation runs on the service-role client with explicit same-DSO checks, since
 * the creator isn't yet a participant when the rows are written.
 */

import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import type { ChatTeammate, ChatThread, ChatMessage } from "./types";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface CurrentChatUser {
  dsoUserId: string;
  dsoId: string;
  authId: string;
  name: string;
}

async function currentChatUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<CurrentChatUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: du } = await supabase
    .from("dso_users")
    .select("id, dso_id, first_name, last_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!du) return null;
  const name =
    [du.first_name, du.last_name].filter(Boolean).join(" ").trim() || "Teammate";
  return {
    dsoUserId: du.id as string,
    dsoId: du.dso_id as string,
    authId: user.id,
    name,
  };
}

/* ───────────────────────── Teammates ───────────────────────── */

export async function listTeammates(): Promise<ChatTeammate[]> {
  const supabase = await createSupabaseServerClient();
  const cur = await currentChatUser(supabase);
  if (!cur) return [];
  const { data } = await supabase
    .from("dso_users")
    .select("id, auth_user_id, first_name, last_name, role, title, avatar_url")
    .eq("dso_id", cur.dsoId);
  return ((data ?? []) as Array<{
    id: string;
    auth_user_id: string | null;
    first_name: string | null;
    last_name: string | null;
    role: string | null;
    title: string | null;
    avatar_url: string | null;
  }>)
    .filter((u) => u.id !== cur.dsoUserId)
    .map((u) => {
      const name =
        [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
        "Teammate";
      return {
        dso_user_id: u.id,
        auth_user_id: u.auth_user_id,
        name,
        role: u.role ?? "member",
        title: u.title ?? null,
        avatar_url: u.avatar_url ?? null,
        initials: initialsOf(name),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ───────────────────────── DM create ───────────────────────── */

export async function findOrCreateDmConversation(
  otherDsoUserId: string
): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const cur = await currentChatUser(supabase);
  if (!cur) return { ok: false, error: "Not signed in." };
  if (otherDsoUserId === cur.dsoUserId)
    return { ok: false, error: "Can't message yourself." };

  const admin = createSupabaseServiceRoleClient();

  // Verify the other user is in the same DSO.
  const { data: other } = await admin
    .from("dso_users")
    .select("id, dso_id")
    .eq("id", otherDsoUserId)
    .maybeSingle();
  if (!other || (other.dso_id as string) !== cur.dsoId) {
    return { ok: false, error: "Teammate not found in your organization." };
  }

  // Find an existing 1:1 conversation: a conversation both are participants of
  // with exactly two participants.
  const { data: mine } = await admin
    .from("dm_participants")
    .select("conversation_id")
    .eq("dso_user_id", cur.dsoUserId);
  const myConvIds = ((mine ?? []) as Array<{ conversation_id: string }>).map(
    (r) => r.conversation_id
  );
  if (myConvIds.length > 0) {
    const { data: shared } = await admin
      .from("dm_participants")
      .select("conversation_id")
      .eq("dso_user_id", otherDsoUserId)
      .in("conversation_id", myConvIds);
    const sharedIds = ((shared ?? []) as Array<{ conversation_id: string }>).map(
      (r) => r.conversation_id
    );
    for (const cid of sharedIds) {
      const { count } = await admin
        .from("dm_participants")
        .select("dso_user_id", { count: "exact", head: true })
        .eq("conversation_id", cid);
      if ((count ?? 0) === 2) return { ok: true, conversationId: cid };
    }
  }

  // Create.
  const { data: conv, error: convErr } = await admin
    .from("dm_conversations")
    .insert({ dso_id: cur.dsoId, created_by: cur.dsoUserId })
    .select("id")
    .single();
  if (convErr || !conv) return { ok: false, error: "Couldn't start the chat." };
  const cid = conv.id as string;
  await admin.from("dm_participants").insert([
    { conversation_id: cid, dso_user_id: cur.dsoUserId },
    { conversation_id: cid, dso_user_id: otherDsoUserId },
  ]);
  return { ok: true, conversationId: cid };
}

/* ───────────────────────── Unified thread list ───────────────────────── */

export async function listChatThreads(): Promise<ChatThread[]> {
  const supabase = await createSupabaseServerClient();
  const cur = await currentChatUser(supabase);
  if (!cur) return [];

  const threads: ChatThread[] = [];

  // ── DM threads ──
  const { data: myParts } = await supabase
    .from("dm_participants")
    .select("conversation_id, last_read_at")
    .eq("dso_user_id", cur.dsoUserId);
  const partRows = (myParts ?? []) as Array<{
    conversation_id: string;
    last_read_at: string;
  }>;
  const convIds = partRows.map((r) => r.conversation_id);
  const lastReadById = new Map(
    partRows.map((r) => [r.conversation_id, r.last_read_at])
  );

  if (convIds.length > 0) {
    // Other participant per conversation.
    const { data: others } = await supabase
      .from("dm_participants")
      .select("conversation_id, dso_user_id")
      .in("conversation_id", convIds)
      .neq("dso_user_id", cur.dsoUserId);
    const otherByConv = new Map<string, string>();
    for (const r of (others ?? []) as Array<{
      conversation_id: string;
      dso_user_id: string;
    }>) {
      if (!otherByConv.has(r.conversation_id))
        otherByConv.set(r.conversation_id, r.dso_user_id);
    }
    const otherIds = [...new Set([...otherByConv.values()])];
    const nameById = new Map<
      string,
      { name: string; role: string; auth: string | null; avatar_url: string | null }
    >();
    if (otherIds.length > 0) {
      const { data: us } = await supabase
        .from("dso_users")
        .select("id, first_name, last_name, role, auth_user_id, avatar_url")
        .in("id", otherIds);
      for (const u of (us ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        role: string | null;
        auth_user_id: string | null;
        avatar_url: string | null;
      }>) {
        const name =
          [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
          "Teammate";
        nameById.set(u.id, {
          name,
          role: u.role ?? "member",
          auth: u.auth_user_id,
          avatar_url: u.avatar_url ?? null,
        });
      }
    }
    // Messages for these conversations (recent slice).
    const { data: msgs } = await supabase
      .from("dm_messages")
      .select("conversation_id, sender_dso_user_id, body, created_at")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false });
    const lastByConv = new Map<string, { body: string; at: string }>();
    const unreadByConv = new Map<string, number>();
    for (const m of (msgs ?? []) as Array<{
      conversation_id: string;
      sender_dso_user_id: string;
      body: string;
      created_at: string;
    }>) {
      if (!lastByConv.has(m.conversation_id))
        lastByConv.set(m.conversation_id, { body: m.body, at: m.created_at });
      const lr = lastReadById.get(m.conversation_id);
      if (
        m.sender_dso_user_id !== cur.dsoUserId &&
        (!lr || new Date(m.created_at).getTime() > new Date(lr).getTime())
      ) {
        unreadByConv.set(
          m.conversation_id,
          (unreadByConv.get(m.conversation_id) ?? 0) + 1
        );
      }
    }
    for (const cid of convIds) {
      const otherId = otherByConv.get(cid);
      const info = otherId ? nameById.get(otherId) : null;
      const last = lastByConv.get(cid);
      threads.push({
        kind: "dm",
        id: cid,
        title: info?.name ?? "Teammate",
        subtitle: roleLabel(info?.role ?? "member"),
        last_message: last?.body ?? null,
        last_at: last?.at ?? null,
        unread: unreadByConv.get(cid) ?? 0,
        initials: initialsOf(info?.name ?? "Teammate"),
        avatar_url: info?.avatar_url ?? null,
        other_auth_id: info?.auth ?? null,
      });
    }
  }

  // ── Candidate threads (recent application inbox) ──
  const { data: appMsgs } = await supabase
    .from("application_messages")
    .select("application_id, sender_role, body, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const amRows = (appMsgs ?? []) as Array<{
    application_id: string;
    sender_role: string;
    body: string | null;
    created_at: string;
    read_at: string | null;
  }>;
  const lastByApp = new Map<string, { body: string | null; at: string }>();
  const unreadByApp = new Map<string, number>();
  for (const m of amRows) {
    if (!lastByApp.has(m.application_id))
      lastByApp.set(m.application_id, { body: m.body, at: m.created_at });
    if (m.sender_role === "candidate" && !m.read_at) {
      unreadByApp.set(
        m.application_id,
        (unreadByApp.get(m.application_id) ?? 0) + 1
      );
    }
  }
  const appIds = [...lastByApp.keys()].slice(0, 15);
  if (appIds.length > 0) {
    const { data: apps } = await supabase
      .from("applications")
      .select("id, candidate:candidates(full_name, avatar_url), job:jobs(title)")
      .in("id", appIds);
    for (const a of (apps ?? []) as unknown as Array<{
      id: string;
      candidate:
        | { full_name: string | null; avatar_url: string | null }
        | Array<{ full_name: string | null; avatar_url: string | null }>
        | null;
      job: { title: string | null } | Array<{ title: string | null }> | null;
    }>) {
      const cand = Array.isArray(a.candidate) ? a.candidate[0] : a.candidate;
      const job = Array.isArray(a.job) ? a.job[0] : a.job;
      const name = cand?.full_name?.trim() || "Candidate";
      const last = lastByApp.get(a.id);
      threads.push({
        kind: "candidate",
        id: a.id,
        title: name,
        subtitle: job?.title ?? "Applicant",
        last_message: last?.body ?? null,
        last_at: last?.at ?? null,
        unread: unreadByApp.get(a.id) ?? 0,
        initials: initialsOf(name),
        avatar_url: cand?.avatar_url ?? null,
      });
    }
  }

  threads.sort(
    (a, b) =>
      new Date(b.last_at ?? 0).getTime() - new Date(a.last_at ?? 0).getTime()
  );
  return threads;
}

function roleLabel(role: string): string {
  return (
    {
      owner: "Owner",
      admin: "Admin",
      recruiter: "Recruiter",
      hiring_manager: "Hiring Manager",
    }[role] ?? "Teammate"
  );
}

/* ───────────────────────── Messages ───────────────────────── */

export async function getDmThreadMessages(
  conversationId: string
): Promise<ChatMessage[]> {
  const supabase = await createSupabaseServerClient();
  const cur = await currentChatUser(supabase);
  if (!cur) return [];
  const { data } = await supabase
    .from("dm_messages")
    .select("id, sender_dso_user_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);
  return ((data ?? []) as Array<{
    id: string;
    sender_dso_user_id: string;
    body: string;
    created_at: string;
  }>).map((m) => ({
    id: m.id,
    body: m.body,
    created_at: m.created_at,
    mine: m.sender_dso_user_id === cur.dsoUserId,
    sender_name: m.sender_dso_user_id === cur.dsoUserId ? cur.name : "Teammate",
  }));
}

export async function sendDmMessage(
  conversationId: string,
  body: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const cur = await currentChatUser(supabase);
  if (!cur) return { ok: false, error: "Not signed in." };
  const clean = body.trim();
  if (!clean) return { ok: false, error: "Empty message." };
  if (clean.length > 4000) return { ok: false, error: "Message too long." };

  const { data, error } = await supabase
    .from("dm_messages")
    .insert({
      conversation_id: conversationId,
      sender_dso_user_id: cur.dsoUserId,
      body: clean,
    })
    .select("id")
    .single();
  if (error || !data)
    return { ok: false, error: error?.message ?? "Couldn't send." };

  await supabase
    .from("dm_conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);
  await supabase
    .from("dm_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("dso_user_id", cur.dsoUserId);

  return { ok: true, id: data.id as string };
}

export async function markDmRead(conversationId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const cur = await currentChatUser(supabase);
  if (!cur) return;
  await supabase
    .from("dm_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("dso_user_id", cur.dsoUserId);
}

export async function getCandidateThreadMessages(
  applicationId: string
): Promise<ChatMessage[]> {
  const supabase = await createSupabaseServerClient();
  const cur = await currentChatUser(supabase);
  if (!cur) return [];
  const { data } = await supabase
    .from("application_messages")
    .select("id, sender_role, body, created_at")
    .eq("application_id", applicationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  return ((data ?? []) as Array<{
    id: string;
    sender_role: string;
    body: string | null;
    created_at: string;
  }>)
    .filter((m) => m.body)
    .map((m) => ({
      id: m.id,
      body: m.body as string,
      created_at: m.created_at,
      mine: m.sender_role === "employer",
      sender_name: m.sender_role === "employer" ? "Your team" : "Candidate",
    }));
}
