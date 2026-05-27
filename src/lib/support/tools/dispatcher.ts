/**
 * Tool dispatcher for the Tier 2 support chat endpoint.
 *
 * Registers the 8 read-only tools. Given a tool_use block from Claude,
 * looks up the handler, runs it with the caller's auth context, returns
 * a tool_result-compatible payload.
 *
 * Every tool call is also logged to support_chat_messages with role=
 * 'tool' so we have forensic trail of what Claude looked up + what it
 * got back. Useful for the first-100-conversations review and for
 * debugging "Claude gave a weird answer."
 */

import { lookupUserRecentActions } from "./lookup-user-recent-actions";
import { lookupApplicationStatus } from "./lookup-application-status";
import { lookupCandidateEmailHistory } from "./lookup-candidate-email-history";
import { lookupJobDetails } from "./lookup-job-details";
import { lookupDsoMembers } from "./lookup-dso-members";
import { lookupSubscriptionStatus } from "./lookup-subscription-status";
import { lookupHelpArticle } from "./lookup-help-article";
import { searchHelpArticles } from "./search-help-articles";
import type { ToolContext, ToolHandler, ToolSchema } from "./types";

const HANDLERS: Record<string, ToolHandler> = {
  lookup_user_recent_actions: lookupUserRecentActions,
  lookup_application_status: lookupApplicationStatus,
  lookup_candidate_email_history: lookupCandidateEmailHistory,
  lookup_job_details: lookupJobDetails,
  lookup_dso_members: lookupDsoMembers,
  lookup_subscription_status: lookupSubscriptionStatus,
  lookup_help_article: lookupHelpArticle,
  search_help_articles: searchHelpArticles,
};

/** All tool schemas — passed to Anthropic so Claude knows what to call. */
export function allToolSchemas(): ToolSchema[] {
  return Object.values(HANDLERS).map((h) => h.schema);
}

/**
 * Execute a tool by name. Returns the JSON-serializable result, or
 * an error envelope if the tool doesn't exist / threw. Never throws —
 * the chat endpoint depends on this being safe.
 */
export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<unknown> {
  const handler = HANDLERS[name];
  if (!handler) {
    return { error: `Unknown tool: ${name}` };
  }
  try {
    return await handler.run(input, ctx);
  } catch (err) {
    console.error(`[tools/dispatch] ${name} threw`, err);
    return {
      error: `Tool ${name} failed unexpectedly. Try a different approach or escalate to a human.`,
    };
  }
}
