/**
 * Tool: search_help_articles
 *
 * Semantic search over HELP_CONTENT by reusing the Voyage-powered RAG
 * helper. Returns top-K relevant entries with similarity scores.
 *
 * Use case: the RAG slice in the system prompt was for the initial
 * user question, but the conversation may have pivoted to a different
 * topic. Claude can search the registry for the new topic to ground
 * itself.
 */

import { retrieveRelevantHelp } from "../rag";
import type { ToolHandler } from "./types";

export const searchHelpArticles: ToolHandler = {
  schema: {
    name: "search_help_articles",
    description:
      "Search the help article registry for entries relevant to a query. Returns up to 5 entries with title, tip, and similarity score. Use when the conversation has pivoted to a topic not covered by the initial RAG slice.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural-language search query.",
        },
        limit: {
          type: "integer",
          description: "Max results. Defaults to 5. Max 8.",
          minimum: 1,
          maximum: 8,
        },
      },
      required: ["query"],
    },
  },
  async run(input) {
    const query = String(input.query ?? "").trim();
    if (!query) return { error: "query is required." };
    const limit = Math.min(
      Math.max(1, Number(input.limit ?? 5) | 0),
      8
    );

    const retrieved = await retrieveRelevantHelp(query, limit, 0.25);

    return {
      count: retrieved.length,
      results: retrieved.map((r) => ({
        key: r.key,
        slug: r.key.replace(/\./g, "-"),
        title: r.entry.title,
        tip: r.entry.tip,
        similarity: Math.round(r.similarity * 100) / 100,
        url: `/help/${r.key.replace(/\./g, "-")}`,
      })),
    };
  },
};
