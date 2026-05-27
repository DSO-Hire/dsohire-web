/**
 * POST /api/support/chat — Tier 2 in-app support Claude streaming endpoint.
 *
 * Foundation built in Phase A.1 (schema + cost-logging + rate-limit +
 * kill-switch helpers) and A.2 (Voyage RAG + this endpoint).
 *
 * Flow on every user message:
 *   1. Auth — resolve user, DSO membership, role, subscription tier
 *   2. Kill switch check (per-DSO daily $ + global daily $) — frozen?
 *      return a "frozen, email support directly" message
 *   3. Quota check (per-user-daily count + per-DSO-monthly count) — over?
 *      return a "quota hit, email support directly" message
 *   4. Resolve or create the conversation root (support_requests row)
 *   5. Load conversation history (messages so far in this conversation)
 *   6. RAG: embed user message via Voyage, retrieve top-5 help entries
 *   7. Build the system prompt: persona + behavior rules + RAG slice +
 *      user-context block (DSO/role/tier/page)
 *   8. Call Anthropic Haiku 4.5 with streaming enabled
 *   9. Stream the response as Server-Sent Events back to the client
 *  10. After stream completes: log usage, persist user + assistant
 *      messages to support_chat_messages
 *
 * Locked posture (per Tier 2 spec doc Day 21 walkthrough):
 *   - Tool-shy at launch: NO tool calls in this version. Registry RAG
 *     + user-context block is the entire grounding. Tools land Phase B.
 *   - Haiku-default, no auto-escalation to Sonnet at launch. Instrument
 *     and revisit after first 100 conversations.
 *   - 24h conversation persistence (enforced by archiving cron later;
 *     for now the request_id passed by the client controls continuity).
 */

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { getActiveSubscription } from "@/lib/billing/subscription";
import { getAnthropic, HAIKU_MODEL } from "@/lib/ai/anthropic";
import {
  checkKillSwitch,
  checkQuota,
  type TierKey,
} from "@/lib/support/rate-limit";
import { logUsage } from "@/lib/support/claude-usage";
import { notifyKillSwitchTripped } from "@/lib/support/kill-switch-alert";
import { formatHelpForPrompt, retrieveRelevantHelp } from "@/lib/support/rag";

interface ChatBody {
  message: string;
  /** When null/missing, we create a fresh conversation root. */
  request_id?: string | null;
  /** Current page URL — for the user-context block in the system prompt. */
  page_url?: string;
  /** Page title hint (document.title) — same purpose. */
  page_title?: string;
}

const SYSTEM_PROMPT_BASE = `You are DSO Hire's in-app support assistant. You help DSO admins, \
recruiters, and candidates with questions about the DSO Hire platform — \
a dental hiring platform built for mid-market dental groups.

Behavior rules:

1. Answer from the help registry first. The registry articles relevant \
to this question are included below under "Relevant help articles." \
Cite the article you used by linking its slug — e.g. "See [Bulk add \
locations](/help/locations-bulk-import) for the full walkthrough."

2. Use the user-context block below to personalize your answers. \
Reference the user's specific DSO, role, and tier where relevant. \
Don't repeat the context block back at them — use it.

3. Keep answers tight: 1-3 short paragraphs in most cases. Lists when \
helpful. Don't pad.

4. If the registry doesn't cover the question, OR you're not confident \
in the answer, say so honestly and offer to escalate to a human: \
"I don't have docs that cover this — want me to pass this to the team?" \
Don't invent details. Don't speculate about features that might exist.

5. You CANNOT take actions on behalf of the user in this version. If \
they ask you to do something (send an email, change a setting, etc.), \
walk them through how to do it themselves. Action-taking is a future \
phase.

6. Be warm but concise. Match the platform's voice: direct, expert, \
no fluff. Never use emojis.`;

