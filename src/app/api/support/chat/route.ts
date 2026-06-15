/**
 * POST /api/support/chat — Tier 2 in-app support Claude endpoint.
 *
 * Phase A: pure-RAG-grounded streaming (no tools). Phase B (here):
 * adds tool-use loop. Claude can now call 8 read-only tools to ground
 * answers in the user's actual app state.
 *
 * Locked posture: tool-shy. System prompt instructs Claude to default
 * to RAG-only answers and call tools only when the question explicitly
 * needs user-specific data.
 *
 * Flow:
 *   1. Auth → kill switch → quota → conversation root → history → RAG
 *   2. First Anthropic call with tools enabled. NOT streamed — tool
 *      calls happen mid-stream which makes parsing complex; we do
 *      blocking turns 1..N-1 to handle tool dispatch, then stream
 *      ONLY the final assistant text.
 *   3. If stop_reason='tool_use': execute every tool_use block in
 *      parallel (they're read-only so order doesn't matter), append
 *      tool_result blocks to messages, re-call Anthropic, loop.
 *   4. When stop_reason='end_turn' AND we have an assistant text
 *      response: stream it as SSE for that natural typing-cursor feel.
 *      (If the response is small, just send it as a single chunk.)
 *   5. After stream completes: log usage (sum across all turns),
 *      persist user + tool + assistant messages to support_chat_messages.
 */

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
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
import { HELP_CONTENT } from "@/lib/help/help-content";
import { allToolSchemas, dispatchTool } from "@/lib/support/tools/dispatcher";
import type { ToolContext, ServerClient } from "@/lib/support/tools/types";
import { autoFlagReason, isFirstHundredMode } from "@/lib/support/auto-flag";

interface ChatBody {
  message: string;
  request_id?: string | null;
  page_url?: string;
  page_title?: string;
  /** Lane 8: the entity the user is currently viewing. The id is the
   *  only field trusted for authority — verified server-side under RLS.
   *  label/secondary are display-only (already masked by the page). */
  page_context?: {
    kind?: string;
    id?: string;
    label?: string;
    secondary?: string | null;
  } | null;
}

const SYSTEM_PROMPT_BASE = `You are DSO Hire's in-app support assistant. \
You help DSO admins, recruiters, and candidates with questions about \
the DSO Hire platform — a dental hiring platform built for mid-market \
dental groups.

Behavior rules:

1. You have read-only tools to look up the asking user's actual data. \
USE THEM AGGRESSIVELY when the question is user-specific. If a user \
asks anything about their own data — their team, their applications, \
their candidates, their emails, their plan, their recent activity — \
CALL THE RELEVANT TOOL FIRST and answer from real data. Do NOT tell \
the user to "check Settings" or "look in your dashboard" when you can \
look it up yourself. Examples that MUST trigger tools:
- "Who's on my team?" → lookup_dso_members
- "Show me my recent activity" / "What did I just do?" → \
lookup_user_recent_actions
- "What stage is application X on?" / "What's the status of <uuid>?" \
→ lookup_application_status
- "Why didn't candidate X get my email?" → \
lookup_candidate_email_history (use find_candidate_by_name FIRST if \
the user gave a name not a UUID)
- "What's my plan?" / "Am I on Growth?" → lookup_subscription_status \
(unless the answer is already in your user-context block below)
- "What are the details of job X?" → lookup_job_details (use \
find_job_by_title FIRST if the user gave a title not a UUID)
- "How many active jobs do I have?" / "Show me my open postings" → \
list_active_jobs
- "Show me recent applicants" / "Who applied this week?" → \
list_recent_applications
- "How many candidates are in Interview?" / "What's my pipeline \
snapshot?" → count_applications_by_stage
- "What's Sarah Chen's email status?" → find_candidate_by_name to \
get the id, then lookup_candidate_email_history with the result
- "Find me docs on X" / "Where's the article about Y?" → \
search_help_articles

**Chained tool pattern:** when the user references a candidate or job \
by NAME (not UUID), first call find_candidate_by_name or \
find_job_by_title to get the id, THEN call the specific lookup tool \
with that id. Don't ask the user for a UUID — find it yourself.

**Focused entity:** if the User context block has a "Viewing right now" \
line, the user is looking at that exact record and its ids are given \
(application/job/candidate). Resolve "her", "this candidate", "this \
application", "this job" to it and call tools with those ids directly — \
never ask the user for an id you already have from the focus line.

2. For general how-to questions ("how do I post a job", "what does \
the kanban view do") answer from the help registry below. Relevant \
articles are pre-injected under "Relevant help articles." Cite the \
article by linking its slug — e.g. "See [Bulk add locations](/help/\
locations-bulk-import) for the full walkthrough." Keep answers tight: \
1-3 short paragraphs.

3. Use the user-context block below to personalize without repeating \
it back at them.

4. If the registry + tools don't cover the question, OR you're not \
confident in the answer, say so honestly and offer escalation: "I \
don't have a confident answer on that — want me to pass this to the \
team?" Don't invent details or speculate about features that might \
not exist.

5. You CANNOT take actions on the user's behalf in this version (no \
sending emails, changing settings, etc.). If they ask you to do \
something, walk them through how to do it themselves.

6. Be warm but concise. Direct, expert, no fluff. Never use emojis.`;

