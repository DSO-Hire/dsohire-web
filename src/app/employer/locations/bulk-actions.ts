"use server";

/**
 * /employer/locations bulk-import server action.
 *
 * Accepts an uploaded CSV or XLSX file, parses it, validates per row,
 * inserts rows that pass, and returns a per-row {succeeded, failed}
 * report so the UI can show "12 of 15 added, 3 had errors" with the
 * specific errors. Owner/admin only (RLS enforces dso_locations writes,
 * we also gate at the action edge for early-fail UX).
 *
 * Sequential inserts (not a single bulk INSERT) so RLS-denied rows
 * surface as proper failures — PostgREST silently returns zero rows on
 * RLS denial, which would invisibly drop rows in a bulk insert. Same
 * rationale as src/app/employer/jobs/[id]/applications/bulk-actions.ts.
 *
 * Geocoding is fire-and-forget per successful row, batched in parallel
 * with a small concurrency cap so we don't melt the Mapbox token on a
 * thousand-location import.
 *
 * Parsing happens server-side (papaparse for CSV, xlsx for Excel) so
 * the client bundle stays small and so we can apply server-controlled
 * validation before any DB writes.
 */

import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { geocodeCityState, geocodeStreetAddress } from "@/lib/geocoding/mapbox";
import { recordAuditEvent } from "@/lib/audit/record";

const MAX_ROWS = 1000;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const GEOCODE_CONCURRENCY = 6;

/**
 * Canonical column names we recognize in the upload header row. Aliases
 * make us tolerant of common variants (e.g. "zip" → postal_code) so a
 * recruiter pasting from a generic export doesn't have to manually
 * rename columns.
 */
const COLUMN_ALIASES: Record<string, string> = {
  // canonical
  name: "name",
  address_line1: "address_line1",
  address_line2: "address_line2",
  city: "city",
  state: "state",
  postal_code: "postal_code",
  // aliases
  "location name": "name",
  "practice name": "name",
  "street address": "address_line1",
  street: "address_line1",
  address: "address_line1",
  address1: "address_line1",
  "address 1": "address_line1",
  address2: "address_line2",
  "address 2": "address_line2",
  suite: "address_line2",
  unit: "address_line2",
  zip: "postal_code",
  zipcode: "postal_code",
  "zip code": "postal_code",
  postal: "postal_code",
};

interface ParsedRow {
  /** 1-indexed row number in the source file (excluding header). */
  rowNumber: number;
  name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
}

export interface BulkRowFailure {
  rowNumber: number;
  name: string;
  error: string;
}

export type BulkAddLocationsResult =
  | {
      ok: true;
      succeededCount: number;
      failed: BulkRowFailure[];
      totalRows: number;
    }
  | { ok: false; error: string };

/**
 * Normalize a header cell: lowercase, trim, collapse whitespace,
 * strip underscores → spaces (or vice versa). Returns the canonical
 * column name or null if unrecognized.
 */
function canonicalizeHeader(raw: string): string | null {
  const k = raw.toLowerCase().trim().replace(/_/g, " ").replace(/\s+/g, " ");
  if (COLUMN_ALIASES[k]) return COLUMN_ALIASES[k];
  // Also try with underscores (canonical form already has them).
  const u = k.replace(/ /g, "_");
  if (COLUMN_ALIASES[u]) return COLUMN_ALIASES[u];
  return null;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => canonicalizeHeader(h) ?? h.trim(),
    dynamicTyping: false,
  });
  return result.data;
}

function parseXlsx(buffer: ArrayBuffer): Array<Record<string, string>> {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  return rows.map((row) => {
    const normalized: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      const canon = canonicalizeHeader(k);
      if (!canon) continue;
      normalized[canon] = String(v ?? "").trim();
    }
    return normalized;
  });
}

function validateRow(
  raw: Record<string, string>,
  rowNumber: number
): { ok: true; row: ParsedRow } | { ok: false; failure: BulkRowFailure } {
  const name = (raw.name ?? "").toString().trim();
  const address_line1 = (raw.address_line1 ?? "").toString().trim();
  const address_line2 = (raw.address_line2 ?? "").toString().trim();
  const city = (raw.city ?? "").toString().trim();
  const state = (raw.state ?? "").toString().trim().toUpperCase();
  const postal_code = (raw.postal_code ?? "").toString().trim();

  const fail = (error: string): { ok: false; failure: BulkRowFailure } => ({
    ok: false,
    failure: { rowNumber, name: name || "(no name)", error },
  });

  if (!name) return fail("Missing name.");
  if (name.length > 200) return fail("Name too long (max 200 chars).");
  if (!city) return fail("Missing city.");
  if (!state) return fail("Missing state.");
  if (!/^[A-Z]{2}$/.test(state)) {
    return fail(
      `State must be a 2-letter US code (got "${state}"). Example: KS.`
    );
  }

  return {
    ok: true,
    row: {
      rowNumber,
      name,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
    },
  };
}

