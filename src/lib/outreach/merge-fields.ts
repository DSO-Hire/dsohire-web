/**
 * Merge-field resolution for outreach templates (Phase 5D Day 2).
 *
 * Tokens are replaced server-side in the send path before the email
 * reaches Resend. Conservative on what's supported — only the five
 * fields documented in the schema migration. Unknown tokens stay
 * literal (better than silently producing empty strings).
 */

export interface MergeContext {
  candidate: {
    full_name: string | null;
  };
  sender: {
    full_name: string | null;
  };
  dso: {
    name: string | null;
  };
}

const TOKEN_PATTERN = /\{\{\s*([a-z_.]+)\s*\}\}/gi;

function firstName(full: string | null): string {
  if (!full) return "";
  return full.trim().split(/\s+/)[0] ?? "";
}

export function resolveMergeFields(
  text: string,
  ctx: MergeContext
): string {
  return text.replace(TOKEN_PATTERN, (match, raw) => {
    const key = String(raw).toLowerCase();
    switch (key) {
      case "candidate.first_name":
        return firstName(ctx.candidate.full_name) || match;
      case "candidate.full_name":
        return ctx.candidate.full_name || match;
      case "sender.first_name":
        return firstName(ctx.sender.full_name) || match;
      case "sender.name":
      case "sender.full_name":
        return ctx.sender.full_name || match;
      case "dso.name":
        return ctx.dso.name || match;
      default:
        return match;
    }
  });
}

export const SUPPORTED_MERGE_FIELDS = [
  {
    token: "{{candidate.first_name}}",
    label: "Candidate first name",
    example: "Jordan",
  },
  {
    token: "{{candidate.full_name}}",
    label: "Candidate full name",
    example: "Jordan Bailey",
  },
  {
    token: "{{sender.first_name}}",
    label: "Your first name",
    example: "Cameron",
  },
  {
    token: "{{sender.name}}",
    label: "Your full name",
    example: "Cameron Eslinger",
  },
  {
    token: "{{dso.name}}",
    label: "DSO name",
    example: "Lakeshore Dental Group",
  },
] as const;
