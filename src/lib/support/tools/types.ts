/**
 * Tool-use types for the Tier 2 support chat endpoint.
 *
 * Each tool implements ToolHandler — given a parsed input and the
 * caller's auth + DSO context, returns a JSON-serializable result that
 * Claude will see in a tool_result block.
 *
 * Hard rule: tools that touch DSO data MUST verify ownership before
 * returning anything. The dispatcher passes the caller's auth_user_id
 * + dso_id; each tool re-checks scope at the query layer (via
 * createSupabaseServerClient + RLS, OR explicit dso_id filter when
 * using service-role).
 *
 * Tools should NEVER throw — return {error: "..."} so Claude can
 * gracefully tell the user. Unhandled exceptions crash the chat
 * endpoint mid-stream.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type ServerClient = SupabaseClient<Database>;

export interface ToolContext {
  /** auth.users.id of the user asking the support question. */
  authUserId: string;
  /** Their DSO membership row id, or null (candidate / pre-onboarding). */
  dsoUserId: string | null;
  /** Their DSO id, or null. */
  dsoId: string | null;
  /** Their role, or null. */
  role: string | null;
  /** RLS-scoped Supabase client (server-side auth). */
  supabase: ServerClient;
  /** Service-role client for cross-RLS lookups we explicitly need. */
  admin: ServerClient;
}

export interface ToolSchema {
  name: string;
  description: string;
  /** JSON Schema for the tool input. Sent to Anthropic so Claude knows
   *  what to pass. */
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolHandler {
  schema: ToolSchema;
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<unknown>;
}
