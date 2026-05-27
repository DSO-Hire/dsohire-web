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
import { geocodeCityState, geocodeStreetAddress } from "@/lib/geocoding/mapbox";
import { recordAuditEvent } from "@/lib/audit/record";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { normalizeWebsite } from "@/lib/url/normalize-website";

export interface LocationActionState {
  ok: boolean;
  error?: string;
}

export interface DeleteLocationState extends LocationActionState {
  blocked?: { reason: "active_jobs"; jobCount: number };
}

/**
 * Persist a per-location logo URL after the <ImageUpload> primitive
 * finishes its storage write. Owner/admin only — RLS enforces it via
 * the existing dso_locations admin-write policy. Hiring managers and
 * recruiters land on a 4xx if they somehow get here (the page itself
 * already redirects HMs).
 */
export async function setLocationLogoUrl(
  locationId: string,
  url: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (!locationId) {
    return { ok: false, error: "Missing location id." };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const { error } = await supabase
    .from("dso_locations")
    .update({ logo_url: url })
    .eq("id", locationId);

  if (error) {
    console.error("[employer/locations] setLocationLogoUrl failed", error);
    return { ok: false, error: "Couldn't save the practice logo." };
  }

  revalidatePath("/employer/locations");
  revalidatePath(`/employer/locations/${locationId}`);
  return { ok: true };
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
  const websiteRaw = String(formData.get("website") ?? "").trim();

  // Per-location DSO-affiliation toggle (Phase 4.5.b). Hidden input
  // carries "true" or "false" — only present in edit mode. Default
  // null so the update path can distinguish "field not posted"
  // (preserve current value) from "explicitly toggled" (write the new
  // value). On create the field never appears, so the DB default of
  // true takes effect.
  const rawAffiliation = formData.get("public_dso_affiliation");
  const publicDsoAffiliation =
    rawAffiliation === null
      ? null
      : String(rawAffiliation).toLowerCase() === "true";

  return {
    dsoId,
    name,
    addressLine1,
    addressLine2,
    city,
    state,
    postalCode,
    publicDsoAffiliation,
    websiteRaw,
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

  // Normalize website (prepend https:// if missing, validate shape).
  // Returns null on empty input; throws on unparseable non-empty input.
  let website: string | null = null;
  if (fields.websiteRaw) {
    try {
      website = normalizeWebsite(fields.websiteRaw);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Website URL is invalid.",
      };
    }
  }

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
      website,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return {
      ok: false,
      error:
        error?.message ??
        `Failed to add location. Refresh and try again, or email ${SUPPORT_EMAIL}.`,
    };
  }

  // Fire-and-forget geocoding so the map view picks up the location
  // without blocking the form submit. Failures are swallowed.
  //   * Public city-centroid coords → drives candidate-facing /jobs map
  //   * Precise street coords (if address_line1 present) → drives the
  //     employer-facing precise-pin map (Map Phase C, 2026-05-18)
  void geocodeAndStore(inserted.id as string, fields.city, fields.state);
  if (fields.addressLine1) {
    void geocodePreciseAndStore(inserted.id as string, {
      line1: fields.addressLine1,
      city: fields.city,
      state: fields.state,
      postal: fields.postalCode || null,
    });
  }

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

  // Fetch the existing row so we can decide whether to re-geocode +
  // detect an affiliation toggle for audit logging.
  const { data: prior } = await supabase
    .from("dso_locations")
    .select(
      "address_line1, city, state, postal_code, latitude, longitude, precise_latitude, precise_longitude, name, public_dso_affiliation"
    )
    .eq("id", locationId)
    .eq("dso_id", fields.dsoId)
    .maybeSingle();

  // Normalize website (same path as create).
  let website: string | null = null;
  if (fields.websiteRaw) {
    try {
      website = normalizeWebsite(fields.websiteRaw);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Website URL is invalid.",
      };
    }
  }

  // Build the update payload — only include public_dso_affiliation
  // when the form actually posted a value (edit form does, create
  // doesn't). This keeps the create flow on the DB default of true.
  const updatePayload: {
    name: string;
    address_line1: string | null;
    address_line2: string | null;
    city: string;
    state: string;
    postal_code: string | null;
    website: string | null;
    public_dso_affiliation?: boolean;
  } = {
    name: fields.name,
    address_line1: fields.addressLine1 || null,
    address_line2: fields.addressLine2 || null,
    city: fields.city,
    state: fields.state,
    postal_code: fields.postalCode || null,
    website,
  };
  if (fields.publicDsoAffiliation !== null) {
    updatePayload.public_dso_affiliation = fields.publicDsoAffiliation;
  }

  // Add .select("id") so we get the row back and can verify the update
  // landed. RLS-denied UPDATEs return 0 rows with NO error from
  // PostgREST (per feedback_supabase_error_swallowing.md) — without
  // this check we'd ship { ok: true, message: "Saved." } even when
  // the write was silently denied. Caught by Cam 2026-05-08 PM on the
  // affiliation toggle persistence issue.
  const { data: updatedRows, error } = await supabase
    .from("dso_locations")
    .update(updatePayload)
    .eq("id", locationId)
    .eq("dso_id", fields.dsoId)
    .select("id");

  if (error) {
    return {
      ok: false,
      error:
        error.message ??
        `Failed to save location. Refresh and try again, or email ${SUPPORT_EMAIL}.`,
    };
  }
  if (!updatedRows || updatedRows.length === 0) {
    return {
      ok: false,
      error:
        `The save didn't land — refresh and try again. If it keeps happening, email ${SUPPORT_EMAIL}.`,
    };
  }

  // Re-geocode the PUBLIC city-centroid coords if city/state changed,
  // OR if the row has no coords yet (handles backfill recovery —
  // saving a location without changes will trigger a fresh geocode if
  // the prior write hadn't populated coords).
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

  // Re-geocode the PRECISE street coords if any of (line1, city, state,
  // postal) changed, OR if the row has line1 but no precise coords yet
  // (backfill recovery). Skip entirely when there's no street address —
  // employer map will fall back to the public city centroid in that case.
  const priorLine1 =
    (prior?.address_line1 as string | null | undefined) ?? "";
  const priorPostal =
    (prior?.postal_code as string | null | undefined) ?? "";
  const line1Changed = priorLine1 !== fields.addressLine1;
  const postalChanged = priorPostal !== fields.postalCode;
  const missingPreciseCoords =
    (prior?.precise_latitude as number | null | undefined) === null ||
    (prior?.precise_longitude as number | null | undefined) === null;
  if (
    fields.addressLine1 &&
    (line1Changed ||
      cityChanged ||
      stateChanged ||
      postalChanged ||
      missingPreciseCoords)
  ) {
    void geocodePreciseAndStore(locationId, {
      line1: fields.addressLine1,
      city: fields.city,
      state: fields.state,
      postal: fields.postalCode || null,
    });
  }

  // Audit log (Phase 4.5.e) — record only when public_dso_affiliation
  // actually flipped. Generic location field edits aren't audit-worthy
  // at this MVP scope (would create a lot of low-value rows).
  if (
    fields.publicDsoAffiliation !== null &&
    fields.publicDsoAffiliation !== (prior?.public_dso_affiliation as boolean | null)
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const locName = (prior?.name as string | null) ?? fields.name;
      void recordAuditEvent({
        dsoId: fields.dsoId,
        actorUserId: user.id,
        eventKind: "location.affiliation_toggled",
        targetTable: "dso_locations",
        targetId: locationId,
        summary: `Set ${locName} to ${fields.publicDsoAffiliation ? "publicly affiliated" : "private (DSO name hidden)"}`,
        metadata: {
          location_id: locationId,
          location_name: locName,
          public_dso_affiliation: fields.publicDsoAffiliation,
        },
      });
    }
  }

  revalidatePath("/employer/locations");
  revalidatePath(`/employer/locations/${locationId}`);
  // Affiliation flip changes public-facing copy on /jobs and on the
  // /companies/[slug] consumer. Bust both so the toggle takes effect
  // on the next public render. /jobs/[id] caches per-id; we don't
  // know the affected job ids cheaply from here, so the broader
  // /jobs revalidate is the pragmatic catch-all.
  if (fields.publicDsoAffiliation !== null) {
    revalidatePath("/jobs");
    revalidatePath("/companies", "page");
  }
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
        `Failed to delete location. Refresh and try again, or email ${SUPPORT_EMAIL}.`,
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

