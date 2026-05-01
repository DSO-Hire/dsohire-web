"use server";

/**
 * /employer/locations server actions.
 *
 * RLS guarantees that owner/admin DSO users can only insert/update/delete
 * dso_locations rows for their own DSO, so all of these run as the signed-in
 * user (no service-role needed).
 *
 * Delete is intentionally protected: we block delete if any non-deleted job
 * still tags this location, because cascading the join would silently drop
 * those associations and leave a job with zero locations. Caller must update
 * those jobs first (or set them to filled/expired).
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { geocodeCityState } from "@/lib/geocoding/mapbox";

export interface LocationActionState {
  ok: boolean;
  error?: string;
}

export interface DeleteLocationState extends LocationActionState {
  blocked?: { reason: "active_jobs"; jobCount: number };
}

/* ───────────────────────────────────────────────────────────────
 * Shared validation
 * ───────────────────────────────────────────────────────────── */

function parseFormFields(formData: FormData) {
  const dsoId = String(formData.get("dso_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const addressLine1 = String(formData.get("address_line1") ?? "").trim();
  const addressLine2 = String(formData.get("address_line2") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "")
    .trim()
    .toUpperCase();
  const postalCode = String(formData.get("postal_code") ?? "").trim();

  return {
    dsoId,
    name,
    addressLine1,
    addressLine2,
    city,
    state,
    postalCode,
  };
}

function validate(fields: ReturnType<typeof parseFormFields>): string | null {
  if (!fields.dsoId) {
    return "Missing DSO context. Refresh and try again.";
  }
  if (!fields.name) {
    return "Please enter a name for this location.";
  }
  if (!fields.city) {
    return "Please enter the city.";
  }
  if (!fields.state || fields.state.length !== 2) {
    return "Please enter a 2-letter US state code (e.g., KS).";
  }
  return null;
}

/* ───────────────────────────────────────────────────────────────
 * Create
 * ───────────────────────────────────────────────────────────── */

export async function createLocation(
  _prev: LocationActionState,
  formData: FormData
): Promise<LocationActionState> {
  const fields = parseFormFields(formData);
  const validationError = validate(fields);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createSupabaseServerClient();

  const { data: inserted, error } = await supabase
    .from("dso_locations")
    .insert({
      dso_id: fields.dsoId,
      name: fields.name,
      address_line1: fields.addressLine1 || null,
      address_line2: fields.addressLine2 || null,
      city: fields.city,
      state: fields.state,
      postal_code: fields.postalCode || null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return {
      ok: false,
      error:
        error?.message ??
        "Failed to add location. Refresh and try again, or email cam@dsohire.com.",
    };
  }

  // Fire-and-forget city+state geocoding so the map view picks up the
  // location without blocking the form submit. Failures are swallowed.
  void geocodeAndStore(inserted.id as string, fields.city, fields.state);

  revalidatePath("/employer/locations");
  revalidatePath("/employer/dashboard");
  redirect("/employer/locations");
}

/* ───────────────────────────────────────────────────────────────
 * Update
 * ───────────────────────────────────────────────────────────── */

export async function updateLocation(
  _prev: LocationActionState,
  formData: FormData
): Promise<LocationActionState> {
  const locationId = String(formData.get("location_id") ?? "").trim();
  if (!locationId) {
    return { ok: false, error: "Missing location id. Refresh and try again." };
  }

  const fields = parseFormFields(formData);
  const validationError = validate(fields);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createSupabaseServerClient();

  // Fetch the existing row so we can decide whether to re-geocode. Skip
  // the round-trip if city/state didn't change AND coords are already set.
  const { data: prior } = await supabase
    .from("dso_locations")
    .select("city, state, latitude, longitude")
    .eq("id", locationId)
    .eq("dso_id", fields.dsoId)
    .maybeSingle();

  const { error } = await supabase
    .from("dso_locations")
    .update({
      name: fields.name,
      address_line1: fields.addressLine1 || null,
      address_line2: fields.addressLine2 || null,
      city: fields.city,
      state: fields.state,
      postal_code: fields.postalCode || null,
    })
    .eq("id", locationId)
    .eq("dso_id", fields.dsoId);

  if (error) {
    return {
      ok: false,
      error:
        error.message ??
        "Failed to save location. Refresh and try again, or email cam@dsohire.com.",
    };
  }

  // Re-geocode if city/state changed, OR if the row has no coords yet
  // (handles backfill recovery — saving a location without changes will
  // trigger a fresh geocode if the prior write hadn't populated coords).
  const cityChanged =
    (prior?.city as string | null | undefined) !== fields.city;
  const stateChanged =
    (prior?.state as string | null | undefined) !== fields.state;
  const missingCoords =
    (prior?.latitude as number | null | undefined) === null ||
    (prior?.longitude as number | null | undefined) === null;
  if (cityChanged || stateChanged || missingCoords) {
    void geocodeAndStore(locationId, fields.city, fields.state);
  }

  revalidatePath("/employer/locations");
  revalidatePath(`/employer/locations/${locationId}`);
  return { ok: true };
}

/* ───────────────────────────────────────────────────────────────
 * Delete (with active-job safety check)
 * ───────────────────────────────────────────────────────────── */

export async function deleteLocation(
  _prev: DeleteLocationState,
  formData: FormData
): Promise<DeleteLocationState> {
  const locationId = String(formData.get("location_id") ?? "").trim();
  const dsoId = String(formData.get("dso_id") ?? "").trim();

  if (!locationId || !dsoId) {
    return {
      ok: false,
      error: "Missing location context. Refresh and try again.",
    };
  }

  const supabase = await createSupabaseServerClient();

  // Block delete if any non-deleted job still references this location.
  // job_locations has ON DELETE CASCADE on location_id, so without this guard
  // we'd silently strip the association and leave the job orphaned.
  const { data: blockingJobs, error: countError } = await supabase
    .from("job_locations")
    .select("job_id, jobs:jobs!inner(id, status, deleted_at)")
    .eq("location_id", locationId);

  if (countError) {
    return {
      ok: false,
      error: countError.message ?? "Couldn't verify location safety. Try again.",
    };
  }

  const liveJobCount = (
    (blockingJobs ?? []) as unknown as Array<{
      jobs: { id: string; status: string; deleted_at: string | null } | null;
    }>
  ).filter((row) => row.jobs && row.jobs.deleted_at === null).length;

  if (liveJobCount > 0) {
    return {
      ok: false,
      error: `This location is still tagged on ${liveJobCount} job ${liveJobCount === 1 ? "posting" : "postings"}. Edit those jobs to remove this location first, or set them to filled / expired.`,
      blocked: { reason: "active_jobs", jobCount: liveJobCount },
    };
  }

  const { error: deleteError } = await supabase
    .from("dso_locations")
    .delete()
    .eq("id", locationId)
    .eq("dso_id", dsoId);

  if (deleteError) {
    return {
      ok: false,
      error:
        deleteError.message ??
        "Failed to delete location. Refresh and try again, or email cam@dsohire.com.",
    };
  }

  revalidatePath("/employer/locations");
  revalidatePath("/employer/dashboard");
  redirect("/employer/locations");
}

/* ───────────────────────────────────────────────────────────────
 * Geocoding side effect
 *
 * Uses the service-role client because RLS on dso_locations only allows
 * owner/admin DSO members to write — the fire-and-forget runs after the
 * action returns, so auth context isn't reliably preserved. Service-role
 * is fine because we're scoped to a single row by id.
 *
 * Privacy: only city + state get sent to Mapbox, never the street address.
 * ───────────────────────────────────────────────────────────── */

async function geocodeAndStore(
  locationId: string,
  city: string,
  state: string
): Promise<void> {
  try {
    const result = await geocodeCityState(city, state);
    if (!result) return;

    const admin = createSupabaseServiceRoleClient();
    const { error } = await admin
      .from("dso_locations")
      .update({
        latitude: result.lat,
        longitude: result.lng,
        geocoded_at: new Date().toISOString(),
      })
      .eq("id", locationId);

    if (error) {
      console.warn("[locations] geocode write failed", error);
      return;
    }

    revalidatePath("/jobs");
  } catch (err) {
    console.warn("[locations] geocodeAndStore unexpected error", err);
  }
}
