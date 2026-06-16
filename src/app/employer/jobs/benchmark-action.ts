"use server";

/**
 * Market pay-benchmark lookup for the job comp step + offer flow.
 *
 * Day 35 — repointed at the richer `comp_benchmarks` (BLS OEWS May 2025):
 * 5 dental SOCs (was 3), national + state + METRO, with full p25–p75 bands.
 * Resolution waterfall: the job's location ZIP → CBSA → metro band
 * (sharpest), else the job's state, else national. The location ZIP is
 * resolved server-side from the location id (no client plumbing of the
 * postal code).
 *
 * INWARD/employer-facing = candid: callers render the band + whether the
 * entered pay sits below/at/above market. Guidance only — never enforcement.
 * (Outward/candidate display follows a different, non-shaming rule — see
 * memory feedback_comp_transparency_display_principle.)
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { socForRole } from "@/lib/comp/market";

const SOC_LABEL: Record<string, string> = {
  "29-1021": "Dentist",
  "29-1292": "Dental Hygienist",
  "31-9091": "Dental Assistant",
  "43-6013": "Front Office / Coordinator",
  "11-9111": "Practice Manager",
};

export interface MarketBenchmark {
  role: string;
  label: string;
  median_hourly: number | null;
  median_annual: number | null;
  mean_hourly: number | null;
  /** p25–p75 bands (the honest "typical range"). */
  p25_hourly: number | null;
  p75_hourly: number | null;
  p25_annual: number | null;
  p75_annual: number | null;
  scope: "metro" | "state" | "national";
  /** Display name of the area actually used (e.g. "Kansas City, MO-KS"). */
  area_name: string;
  state: string | null;
  vintage: string;
  source: string;
}

export async function getMarketBenchmark(
  role: string,
  state: string | null,
  locationId?: string | null,
): Promise<MarketBenchmark | null> {
  const soc = socForRole([role], null);
  if (!soc) return null;

  const supabase = await createSupabaseServerClient();

  const tryKeys: Array<{ level: "metro" | "state" | "national"; code: string }> = [];

  // location → postal_code → CBSA → metro (sharpest). Resolved server-side.
  if (locationId) {
    const { data: loc } = await supabase
      .from("dso_locations")
      .select("postal_code")
      .eq("id", locationId)
      .maybeSingle();
    const zip = (loc as { postal_code: string | null } | null)?.postal_code
      ?.replace(/\D/g, "")
      .slice(0, 5);
    if (zip && zip.length === 5) {
      const { data: zc } = await supabase
        .from("zip_cbsa")
        .select("cbsa")
        .eq("zip", zip)
        .maybeSingle();
      const cbsa = (zc as { cbsa: string } | null)?.cbsa ?? null;
      if (cbsa) tryKeys.push({ level: "metro", code: cbsa });
    }
  }
  const st = state?.trim().toUpperCase() || null;
  if (st) tryKeys.push({ level: "state", code: st });
  tryKeys.push({ level: "national", code: "US" });

  for (const k of tryKeys) {
    const { data } = await supabase
      .from("comp_benchmarks")
      .select("area_name, pay_unit, p25, p50, p75, vintage, source")
      .eq("soc_code", soc)
      .eq("area_level", k.level)
      .eq("area_code", k.code);
    const rows = (data ?? []) as Array<{
      area_name: string;
      pay_unit: string;
      p25: number | null;
      p50: number | null;
      p75: number | null;
      vintage: string;
      source: string;
    }>;
    if (rows.length === 0) continue;
    const h = rows.find((r) => r.pay_unit === "hourly") ?? null;
    const an = rows.find((r) => r.pay_unit === "annual") ?? null;
    const ref = h ?? an;
    if (!ref) continue;
    return {
      role,
      label: SOC_LABEL[soc] ?? role,
      median_hourly: h?.p50 ?? (an?.p50 != null ? an.p50 / 2080 : null),
      median_annual: an?.p50 ?? (h?.p50 != null ? h.p50 * 2080 : null),
      mean_hourly: null,
      p25_hourly: h?.p25 ?? null,
      p75_hourly: h?.p75 ?? null,
      p25_annual: an?.p25 ?? null,
      p75_annual: an?.p75 ?? null,
      scope: k.level,
      area_name: ref.area_name,
      state: k.level === "state" ? st : null,
      vintage: ref.vintage,
      source: ref.source,
    };
  }
  return null;
}