/**
 * Same pattern as geocodeAndStore, but writes the PRECISE street-address
 * coordinates into the precise_* columns. Used for the employer-facing
 * map view — never rendered to candidate-facing surfaces.
 *
 * Returns silently on any failure; the location row already saved with
 * its public city-centroid coords, so the employer map just falls back
 * to those if precise coords aren't available.
 */
async function geocodePreciseAndStore(
  locationId: string,
  address: {
    line1: string;
    city: string;
    state: string;
    postal: string | null;
  }
): Promise<void> {
  try {
    const result = await geocodeStreetAddress({
      line1: address.line1,
      city: address.city,
      state: address.state,
      postal: address.postal,
    });
    if (!result) return;

    const admin = createSupabaseServiceRoleClient();
    const { error } = await admin
      .from("dso_locations")
      .update({
        precise_latitude: result.lat,
        precise_longitude: result.lng,
        precise_geocoded_at: new Date().toISOString(),
      })
      .eq("id", locationId);

    if (error) {
      console.warn("[locations] precise geocode write failed", error);
      return;
    }

    // No /jobs revalidate here — precise coords never render publicly.
    // Only the employer dashboard / locations surfaces depend on these.
    revalidatePath("/employer/locations");
    revalidatePath(`/employer/locations/${locationId}`);
  } catch (err) {
    console.warn(
      "[locations] geocodePreciseAndStore unexpected error",
      err
    );
  }
}
