"use client";

/**
 * AssistantContextRegistrar (Lane 8 Assistant 2.0 — Commit 1).
 *
 * Thin client component a server page can mount to register its focused
 * entity for the support assistant. Renders nothing. The underlying hook
 * keys by content, so passing a fresh object each render is fine.
 */

import {
  useRegisterAssistantContext,
  type AssistantContextKind,
} from "@/lib/support/assistant-context";

interface Props {
  kind: AssistantContextKind;
  id: string;
  label: string;
  secondary?: string;
}

export function AssistantContextRegistrar({
  kind,
  id,
  label,
  secondary,
}: Props) {
  useRegisterAssistantContext({ kind, id, label, secondary });
  return null;
}
