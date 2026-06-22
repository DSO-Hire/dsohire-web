/**
 * /admin/support/conversations/[id] — Tier 2 Phase D admin transcript
 * + review actions. Cam-only.
 *
 * Shows the full conversation: user-context block, every message in
 * order with timestamps + tool inputs/outputs expandable, per-turn
 * cost. Bottom actions: Mark reviewed / Flag as bad answer, with an
 * optional reviewer notes textarea.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Wrench,
} from "lucide-react";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { reviewConversation } from "./actions";

export const metadata: Metadata = {
  title: "Conversation · Admin support",
};
export const dynamic = "force-dynamic";

const ADMIN_EMAILS = new Set(["cam@dsohire.com", "cameron@eslingerdental.com"]);

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminConversationPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    redirect(`/employer/sign-in?next=/admin/support/conversations/${id}`);
  if (!user.email || !ADMIN_EMAILS.has(user.email.toLowerCase())) {
    notFound();
  }

  const admin = createSupabaseServiceRoleClient();

  const { data: req } = await admin
    .from("support_requests")
    .select(
      "id, dso_id, auth_user_id, dso_user_id, body, tier_snapshot, status, review_status, reviewed_at, reviewed_by, reviewer_notes, auto_flag_reason, page_url, page_title, created_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (!req) notFound();
  const r = req as {
    id: string;
    dso_id: string | null;
    auth_user_id: string;
    dso_user_id: string | null;
    body: string;
    tier_snapshot: string | null;
    status: string;
    review_status: "unreviewed" | "reviewed" | "flagged_bad";
    reviewed_at: string | null;
    reviewed_by: string | null;
    reviewer_notes: string | null;
    auto_flag_reason: string | null;
    page_url: string | null;
    page_title: string | null;
    created_at: string;
  };

  // DSO name + member name.
  let dsoName: string | null = null;
  if (r.dso_id) {
    const { data: dso } = await admin
      .from("dsos")
      .select("name")
      .eq("id", r.dso_id)
      .maybeSingle();
    dsoName = (dso?.name as string | undefined) ?? null;
  }

  let memberName: string | null = null;
  let memberRole: string | null = null;
  if (r.dso_user_id) {
    const { data: m } = await admin
      .from("dso_users")
      .select("full_name, role")
      .eq("id", r.dso_user_id)
      .maybeSingle();
    memberName = (m?.full_name as string | undefined) ?? null;
    memberRole = (m?.role as string | undefined) ?? null;
  }

  const { data: authorAuth } = await admin.auth.admin.getUserById(r.auth_user_id);
  const authorEmail = authorAuth?.user?.email ?? null;

  // Messages.
  const { data: rawMessages } = await admin
    .from("support_chat_messages")
    .select(
      "id, role, content, tool_name, tool_input, tool_output, model, input_tokens, output_tokens, cached_input_tokens, created_at"
    )
    .eq("request_id", id)
    .order("created_at", { ascending: true });
  type Msg = {
    id: string;
    role: "user" | "assistant" | "system" | "tool";
    content: string | null;
    tool_name: string | null;
    tool_input: unknown;
    tool_output: unknown;
    model: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    cached_input_tokens: number | null;
    created_at: string;
  };
  const messages = (rawMessages as Msg[] | null) ?? [];

  // Feedback rows.
  const { data: feedbackRows } = await admin
    .from("support_chat_feedback")
    .select("message_id, rating, note, created_at")
    .eq("request_id", id);
  const feedbackByMessage = new Map<
    string,
    Array<{ rating: string; note: string | null; created_at: string }>
  >();
  for (const f of (feedbackRows as Array<{
    message_id: string;
    rating: string;
    note: string | null;
    created_at: string;
  }> | null) ?? []) {
    const arr = feedbackByMessage.get(f.message_id) ?? [];
    arr.push(f);
    feedbackByMessage.set(f.message_id, arr);
  }

  // Per-conversation cost total.
  const { data: usageRows } = await admin
    .from("claude_usage_log")
    .select("cost_cents")
    .eq("request_id", id);
  const totalCents = (
    (usageRows as Array<{ cost_cents: number | string }> | null) ?? []
  ).reduce((sum, u) => {
    const v =
      typeof u.cost_cents === "string"
        ? parseFloat(u.cost_cents)
        : u.cost_cents;
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);

  return (
    <main className="min-h-screen bg-cream/30 px-6 py-10">
      <div className="mx-auto max-w-[820px] space-y-6">
        <Link
          href="/admin/support/conversations"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-meta hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          Back to conversations
        </Link>

        <header className="space-y-3">
          <h1 className="font-display text-2xl font-extrabold tracking-[-0.6px] text-ink leading-tight">
            {dsoName ?? "(no DSO)"} — Conversation
          </h1>
          <div className="border-l-3 border-heritage bg-cream/40 px-4 py-3 text-[12px] space-y-1">
            <div>
              <strong>Author:</strong> {memberName ?? authorEmail ?? r.auth_user_id}{" "}
              {memberRole && <span className="text-slate-meta">({memberRole})</span>}
              {authorEmail && (
                <span className="text-slate-meta"> — {authorEmail}</span>
              )}
            </div>
            <div>
              <strong>Tier:</strong> {r.tier_snapshot ?? "?"}
            </div>
            <div>
              <strong>Page when opened:</strong>{" "}
              {r.page_url ? (
                <a
                  href={r.page_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-heritage-deep underline-offset-2 hover:underline"
                >
                  {r.page_title ?? r.page_url}
                </a>
              ) : (
                "(unknown)"
              )}
            </div>
            <div>
              <strong>Started:</strong> {new Date(r.created_at).toLocaleString()}
            </div>
            <div>
              <strong>Total Claude cost:</strong> ${(totalCents / 100).toFixed(4)}
            </div>
            <div>
              <strong>Review status:</strong>{" "}
              <ReviewBadge status={r.review_status} />
              {r.reviewed_at && (
                <span className="text-slate-meta">
                  {" "}
                  · reviewed {new Date(r.reviewed_at).toLocaleString()}
                </span>
              )}
            </div>
            {r.auto_flag_reason && (
              <div className="text-danger inline-flex items-start gap-1.5">
                <AlertTriangle className="size-3 mt-0.5" />
                <span>
                  <strong>Auto-flag reason:</strong> {r.auto_flag_reason}
                </span>
              </div>
            )}
          </div>
        </header>

        <section className="space-y-3">
          {messages.map((m) => (
            <TranscriptMessage
              key={m.id}
              message={m}
              feedback={feedbackByMessage.get(m.id) ?? []}
            />
          ))}
        </section>

        <ReviewActions
          requestId={r.id}
          currentStatus={r.review_status}
          currentNotes={r.reviewer_notes}
        />
      </div>
    </main>
  );
}

function TranscriptMessage({
  message,
  feedback,
}: {
  message: {
    role: "user" | "assistant" | "system" | "tool";
    content: string | null;
    tool_name: string | null;
    tool_input: unknown;
    tool_output: unknown;
    model: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    created_at: string;
  };
  feedback: Array<{ rating: string; note: string | null; created_at: string }>;
}) {
  const ts = new Date(message.created_at).toLocaleString();

  if (message.role === "tool") {
    return (
      <details className="border border-[var(--rule)] bg-cream/30 px-4 py-2.5 text-[12px]">
        <summary className="cursor-pointer inline-flex items-center gap-2 font-semibold text-heritage-deep">
          <Wrench className="size-3" />
          Tool call: <code className="font-mono">{message.tool_name}</code>
          <span className="text-slate-meta font-normal">· {ts}</span>
        </summary>
        <div className="mt-2 space-y-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[1px] text-slate-meta mb-0.5">
              Input
            </div>
            <pre className="font-mono text-[11px] bg-card border border-[var(--rule)] p-2 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(message.tool_input, null, 2)}
            </pre>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[1px] text-slate-meta mb-0.5">
              Output
            </div>
            <pre className="font-mono text-[11px] bg-card border border-[var(--rule)] p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-[400px] overflow-y-auto">
              {JSON.stringify(message.tool_output, null, 2)}
            </pre>
          </div>
        </div>
      </details>
    );
  }

  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div className="max-w-[85%] space-y-1">
        <div className="text-[10px] text-slate-meta px-1 inline-flex items-center gap-2">
          <span className="font-bold uppercase tracking-[1px]">
            {message.role}
          </span>
          <span>{ts}</span>
          {message.model && (
            <span className="font-mono">
              {message.model.replace("claude-", "").replace("-20251001", "")}
            </span>
          )}
          {(message.input_tokens || message.output_tokens) && (
            <span>
              {message.input_tokens ?? 0}→{message.output_tokens ?? 0} tok
            </span>
          )}
        </div>
        <div
          className={
            "px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap rounded " +
            (isUser
              ? "bg-hero text-hero-foreground"
              : "bg-card border border-[var(--rule)]")
          }
        >
          {message.content || (
            <span className="italic text-slate-meta">(empty)</span>
          )}
        </div>
        {feedback.length > 0 && (
          <div className="space-y-1 px-1">
            {feedback.map((f, i) => (
              <div
                key={i}
                className={
                  "text-[11px] inline-flex items-start gap-1.5 " +
                  (f.rating === "up" ? "text-heritage-deep" : "text-danger")
                }
              >
                {f.rating === "up" ? (
                  <ThumbsUp className="size-3 mt-0.5 shrink-0" />
                ) : (
                  <ThumbsDown className="size-3 mt-0.5 shrink-0" />
                )}
                <span>
                  {f.rating === "up" ? "Helpful" : "Not helpful"}
                  {f.note && (
                    <span className="text-slate-meta"> — &ldquo;{f.note}&rdquo;</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewActions({
  requestId,
  currentStatus,
  currentNotes,
}: {
  requestId: string;
  currentStatus: "unreviewed" | "reviewed" | "flagged_bad";
  currentNotes: string | null;
}) {
  return (
    <form action={reviewConversation} className="border-t border-[var(--rule)] pt-5 space-y-3">
      <input type="hidden" name="request_id" value={requestId} />
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-[1px] text-slate-body block mb-1.5">
          Reviewer notes (optional)
        </span>
        <textarea
          name="reviewer_notes"
          rows={3}
          defaultValue={currentNotes ?? ""}
          placeholder="What was good or bad about this conversation?"
          className="w-full px-3 py-2 border border-[var(--rule-strong)] bg-card text-[13px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage"
        />
      </label>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="submit"
          name="next_status"
          value="reviewed"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-heritage-deep text-primary-foreground text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-heritage"
        >
          <CheckCircle2 className="size-3.5" />
          Mark reviewed
        </button>
        <button
          type="submit"
          name="next_status"
          value="flagged_bad"
          className="inline-flex items-center gap-1.5 px-4 py-2 border border-danger text-danger text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-danger-bg"
        >
          <AlertTriangle className="size-3.5" />
          Flag as bad answer
        </button>
        <button
          type="submit"
          name="next_status"
          value="unreviewed"
          className="inline-flex items-center gap-1.5 px-4 py-2 border border-[var(--rule-strong)] text-slate-body text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-cream/60"
        >
          <Clock className="size-3.5" />
          Send back to queue
        </button>
        <span className="text-[11px] text-slate-meta">
          Current: <ReviewBadge status={currentStatus} />
        </span>
      </div>
    </form>
  );
}

function ReviewBadge({
  status,
}: {
  status: "unreviewed" | "reviewed" | "flagged_bad";
}) {
  if (status === "flagged_bad") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-danger-bg text-danger text-[10px] font-bold tracking-[1px] uppercase">
        Flagged bad
      </span>
    );
  }
  if (status === "reviewed") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-heritage/[0.12] text-heritage-deep text-[10px] font-bold tracking-[1px] uppercase">
        Reviewed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-warning-bg text-warning text-[10px] font-bold tracking-[1px] uppercase">
      Unreviewed
    </span>
  );
}
