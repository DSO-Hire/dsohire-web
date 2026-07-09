"use client";

/**
 * SaveSearchButton — "Save this search · get alerts" CTA on public /jobs.
 *
 * Auth-aware (house rule — see lib/marketing/candidate-cta.ts): the server
 * component resolves whether the viewer is a candidate and passes it down.
 *   • Candidate → clicking calls createSavedSearch with the CURRENT filter
 *     set; success shows an inline confirmation with a manage link.
 *   • Everyone else → routes through /candidate/sign-up?next=<this search
 *     URL + save=1>, so after auth they land back on their exact search and
 *     the save completes automatically (autoSave below).
 *
 * autoSave fires once per mount, then strips ?save=1 from the URL via
 * router.replace so a refresh doesn't re-trigger. createSavedSearch is also
 * idempotent on filter_state, so even a double-fire can't stack duplicates.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { BellPlus, Check, AlertCircle } from "lucide-react";
import { createSavedSearch } from "@/app/candidate/(app)/settings/credentials/actions";
import type { SavedSearchFilters } from "@/lib/jobs/saved-search-filters";

interface SaveSearchButtonProps {
  /** Current /jobs filters, serialized by the server component. */
  filters: SavedSearchFilters;
  /** True when the signed-in viewer has a candidate row. */
  viewerIsCandidate: boolean;
  /** Sign-up URL carrying ?next= back to this exact search (+save=1). */
  signUpHref: string;
  /** True when the URL carries ?save=1 (post-auth return) — save on mount. */
  autoSave: boolean;
}

type SaveState =
  | { phase: "idle" }
  | { phase: "saving" }
  | { phase: "saved"; name: string; existed: boolean }
  | { phase: "error"; message: string };

export function SaveSearchButton({
  filters,
  viewerIsCandidate,
  signUpHref,
  autoSave,
}: SaveSearchButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = React.useState<SaveState>({ phase: "idle" });
  const autoSaveFired = React.useRef(false);

  const runSave = React.useCallback(async () => {
    setState({ phase: "saving" });
    try {
      const result = await createSavedSearch(filters, "daily");
      if (result.ok) {
        setState({ phase: "saved", name: result.name, existed: result.existed });
      } else {
        setState({ phase: "error", message: result.error });
      }
    } catch {
      setState({
        phase: "error",
        message: "Something went wrong — try again.",
      });
    }
  }, [filters]);

  // Post-auth return: complete the save the visitor started, then clean the
  // ?save=1 flag out of the URL so refresh/back don't re-trigger.
  React.useEffect(() => {
    if (!autoSave || !viewerIsCandidate || autoSaveFired.current) return;
    autoSaveFired.current = true;
    void runSave().then(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("save");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }, [autoSave, viewerIsCandidate, runSave, router, pathname, searchParams]);

  if (state.phase === "saved") {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 text-xs font-semibold text-heritage-deep">
        <Check className="h-3.5 w-3.5" />
        {state.existed ? "Search already saved" : "Search saved — alerts on"}
        <Link
          href="/candidate/settings/credentials"
          className="underline underline-offset-2 hover:text-ink"
        >
          Manage alerts
        </Link>
      </span>
    );
  }

  if (!viewerIsCandidate) {
    return (
      <Link
        href={signUpHref}
        className="inline-flex items-center gap-2 border border-[var(--rule-strong)] bg-card px-4 py-2 text-2xs font-semibold text-ink transition-colors hover:border-heritage"
      >
        <BellPlus className="h-3.5 w-3.5 text-heritage" />
        Save this search · get alerts
      </Link>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void runSave()}
        disabled={state.phase === "saving"}
        className="inline-flex items-center gap-2 border border-[var(--rule-strong)] bg-card px-4 py-2 text-2xs font-semibold text-ink transition-colors hover:border-heritage disabled:opacity-60"
      >
        <BellPlus className="h-3.5 w-3.5 text-heritage" />
        {state.phase === "saving" ? "Saving…" : "Save this search · get alerts"}
      </button>
      {state.phase === "error" && (
        <span
          role="alert"
          className="inline-flex items-center gap-1 text-2xs text-danger"
        >
          <AlertCircle className="h-3 w-3" /> {state.message}
        </span>
      )}
    </span>
  );
}