const MAX_TOOL_TURNS = 4; // Anthropic best practice — bounds the loop.

/** A source the answer actually drew on — rendered as a chip in the drawer. */
interface Citation {
  type: "help" | "data";
  label: string;
  /** Internal href for help citations (the /help/<slug> deep link). */
  href?: string;
}

interface AnthropicTextBlock {
  type: "text";
  text: string;
}

interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

type AnthropicResponseBlock = AnthropicTextBlock | AnthropicToolUseBlock;

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

  // ── Kill switch ──
  const kill = await checkKillSwitch({ authUserId: user.id, dsoId });
  if (kill.frozen) {
    await notifyKillSwitchTripped({
      scope: kill.perDsoCentsToday >= 1500 ? "per_dso" : "global",
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

  // ── Quota check ──
  const quota = await checkQuota({ authUserId: user.id, dsoId, tier });
  if (!quota.allowed) {
    return NextResponse.json({
      ok: false,
      quota_exceeded: true,
      message: quota.reason,
      cap: quota.cap,
    });
  }

  // ── Conversation root ──
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

  // ── Conversation history ──
  const { data: priorMessages } = await admin
    .from("support_chat_messages")
    .select("role, content")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  // ── RAG retrieval ──
  let helpSlice = "";
  try {
    const retrieved = await retrieveRelevantHelp(userMessage, 5, 0.3);
    helpSlice = formatHelpForPrompt(retrieved);
  } catch (err) {
    console.warn("[support/chat] RAG retrieval failed", err);
  }

  // ── Resolve the focused entity (Lane 8 page context) under RLS ──
  const pageFocus = await resolvePageContext(supabase, body.page_context);

  // ── Build system prompt + initial message list ──
  const userContextBlock = buildUserContextBlock({
    dsoName,
    role,
    tier,
    pageUrl: body.page_url ?? null,
    pageTitle: body.page_title ?? null,
    focus: pageFocus,
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

  // Messages array we mutate across tool-use turns. Use Anthropic's
  // MessageParam type directly so the SDK accepts both string content
  // (plain text turns) and ContentBlockParam arrays (assistant tool_use
  // responses + user tool_result responses).
  const claudeMessages: Anthropic.MessageParam[] = [];
  for (const m of priorMessages ?? []) {
    const msg = m as { role: string; content: string | null };
    if ((msg.role === "user" || msg.role === "assistant") && msg.content) {
      claudeMessages.push({ role: msg.role, content: msg.content });
    }
  }
  claudeMessages.push({ role: "user", content: userMessage });

  // ── Persist user message NOW (survives a stream failure) ──
  await admin.from("support_chat_messages").insert({
    request_id: requestId,
    role: "user",
    content: userMessage,
  });

  // ── Build tool context for tool dispatch ──
  const toolCtx: ToolContext = {
    authUserId: user.id,
    dsoUserId,
    dsoId,
    role,
    supabase,
    admin,
  };

  const tools = allToolSchemas();
  const anthropic = getAnthropic();

  // Cumulative usage across all turns.
  let totalInput = 0;
  let totalOutput = 0;
  let totalCachedInput = 0;

  // ── Tool-use loop — bounded by MAX_TOOL_TURNS ──
  let finalText = "";
  let toolEventBuffer: Array<{
    tool_use_id: string;
    name: string;
    input: Record<string, unknown>;
    output: unknown;
  }> = [];

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const response = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages: claudeMessages,
    });

    totalInput += response.usage.input_tokens;
    totalOutput += response.usage.output_tokens;
    totalCachedInput += response.usage.cache_read_input_tokens ?? 0;

    const blocks = response.content as AnthropicResponseBlock[];

    // Stop if no tool calls — we have our final assistant message.
    if (response.stop_reason !== "tool_use") {
      const textBlock = blocks.find((b) => b.type === "text") as
        | AnthropicTextBlock
        | undefined;
      finalText = textBlock?.text ?? "";
      break;
    }

    // Tool calls present. Append the assistant's tool_use response,
    // execute each tool, append tool_result blocks, loop.
    // Cast through the SDK's own response shape — the blocks array is
    // exactly what Anthropic returned so it's structurally compatible
    // with the Param variant the next call expects.
    claudeMessages.push({
      role: "assistant",
      content: response.content as unknown as Anthropic.ContentBlockParam[],
    });

    const toolUseBlocks = blocks.filter(
      (b) => b.type === "tool_use"
    ) as AnthropicToolUseBlock[];

    // Execute tools in parallel (read-only, order-independent).
    const results = await Promise.all(
      toolUseBlocks.map(async (tu) => {
        const output = await dispatchTool(tu.name, tu.input, toolCtx);
        toolEventBuffer.push({
          tool_use_id: tu.id,
          name: tu.name,
          input: tu.input,
          output,
        });
        return {
          type: "tool_result" as const,
          tool_use_id: tu.id,
          content: JSON.stringify(output),
        };
      })
    );

    claudeMessages.push({ role: "user", content: results });

    // Safety: if we've made MAX_TOOL_TURNS calls and still got tool_use,
    // bail with whatever text we have (likely empty). The next iteration's
    // break-condition won't fire so we explicitly handle the final iteration.
    if (turn === MAX_TOOL_TURNS - 1) {
      finalText =
        "I needed more tool calls than I'm allowed to make for one question. Try breaking the question into smaller pieces, or escalate to a human via the button below.";
      break;
    }
  }

  if (!finalText) {
    finalText =
      "I couldn't form a complete answer. Try rephrasing, or escalate to a human via the button below.";
  }

  // ── Citations: the sources the answer actually used (Lane 8 C2) ──
  // Derived from help links Claude wrote (resolved against the real
  // registry — hallucinated /help/x links get no chip) + the data tools
  // it called. Then the raw /help/ markdown is collapsed to its label so
  // the bubble reads clean (the chip carries the link).
  const citations = buildCitations(finalText, toolEventBuffer);
  finalText = cleanHelpLinks(finalText);

  // ── Stream final text to client as SSE ──
  const encoder = new TextEncoder();
  const assistantId = randomUUID();
  const finalTextRef = finalText;
  const finalUsage = {
    input_tokens: totalInput,
    output_tokens: totalOutput,
    cached_input_tokens: totalCachedInput,
  };
  const capturedRequestId = requestId;
  const capturedToolEvents = toolEventBuffer;
  const capturedCitations = citations;

  // Insert the assistant message FIRST so we have an id to attach
  // user feedback to. Update it with the streamed content + usage
  // after the stream completes. Insert with empty content; client
  // gets the id via the 'start' SSE event so the 👍/👎 buttons can
  // reference it.
  const { data: assistantRow } = await admin
    .from("support_chat_messages")
    .insert({
      request_id: capturedRequestId,
      role: "assistant",
      content: "",
      model: HAIKU_MODEL,
    })
    .select("id")
    .single();
  const assistantMessageId =
    (assistantRow?.id as string | undefined) ?? assistantId;

  const sseStream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: start\ndata: ${JSON.stringify({
            assistantId: assistantMessageId,
            requestId: capturedRequestId,
          })}\n\n`
        )
      );

      // Emit tool events FIRST so the UI can render progress pills
      // even though the actual tool calls already completed.
      for (const t of capturedToolEvents) {
        controller.enqueue(
          encoder.encode(
            `event: tool_use\ndata: ${JSON.stringify({
              name: t.name,
              friendly_label: friendlyToolLabel(t.name),
            })}\n\n`
          )
        );
      }

      // Chunk the final text into ~30-char windows for a natural
      // streaming feel (we already have the full text — no point in
      // making the user wait for nothing).
      const chunks = chunkText(finalTextRef, 30);
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(
            `event: token\ndata: ${JSON.stringify({ chunk })}\n\n`
          )
        );
        // Tiny delay so it feels live, not pasted.
        await new Promise((r) => setTimeout(r, 12));
      }

      // Emit citations (sources actually used) after the text lands.
      if (capturedCitations.length > 0) {
        controller.enqueue(
          encoder.encode(
            `event: citations\ndata: ${JSON.stringify({
              citations: capturedCitations,
            })}\n\n`
          )
        );
      }

      // Persist tool messages + assistant message + log usage.
      // AWAIT all per the Vercel serverless gotcha rule.
      for (const t of capturedToolEvents) {
        await admin.from("support_chat_messages").insert({
          request_id: capturedRequestId,
          role: "tool",
          tool_name: t.name,
          tool_input: t.input as never,
          tool_output: t.output as never,
        });
      }

      // Update the assistant message row we pre-inserted with the
      // final content + usage metrics so the id stays stable for
      // feedback references.
      await admin
        .from("support_chat_messages")
        .update({
          content: finalTextRef,
          input_tokens: finalUsage.input_tokens,
          output_tokens: finalUsage.output_tokens,
          cached_input_tokens: finalUsage.cached_input_tokens,
        })
        .eq("id", assistantMessageId);

      await logUsage({
        authUserId: user.id,
        dsoId,
        surface: "support_chat",
        model: HAIKU_MODEL,
        inputTokens: finalUsage.input_tokens,
        outputTokens: finalUsage.output_tokens,
        cachedInputTokens: finalUsage.cached_input_tokens,
        requestId: capturedRequestId,
      });

      // ── Auto-flag heuristic ──
      // Tier 2 Phase D: surface conversations where Claude expressed
      // uncertainty / refused / a tool errored. Also auto-mark every
      // conversation 'unreviewed' while first-100 mode is on so they
      // all land in Cam's review queue.
      const toolErrors = capturedToolEvents.filter((t) => {
        const out = t.output as { error?: unknown } | null;
        return out !== null && typeof out === "object" && "error" in out;
      }).length;
      const flagReason = autoFlagReason({
        assistantText: finalTextRef,
        toolErrors,
      });
      const inFirst100 = isFirstHundredMode();

      if (flagReason || inFirst100) {
        await admin
          .from("support_requests")
          .update({
            review_status: flagReason ? "flagged_bad" : "unreviewed",
            auto_flag_reason: flagReason,
          })
          .eq("id", capturedRequestId);
      }

      controller.enqueue(
        encoder.encode(
          `event: done\ndata: ${JSON.stringify({
            assistantId: assistantMessageId,
            inputTokens: finalUsage.input_tokens,
            outputTokens: finalUsage.output_tokens,
            toolCalls: capturedToolEvents.length,
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
  focus: string | null;
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
  if (args.focus) {
    lines.push(`- Viewing right now: ${args.focus}`);
  }
  return lines.join("\n");
}

/** Cosmetic display text from the client — strip newlines, cap length. */
function sanitizeContextText(s: string | null | undefined, max: number): string {
  if (!s) return "";
  return s.replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

/**
 * Resolve the client-supplied page context into a trustworthy "Viewing"
 * line. The id is verified under the caller's RLS-scoped client (so Claude
 * can only ever be pointed at a record the asking DSO can actually see);
 * the label/secondary are display-only. Returns null (no context injected)
 * if the id can't be verified or the kind is unknown.
 */
async function resolvePageContext(
  supabase: ServerClient,
  pc: ChatBody["page_context"]
): Promise<string | null> {
  if (!pc || !pc.id || !pc.kind) return null;
  const id = String(pc.id);
  // Cheap uuid-ish guard before hitting the DB.
  if (!/^[0-9a-fA-F-]{16,}$/.test(id)) return null;

  const label = sanitizeContextText(pc.label, 80);
  const secondary = sanitizeContextText(pc.secondary, 80);
  const display = secondary
    ? `${label} — ${secondary}`
    : label || "(this record)";

  try {
    if (pc.kind === "application") {
      const { data } = await supabase
        .from("applications")
        .select("id, job_id, candidate_id")
        .eq("id", id)
        .maybeSingle();
      if (!data) return null;
      return `${display} (focus: application id=${id} job_id=${data.job_id} candidate_id=${data.candidate_id})`;
    }
    if (pc.kind === "job" || pc.kind === "board") {
      const { data } = await supabase
        .from("jobs")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      if (!data) return null;
      const kindLabel =
        pc.kind === "board" ? "pipeline board for job" : "job";
      return `${display} (focus: ${kindLabel} id=${id})`;
    }
  } catch (err) {
    console.warn("[support/chat] resolvePageContext failed", err);
  }
  return null;
}

/**
 * Resolve a /help/<slug> the way the real /help/[key] route does, so a
 * citation chip only appears for an article that actually exists. Tolerant
 * of slug↔key dotting (mirrors findEntry in app/help/[key]/page.tsx).
 */
function resolveHelpSlug(rawSlug: string): { title: string; slug: string } | null {
  const slug = rawSlug.replace(/[._-]+$/, "");
  const entry = HELP_CONTENT[slug] ?? HELP_CONTENT[slug.replace(/-/g, ".")];
  if (!entry) return null;
  return { title: entry.title, slug };
}

/** Noun-form source label for a data tool, or null to omit it as a citation. */
function toolCitationLabel(name: string): string | null {
  const map: Record<string, string> = {
    lookup_user_recent_actions: "Your recent activity",
    lookup_application_status: "This application's status",
    lookup_candidate_email_history: "Email history",
    lookup_job_details: "Job details",
    lookup_dso_members: "Your team",
    lookup_subscription_status: "Your plan",
    list_active_jobs: "Your active jobs",
    list_recent_applications: "Recent applicants",
    count_applications_by_stage: "Your pipeline",
  };
  // find_*_by_* and the help lookups are plumbing, not sources — omit.
  return map[name] ?? null;
}

/** Build citation chips from the help links Claude wrote + the data tools it ran. */
function buildCitations(
  text: string,
  toolEvents: Array<{ name: string }>
): Citation[] {
  const out: Citation[] = [];
  const seen = new Set<string>();

  const re = /\/help\/([A-Za-z0-9._-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const resolved = resolveHelpSlug(m[1]);
    if (!resolved) continue;
    const key = `help:${resolved.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: "help", label: resolved.title, href: `/help/${resolved.slug}` });
  }

  for (const t of toolEvents) {
    const label = toolCitationLabel(t.name);
    if (!label) continue;
    const key = `data:${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: "data", label });
  }

  return out;
}

/** Collapse `[label](/help/slug)` → `label` so the bubble reads clean
 *  (the citation chip carries the link). Non-help links are left alone. */
function cleanHelpLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\(\/help\/[^)]+\)/g, "$1");
}

/** Split a string into chunks of ~size chars at word boundaries when possible. */
function chunkText(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + size, text.length);
    // Try to break on a space within the next 10 chars for natural chunks.
    if (end < text.length) {
      const space = text.lastIndexOf(" ", end + 10);
      if (space > i) end = space + 1;
    }
    out.push(text.slice(i, end));
    i = end;
  }
  return out;
}

function friendlyToolLabel(name: string): string {
  const map: Record<string, string> = {
    lookup_user_recent_actions: "Checking your recent activity",
    lookup_application_status: "Looking up that application",
    lookup_candidate_email_history: "Checking the candidate's email history",
    lookup_job_details: "Pulling job details",
    lookup_dso_members: "Looking at your team",
    lookup_subscription_status: "Checking your plan",
    lookup_help_article: "Pulling a help article",
    search_help_articles: "Searching help docs",
    list_active_jobs: "Listing your active jobs",
    list_recent_applications: "Pulling recent applicants",
    find_candidate_by_name: "Looking up that candidate",
    find_job_by_title: "Finding that job",
    count_applications_by_stage: "Counting your pipeline",
  };
  return map[name] ?? `Running ${name}`;
}
