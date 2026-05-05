"use client";

/**
 * DeleteLocationButton — confirms destructive intent before submitting the
 * deleteLocation server action. Uses a transient confirm step rather than
 * a modal to keep the surface dependency-free.
 */

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteLocation, type DeleteLocationState } from "../actions";

const initialState: DeleteLocationState = { ok: false };

interface DeleteLocationButtonProps {
  dsoId: string;
  locationId: string;
  locationName: string;
  liveJobCount: number;
}

export function DeleteLocationButton({
  dsoId,
  locationId,
  locationName,
  liveJobCount,
}: DeleteLocationButtonProps) {
  const [state, action, pending] = useActionState(deleteLocation, initialState);
  const [confirming, setConfirming] = useState(false);

  if (liveJobCount > 0) {
    return (
      <div className="border border-[var(--rule-strong)] bg-cream/60 p-5">
        <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
          Delete location
        </div>
        <p className="text-[14px] text-slate-body leading-relaxed mb-3">
          This location is currently tagged on{" "}
          <span className="font-semibold text-ink">
            {liveJobCount} {liveJobCount === 1 ? "job" : "jobs"}
          </span>
          . Edit those job postings to remove this location first, or set them
          to filled / expired, then come back here.
        </p>
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-2 px-5 py-2.5 border border-[var(--rule-strong)] text-slate-meta text-[12px] font-bold tracking-[2px] uppercase cursor-not-allowed"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete Location
        </button>
      </div>
    );
  }

  return (
    <div className="border border-[var(--rule-strong)] bg-cream/60 p-5">
      <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
        Delete location
      </div>

      {!confirming ? (
        <>
          <p className="text-[14px] text-slate-body leading-relaxed mb-3">
            Permanently remove this location from your DSO. Job postings can no
            longer reference it.
          </p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-red-300 text-red-700 text-[12px] font-bold tracking-[2px] uppercase hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Location
          </button>
        </>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="dso_id" value={dsoId} />
          <input type="hidden" name="location_id" value={locationId} />
          <p className="text-[14px] text-ink leading-relaxed">
            Delete <span className="font-semibold">{locationName}</span>? This
            cannot be undone.
          </p>
          {state.error && (
            <p className="text-[13px] text-red-700">{state.error}</p>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-[12px] font-bold tracking-[2px] uppercase hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {pending ? "Deleting…" : "Yes, Delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[2px] uppercase hover:bg-cream transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
