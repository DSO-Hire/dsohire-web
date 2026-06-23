/**
 * Masking-aware merge handling for prospect outbound (Sourcing CRM Phase 2).
 *
 * resolveMergeFields leaves unknown/empty tokens LITERAL (returns the raw
 * `{{token}}`), so simply nulling a masked candidate's name would leave an ugly
 * literal token in the message. For masked candidates we instead replace the
 * candidate-name tokens with a neutral greeting BEFORE merge — so the DSO-visible
 * body never contains the real name and never a stray token.
 */

const CANDIDATE_NAME_TOKENS = /\{\{\s*candidate\.(first_name|full_name)\s*\}\}/gi;

export function stripCandidateNameTokens(
  text: string,
  replacement = "there",
): string {
  return text.replace(CANDIDATE_NAME_TOKENS, replacement);
}
