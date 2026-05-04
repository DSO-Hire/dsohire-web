/**
 * Shared display-name fallback for candidates whose `full_name` is null/blank.
 *
 * Resolution order:
 *   1. trimmed full_name (if non-empty) → return as-is
 *   2. email-username (part before "@") → "Candidate · jordan.r"
 *   3. first 6 chars of candidate id → "Candidate · 4f9c2a"
 *
 * Pass `email: undefined` (or leave it out) when an email lookup isn't
 * available — for list views like the cross-job inbox where doing a
 * service-role lookup per row would be expensive, we just skip step 2 and
 * fall through to the candidate-id fallback.
 *
 * Step 1 returns the bare name (no prefix). Steps 2 and 3 prefix
 * `"Candidate · "` so the row clearly reads as a placeholder.
 */
export function candidateDisplayName(args: {
  fullName: string | null | undefined;
  email?: string | null;
  candidateId: string;
}): string {
  const trimmed = (args.fullName ?? "").trim();
  if (trimmed) return trimmed;

  const email = (args.email ?? "").trim();
  if (email) {
    const username = email.split("@")[0]?.trim();
    if (username) return `Candidate · ${username}`;
  }

  return `Candidate · ${args.candidateId.slice(0, 6)}`;
}
