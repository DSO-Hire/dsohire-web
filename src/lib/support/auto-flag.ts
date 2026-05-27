/**
 * Auto-flag heuristic for Tier 2 chat conversations.
 *
 * Scans Claude's final response for uncertainty / refusal patterns
 * that suggest the conversation should land in Cam's review queue.
 * Also flags conversations where a tool returned an error envelope.
 *
 * Returns a human-readable reason string when flagged, null otherwise.
 * Caller writes it to support_requests.auto_flag_reason AND sets
 * review_status='flagged_bad'.
 *
 * Heuristic is intentionally simple — the goal is high-recall (catch
 * most bad answers, occasionally over-flag) not high-precision. Cam
 * spends 5 sec rejecting a false-positive flag; missing a true bad
 * answer costs much more.
 */

interface AutoFlagInput {
  assistantText: string;
  toolErrors: number;
}

const UNCERTAINTY_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /i don'?t (have|know|see)/i, label: "Claude expressed uncertainty" },
  { pattern: /i'm not (sure|certain|confident)/i, label: "Claude expressed uncertainty" },
  { pattern: /i can'?t (help|find|tell|see|access)/i, label: "Claude said it couldn't help" },
  { pattern: /(want|would you like) me to (pass|escalate|hand)/i, label: "Claude offered escalation" },
  { pattern: /pass this (to|onto) (the )?(team|human|cam)/i, label: "Claude offered escalation" },
  { pattern: /i don'?t have access/i, label: "Claude said it lacked access" },
  { pattern: /i don'?t have visibility/i, label: "Claude said it lacked visibility" },
  { pattern: /that lives (outside|on) (your|the platform)/i, label: "Claude deflected to the user" },
];

export function autoFlagReason(input: AutoFlagInput): string | null {
  const reasons: string[] = [];

  if (input.toolErrors > 0) {
    reasons.push(
      `${input.toolErrors} tool call${input.toolErrors === 1 ? "" : "s"} returned an error`
    );
  }

  const matched = new Set<string>();
  for (const { pattern, label } of UNCERTAINTY_PATTERNS) {
    if (pattern.test(input.assistantText)) {
      matched.add(label);
    }
  }
  for (const m of matched) reasons.push(m);

  if (reasons.length === 0) return null;
  return reasons.join("; ");
}

/**
 * Env-controlled "first 100 conversations" mode. When ON, every chat
 * starts in 'unreviewed' status so they all surface in the admin
 * queue — Cam can confirm the system is behaving across a wide range
 * of real questions before relaxing.
 *
 * Default: ON. Flip SUPPORT_REVIEW_ALL_CONVERSATIONS=false in Vercel
 * env vars after ~100 reviewed conversations have shown clean patterns.
 */
export function isFirstHundredMode(): boolean {
  const v = process.env.SUPPORT_REVIEW_ALL_CONVERSATIONS;
  // Default ON if the env var isn't set — safer launch posture.
  if (v === undefined || v === null || v === "") return true;
  return v.toLowerCase() !== "false";
}