export async function POST(request: Request) {
  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const userMessage = String(body.message ?? "").trim();
  if (!userMessage) {
    return NextResponse.json(
      { ok: false, error: "Send a message to start." },
      { status: 400 }
    );
  }
  if (userMessage.length > 4000) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "That message is too long (max 4000 chars). Break it into smaller questions.",
      },
      { status: 400 }
    );
  }

  // ── Auth + DSO context ──
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Please sign in first." },
      { status: 401 }
    );
  }

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, role, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  let dsoId: string | null = null;
  let dsoUserId: string | null = null;
  let role: string | null = null;
  let dsoName: string | null = null;
  let tier: TierKey = "candidate";

  if (dsoUser) {
    dsoId = (dsoUser as { dso_id: string }).dso_id;
    dsoUserId = (dsoUser as { id: string }).id;
    role = (dsoUser as { role: string }).role;
    const sub = await getActiveSubscription(supabase, dsoId);
    const subTier = sub?.tier ?? "solo";
    tier = (
      ["solo", "growth", "scale", "enterprise"].includes(subTier)
        ? subTier
        : "solo"
    ) as TierKey;
    const { data: dsoRow } = await supabase
      .from("dsos")
      .select("name")
      .eq("id", dsoId)
      .maybeSingle();
    dsoName = (dsoRow?.name as string | undefined) ?? null;
  }

  // ── Kill switch (hard freeze) ──
  const kill = await checkKillSwitch({ authUserId: user.id, dsoId });
  if (kill.frozen) {
    // Fire the alert (15-min throttled per-scope). Await per the
    // Vercel serverless gotcha rule.
    await notifyKillSwitchTripped({
      scope:
        kill.perDsoCentsToday >= 1500 ? "per_dso" : "global",
      dsoId,
      perDsoCents: kill.perDsoCentsToday,
      globalCents: kill.globalCentsToday,
      triggeringAuthUserId: user.id,
    });
    return NextResponse.json({
      ok: false,
      frozen: true,
      message: kill.reason,
    });
  }

  // ── Quota check (soft cap) ──
  const quota = await checkQuota({
    authUserId: user.id,
    dsoId,
    tier,
  });
  if (!quota.allowed) {
    return NextResponse.json({
      ok: false,
      quota_exceeded: true,
      message: quota.reason,
      cap: quota.cap,
    });
  }

  // ── Resolve or create the conversation root ──
  const admin = createSupabaseServiceRoleClient();
  let requestId = body.request_id ?? null;
  if (!requestId) {
    const { data: created, error: createErr } = await admin
      .from("support_requests")
      .insert({
        dso_id: dsoId,
        dso_user_id: dsoUserId,
        auth_user_id: user.id,
        body: userMessage.slice(0, 5000),
        page_url: body.page_url?.slice(0, 500) ?? null,
        page_title: body.page_title?.slice(0, 240) ?? null,
        tier_snapshot: tier,
      })
      .select("id")
      .single();
    if (createErr || !created) {
      console.error("[support/chat] create request failed", createErr);
      return NextResponse.json(
        { ok: false, error: "Couldn't start the conversation. Try again." },
        { status: 500 }
      );
    }
    requestId = created.id as string;
  }

  // ── Load conversation history so far ──
  const { data: priorMessages } = await admin
    .from("support_chat_messages")
    .select("role, content")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  // ── RAG: embed user message, retrieve top-5 relevant help entries ──
  let helpSlice = "";
  try {
    const retrieved = await retrieveRelevantHelp(userMessage, 5, 0.3);
    helpSlice = formatHelpForPrompt(retrieved);
  } catch (err) {
    console.warn("[support/chat] RAG retrieval failed — proceeding without help slice", err);
  }

  // ── Build the system prompt + message list ──
  const userContextBlock = buildUserContextBlock({
    dsoName,
    role,
    tier,
    pageUrl: body.page_url ?? null,
    pageTitle: body.page_title ?? null,
  });

  const systemPrompt = [
    SYSTEM_PROMPT_BASE,
    "",
    "---",
    "",
    "## User context",
    "",
    userContextBlock,
    "",
    "---",
    "",
    "## Relevant help articles",
    "",
    helpSlice ||
      "(No directly relevant articles found — answer from general knowledge of the platform if the question is general; offer to escalate otherwise.)",
  ].join("\n");

  const claudeMessages: Array<{
    role: "user" | "assistant";
    content: string;
  }> = [];
  for (const m of priorMessages ?? []) {
    const msg = m as { role: string; content: string | null };
    if (msg.role === "user" || msg.role === "assistant") {
      if (msg.content) {
        claudeMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }
  }
  claudeMessages.push({ role: "user", content: userMessage });

  // ── Insert the user's message NOW so it persists even if the stream fails ──
  await admin.from("support_chat_messages").insert({
    request_id: requestId,
    role: "user",
    content: userMessage,
  });

  // ── Call Anthropic with streaming ──
  const anthropic = getAnthropic();
  const stream = await anthropic.messages.stream({
    model: HAIKU_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: claudeMessages,
  });

  // ── Stream response as Server-Sent Events ──
  const encoder = new TextEncoder();
  const assistantId = randomUUID();
  let assistantText = "";

  const sseStream = new ReadableStream({
    async start(controller) {
      // Send the assistant message id up front so the client can render
      // a placeholder bubble and stream tokens into it.
      controller.enqueue(
        encoder.encode(
          `event: start\ndata: ${JSON.stringify({
            assistantId,
            requestId,
          })}\n\n`
        )
      );

      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const chunk = event.delta.text;
            assistantText += chunk;
            controller.enqueue(
              encoder.encode(
                `event: token\ndata: ${JSON.stringify({ chunk })}\n\n`
              )
            );
          }
        }
      } catch (err) {
        console.error("[support/chat] stream error", err);
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({
              message: "Stream interrupted — try again.",
            })}\n\n`
          )
        );
      }

      // Final usage from the SDK after the stream completes.
      const finalMessage = await stream.finalMessage();
      const inputTokens = finalMessage.usage.input_tokens;
      const outputTokens = finalMessage.usage.output_tokens;
      const cachedInputTokens =
        finalMessage.usage.cache_read_input_tokens ?? 0;

      // Persist assistant message + log usage. AWAIT both per the
      // Vercel serverless gotcha rule.
      await admin.from("support_chat_messages").insert({
        request_id: requestId,
        role: "assistant",
        content: assistantText,
        model: HAIKU_MODEL,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cached_input_tokens: cachedInputTokens,
      });

      await logUsage({
        authUserId: user.id,
        dsoId,
        surface: "support_chat",
        model: HAIKU_MODEL,
        inputTokens,
        outputTokens,
        cachedInputTokens,
        requestId: requestId,
      });

      controller.enqueue(
        encoder.encode(
          `event: done\ndata: ${JSON.stringify({
            assistantId,
            inputTokens,
            outputTokens,
          })}\n\n`
        )
      );
      controller.close();
    },
  });

  return new Response(sseStream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

function buildUserContextBlock(args: {
  dsoName: string | null;
  role: string | null;
  tier: TierKey;
  pageUrl: string | null;
  pageTitle: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`- DSO: ${args.dsoName ?? "(no DSO — candidate or pre-onboarding)"}`);
  lines.push(`- Role: ${args.role ?? "candidate"}`);
  lines.push(`- Plan: ${args.tier}`);
  lines.push(
    `- Currently on: ${args.pageTitle ?? args.pageUrl ?? "(unknown page)"}`
  );
  if (args.pageUrl && args.pageTitle) {
    lines.push(`  - URL: ${args.pageUrl}`);
  }
  return lines.join("\n");
}
