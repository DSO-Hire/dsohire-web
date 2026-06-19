"use client";

/**
 * #83 Phase 4 — standalone "Confidential search" card for the job EDIT
 * pages (practice + corporate). Wraps the shared ConfidentialSearchFields
 * in its own form posting to updateJobConfidentiality.
 */

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import {
  ConfidentialSearchFields,
  type TeammateOption,
} from "./confidential-search-fields";
import {
  updateJobConfidentiality,
  type ConfidentialActionState,
} from "@/app/employer/(app)/jobs/confidential-actions";

const INITIAL_STATE: ConfidentialActionState = { ok: false };

export function ConfidentialSearchCard({
  jobId,
  teammates,
  initialConfidential,
  initialAssigneeIds,
}: {
  jobId: string;
  teammates: TeammateOption[];
  initialConfidential: boolean;
  initialAssigneeIds: string[];
}) {
  const [confidential, setConfidential] = useState(initialConfidential);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initialAssigneeIds);
  const [state, formAction, pending] = useActionState(
    updateJobConfidentiality,
    INITIAL_STATE
  );

  const dirty =
    confidential !== initialConfidential ||
    assigneeIds.length !== initialAssigneeIds.length ||
    assigneeIds.some((id) => !initialAssigneeIds.includes(id));

  return (
    <form action={formAction}>
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="confidential_submitted" value="1" />
      {confidential && <input type="hidden" name="confidential" value="on" />}
      {confidential &&
        assigneeIds.map((id) => (
          <input
            key={id}
            type="hidden"
            name="confidential_assignee_ids"
            value={id}
          />
        ))}

      <ConfidentialSearchFields
        teammates={teammates}
        confidential={confidential}
        onConfidentialChange={setConfidential}
        assigneeIds={assigneeIds}
        onAssigneeIdsChange={setAssigneeIds}
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !dirty}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {pending ? (
            "Saving…"
          ) : (
            <>
              <Check className="h-3.5 w-3.5" />
              Save visibility
            </>
          )}
        </button>
        {state.error && (
          <span className="text-[13px] text-danger">{state.error}</span>
        )}
        {state.ok && state.message && !dirty && (
          <span className="text-[13px] text-heritage-deep">{state.message}</span>
        )}
      </div>
    </form>
  );
}
