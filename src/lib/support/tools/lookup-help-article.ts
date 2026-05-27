/**
 * Tool: lookup_help_article
 *
 * Returns the full text of one HELP_CONTENT entry by key. The RAG
 * slice already injects 5 entries into the system prompt, but Claude
 * may want a different one based on the conversation flow — this tool
 * lets it pull a specific article on demand.
 *
 * No scope check — registry is public.
 */

import { HELP_CONTENT } from "@/lib/help/help-content";
import type { ToolHandler } from "./types";

export const lookupHelpArticle: ToolHandler = {
  schema: {
    name: "lookup_help_article",
    description:
      "Returns the full content of one help article by its registry key (e.g. 'settings.mfa', 'locations.bulk_import'). Use when you need to give a more detailed answer than the RAG-injected snippet provides.",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description:
            "Registry key — dotted namespace like 'settings.mfa' or 'pipeline.overview'.",
        },
      },
      required: ["key"],
    },
  },
  async run(input) {
    const key = String(input.key ?? "").trim();
    if (!key) return { error: "key is required." };

    const entry = HELP_CONTENT[key];
    if (!entry) {
      return {
        error: `No help article with key "${key}". Use search_help_articles to find the right key first.`,
      };
    }

    return {
      key,
      slug: key.replace(/\./g, "-"),
      title: entry.title,
      tip: entry.tip,
      bullets: entry.bullets ?? [],
      steps: entry.steps ?? [],
      audience: entry.lens,
      url: `/help/${key.replace(/\./g, "-")}`,
    };
  },
};
