/**
 * Soft-knockout evaluator (E2.10, 2026-05-13).
 *
 * Pure functions that decide whether a candidate's answer FAILS a
 * knockout question. Lives outside server-action code so we can unit-test
 * + reuse in both the apply submit path (compute on insert) and any
 * future re-evaluation tools (e.g. a "re-score knockouts" admin button).
 *
 * Per the locked spec (project_knockout_pattern_research_2026_05_13.md):
 *   - We never auto-reject — failures get tagged, not gated.
 *   - 5 question kinds support knockout; short_text + long_text don't
 *     because evaluating free text is too ambiguous.
 *   - knockout_correct_answer shape varies by kind (see types below).
 */

export type KnockoutQuestionKind =
  | "yes_no"
  | "single_select"
  | "multi_select"
  | "number";

export type KnockoutCorrectAnswer =
  | { kind: "yes_no"; expected: "yes" | "no" }
  | { kind: "single_select"; expected_option_ids: string[] }
  | { kind: "multi_select"; must_include_option_ids: string[] }
  | {
      kind: "number";
      operator: ">=" | "<=" | "=";
      value: number;
    };

/**
 * Evaluate a single knockout question against the candidate's answer.
 * Returns true when the candidate FAILED the knockout (i.e. their answer
 * doesn't match the correct-answer policy). Returns false when they passed
 * OR when we can't evaluate confidently (we treat ambiguity as a pass —
 * "give the candidate the benefit of the doubt" matches our candidate-
 * friendly posture).
 */
export function isKnockoutFailure(
  correctAnswer: unknown,
  candidateAnswer: unknown,
  questionKind: string
): boolean {
  // Defensive: no correct-answer payload means we can't evaluate. Pass.
  if (!correctAnswer || typeof correctAnswer !== "object") return false;

  // Short/long text don't support knockout per spec.
  if (questionKind !== "yes_no" && questionKind !== "single_select" &&
      questionKind !== "multi_select" && questionKind !== "number") {
    return false;
  }

  const ca = correctAnswer as Record<string, unknown>;

  switch (questionKind) {
    case "yes_no": {
      // Expected is "yes" or "no"; candidate answer is the same.
      const expected = String(ca.expected ?? "").toLowerCase();
      if (expected !== "yes" && expected !== "no") return false; // mis-config → pass
      const answer = String(candidateAnswer ?? "").toLowerCase();
      if (answer !== "yes" && answer !== "no") return true; // blank/garbage = fail
      return answer !== expected;
    }

    case "single_select": {
      // Expected is an array of option IDs; any match = pass.
      const expectedIds = Array.isArray(ca.expected_option_ids)
        ? (ca.expected_option_ids as unknown[]).map((x) => String(x))
        : [];
      if (expectedIds.length === 0) return false; // no expected = pass
      const answer = String(candidateAnswer ?? "");
      if (!answer) return true; // blank = fail
      return !expectedIds.includes(answer);
    }

    case "multi_select": {
      // must_include_option_ids: candidate must have ALL of these selected.
      const required = Array.isArray(ca.must_include_option_ids)
        ? (ca.must_include_option_ids as unknown[]).map((x) => String(x))
        : [];
      if (required.length === 0) return false;
      const selected = Array.isArray(candidateAnswer)
        ? (candidateAnswer as unknown[]).map((x) => String(x))
        : [];
      // Fail if any required option isn't in the candidate's selection.
      return required.some((req) => !selected.includes(req));
    }

    case "number": {
      const op = ca.operator;
      const target = ca.value;
      if (
        (op !== ">=" && op !== "<=" && op !== "=") ||
        typeof target !== "number"
      ) {
        return false; // mis-config = pass
      }
      // Candidate answer comes through as string from form; coerce.
      const candNum = Number(candidateAnswer);
      if (Number.isNaN(candNum)) return true; // blank/garbage = fail
      if (op === ">=") return candNum < target;
      if (op === "<=") return candNum > target;
      return candNum !== target;
    }
  }

  return false;
}

/**
 * Helper: should the wizard's knockout-correct-answer sub-form even render
 * for a given question kind? short_text/long_text aren't supported.
 */
export function kindSupportsKnockout(kind: string): boolean {
  return (
    kind === "yes_no" ||
    kind === "single_select" ||
    kind === "multi_select" ||
    kind === "number"
  );
}
