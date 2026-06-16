/**
 * "Your market" comp lookup (Day 35). Resolves a candidate's role +
 * location to a BLS OEWS wage band from `comp_benchmarks`.
 *
 * Honesty by construction:
 *   • role → SOC mapping is conservative; an unmappable role returns null
 *     (the card simply doesn't render — never a wrong SOC).
 *   • geographic waterfall: state → national, and we surface which level
 *     was actually used so the card can label it.
 *   • returns null when the cell is absent (suppressed / not loaded) — the
 *     dashboard shows nothing rather than a bad number.
 *
 * Data is loaded out-of-band by scripts/load-oews.mjs from the BLS OEWS
 * bulk files (the sandbox can't fetch them; run locally with the service
 * role key). No figures are hand-seeded.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Keyword → SOC code. First match wins; order matters (specific first). */
const SOC_BY_KEYWORD: ReadonlyArray<readonly [RegExp, string]> = [
  [/hygien/i, "29-1292"], // Dental Hygienists
  [/dentist|\bdds\b|\bdmd\b/i, "29-1021"], // Dentists, General
  [/assistant|\brda\b|\bcda\b|\befda\b|\bdanb\b/i, "31-9091"], // Dental Assistants
  [/front|reception|coordinat|billing|biller|secretary|schedul/i, "43-6013"], // Medical Secretaries
  [/manager|administrator|operations|practice lead/i, "11-9111"], // Medical & Health Services Managers
];

// Dentist + manager are salaried/annual in dental; the rest are hourly.
const ANNUAL_SOCS = new Set(["29-1021", "11-9111"]);

export function socForRole(
  roles: string[],
  currentTitle: string | null,
): string | null {
  const candidates = [...roles, currentTitle ?? ""].filter(Boolean);
  for (const c of candidates) {
    for (const [re, soc] of SOC_BY_KEYWORD) {
      if (re.test(c)) return soc;
    }
  }
  return null;
}

export interface MarketRange {
  socCode: string;
  areaName: string;
  areaLevel: "national" | "state" | "metro";
  unit: "hourly" | "annual";
  p25: number;
  p50: number;
  p75: number;
  vintage: string;
  source: string;
}

/**
 * Resolve the best-available wage band for a candidate. Waterfall:
 * state (if known) → national. Returns null when nothing is loaded for
 * the mapped SOC (honest floor).
 */
export async function loadMarketRange(
  supabase: SupabaseClient,
  opts: { roles: string[]; currentTitle: string | null; state: string | null },
): Promise<MarketRange | null> {
  const soc = socForRole(opts.roles, opts.currentTitle);
  if (!soc) return null;
  const unit: MarketRange["unit"] = ANNUAL_SOCS.has(soc) ? "annual" : "hourly";

  const tryKeys: Array<{ level: "state" | "national"; code: string }> = [];
  if (opts.state && opts.state.trim()) {
    tryKeys.push({ level: "state", code: opts.state.trim().toUpperCase() });
  }
  tryKeys.push({ level: "national", code: "US" });

  for (const k of tryKeys) {
    const { data } = await supabase
      .from("comp_benchmarks")
      .select("area_name, area_level, p25, p50, p75, vintage, source")
      .eq("soc_code", soc)
      .eq("area_level", k.level)
      .eq("area_code", k.code)
      .eq("pay_unit", unit)
      .maybeSingle();
    const row = data as Record<string, unknown> | null;
    if (row && row.p25 != null && row.p75 != null) {
      return {
        socCode: soc,
        areaName: (row.area_name as string | null) ?? "United States",
        areaLevel: (row.area_level as MarketRange["areaLevel"]) ?? k.level,
        unit,
        p25: Number(row.p25),
        p50: Number(row.p50),
        p75: Number(row.p75),
        vintage: (row.vintage as string | null) ?? "",
        source: (row.source as string | null) ?? "BLS OEWS",
      };
    }
  }
  return null;
}