export async function bulkAddLocations(
  formData: FormData
): Promise<BulkAddLocationsResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return { ok: false, error: "No DSO membership found." };

  const role = (dsoUser as { role: string }).role;
  if (role !== "owner" && role !== "admin") {
    return {
      ok: false,
      error: "Only owners and admins can bulk-add locations.",
    };
  }
  const dsoId = (dsoUser as { dso_id: string }).dso_id;

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file uploaded." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB). Split into smaller batches and re-upload.`,
    };
  }

  // Parse based on filename suffix. Server-side parsing keeps the
  // client bundle small and lets us apply the same validation regardless
  // of source format.
  const filename = file.name.toLowerCase();
  let rawRows: Array<Record<string, string>>;
  try {
    if (filename.endsWith(".csv")) {
      const text = await file.text();
      rawRows = parseCsv(text);
    } else if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
      const buffer = await file.arrayBuffer();
      rawRows = parseXlsx(buffer);
    } else {
      return {
        ok: false,
        error: "Unsupported file type. Upload a .csv, .xlsx, or .xls file.",
      };
    }
  } catch (err) {
    console.error("[bulkAddLocations] parse failed", err);
    return {
      ok: false,
      error: "Couldn't parse the file. Check the format and try again.",
    };
  }

  if (rawRows.length === 0) {
    return {
      ok: false,
      error:
        "No data rows found. Make sure the first row contains column headers (name, city, state, …) and there's at least one data row below it.",
    };
  }
  if (rawRows.length > MAX_ROWS) {
    return {
      ok: false,
      error: `Too many rows (${rawRows.length}). Split into batches of ${MAX_ROWS} or fewer.`,
    };
  }

  // Validate every row up front so we can report errors before touching
  // the DB. The validated set is what we attempt to insert.
  const valid: ParsedRow[] = [];
  const failed: BulkRowFailure[] = [];
  rawRows.forEach((raw, idx) => {
    const result = validateRow(raw, idx + 2); // +2: 1-indexed + header row
    if (result.ok) valid.push(result.row);
    else failed.push(result.failure);
  });

  // Sequential inserts so RLS-denied rows surface as real failures.
  let succeededCount = 0;
  const succeededIds: string[] = [];
  for (const row of valid) {
    const { data, error } = await supabase
      .from("dso_locations")
      .insert({
        dso_id: dsoId,
        name: row.name,
        address_line1: row.address_line1 || null,
        address_line2: row.address_line2 || null,
        city: row.city,
        state: row.state,
        postal_code: row.postal_code || null,
      })
      .select("id")
      .single();

    if (error || !data) {
      failed.push({
        rowNumber: row.rowNumber,
        name: row.name,
        error: error?.message ?? "Insert denied — refresh and try again.",
      });
      continue;
    }
    succeededCount++;
    succeededIds.push(data.id as string);

    // Geocoding fires below in a parallel-with-concurrency-cap loop.
    // Don't await here — keeps the action latency proportional to row
    // count, not row count × Mapbox latency.
  }

  // Geocode in the background after the insert loop. Won't block the
  // action return; just kicks off the requests. Concurrency cap prevents
  // melting the Mapbox token on a thousand-row import.
  if (succeededIds.length > 0) {
    void backgroundGeocode(
      succeededIds.map((id, i) => ({
        id,
        city: valid[i]?.city ?? "",
        state: valid[i]?.state ?? "",
        line1: valid[i]?.address_line1 ?? "",
        postal: valid[i]?.postal_code || null,
      }))
    );
  }

  // Audit (one row for the batch, not per inserted location).
  if (succeededCount > 0) {
    void recordAuditEvent({
      dsoId,
      actorUserId: user.id,
      eventKind: "location.bulk_imported",
      targetTable: "dsos",
      targetId: dsoId,
      summary:
        failed.length > 0
          ? `Bulk-imported ${succeededCount} locations (${failed.length} skipped)`
          : `Bulk-imported ${succeededCount} locations`,
      metadata: {
        succeeded_count: succeededCount,
        failed_count: failed.length,
        total_rows: rawRows.length,
        file_name: file.name,
      },
    });
    revalidatePath("/employer/locations");
    revalidatePath("/employer/dashboard");
  }

  return {
    ok: true,
    succeededCount,
    failed,
    totalRows: rawRows.length,
  };
}

/**
 * Concurrency-capped background geocode loop. Uses service-role since
 * the parent action has already returned and auth context isn't
 * preserved. Each row is scoped to its own id, mirroring the
 * single-create geocodeAndStore() pattern.
 */
async function backgroundGeocode(
  jobs: Array<{
    id: string;
    city: string;
    state: string;
    line1: string;
    postal: string | null;
  }>
): Promise<void> {
  const admin = createSupabaseServiceRoleClient();

  async function processOne(job: typeof jobs[number]) {
    try {
      // Public city-centroid coords (used by /jobs map).
      const pub = await geocodeCityState(job.city, job.state);
      if (pub) {
        await admin
          .from("dso_locations")
          .update({
            latitude: pub.lat,
            longitude: pub.lng,
            geocoded_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      }
      // Precise street coords (employer-only map).
      if (job.line1) {
        const precise = await geocodeStreetAddress({
          line1: job.line1,
          city: job.city,
          state: job.state,
          postal: job.postal,
        });
        if (precise) {
          await admin
            .from("dso_locations")
            .update({
              precise_latitude: precise.lat,
              precise_longitude: precise.lng,
              precise_geocoded_at: new Date().toISOString(),
            })
            .eq("id", job.id);
        }
      }
    } catch (err) {
      console.warn("[bulkAddLocations] geocode failed", { id: job.id, err });
    }
  }

  // Simple concurrency pool — N workers pulling from a shared index.
  let cursor = 0;
  const workers: Promise<void>[] = [];
  const next = async () => {
    while (cursor < jobs.length) {
      const myIdx = cursor++;
      const job = jobs[myIdx];
      if (!job) break;
      await processOne(job);
    }
  };
  for (let i = 0; i < Math.min(GEOCODE_CONCURRENCY, jobs.length); i++) {
    workers.push(next());
  }
  await Promise.all(workers);
}
