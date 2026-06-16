/**
 * load-oews.mjs — populate `comp_benchmarks` from BLS OEWS bulk files.
 *
 * WHY THIS IS A LOCAL SCRIPT: the OEWS bulk XLSX files (national + state)
 * can't be fetched from our build sandbox, so this runs on your machine,
 * where you can download them. It only writes verified BLS figures — no
 * hand-seeded numbers — keeping the "Your market" card trustworthy.
 *
 * ── One-time setup ────────────────────────────────────────────────────
 *   1. Download + unzip the May 2025 OEWS files:
 *        National: https://www.bls.gov/oes/special-requests/oesm25nat.zip
 *        State:    https://www.bls.gov/oes/special-requests/oesm25st.zip
 *      (Metro optional: oesm25ma.zip — pass as a 3rd arg later.)
 *   2. From the repo root:
 *        npm i xlsx @supabase/supabase-js   # if not already present
 *        export SUPABASE_URL="https://viapivvlhjqvjhoflxmp.supabase.co"
 *        export SUPABASE_SERVICE_ROLE_KEY="<service role key>"
 *        node scripts/load-oews.mjs ./national_M2025_dl.xlsx ./state_M2025_dl.xlsx
 *
 * Refresh annually when BLS releases the new May vintage (bump VINTAGE).
 */

import fs from "node:fs";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const VINTAGE = "May 2025";
const SOURCE = "BLS OEWS";

// role_category-adjacent SOC codes we surface. Keep in sync with
// src/lib/comp/market.ts (SOC_BY_KEYWORD).
const SOC_CODES = new Set(["29-1021", "29-1292", "31-9091", "43-6013", "11-9111"]);

const num = (v) => {
  if (v == null) return null;
  const s = String(v).replace(/[$,]/g, "").trim();
  if (!s || s === "*" || s === "#" || s === "**" || s === "~") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function rowsFrom(path) {
  const wb = XLSX.readFile(path);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

function records(rows, level) {
  const out = [];
  for (const r of rows) {
    const occ = String(r.OCC_CODE ?? r.occ_code ?? "").trim();
    if (!SOC_CODES.has(occ)) continue;
    const grp = String(r.O_GROUP ?? r.o_group ?? "").toLowerCase();
    if (grp && grp !== "detailed") continue;

    const areaCode =
      level === "national"
        ? "US"
        : String(r.PRIM_STATE ?? r.prim_state ?? r.AREA ?? "").trim().toUpperCase();
    const areaName =
      level === "national"
        ? "United States"
        : String(r.AREA_TITLE ?? r.area_title ?? areaCode).trim();
    if (!areaCode) continue;

    const hourly = {
      p25: num(r.H_PCT25 ?? r.h_pct25),
      p50: num(r.H_MEDIAN ?? r.h_median),
      p75: num(r.H_PCT75 ?? r.h_pct75),
    };
    const annual = {
      p25: num(r.A_PCT25 ?? r.a_pct25),
      p50: num(r.A_MEDIAN ?? r.a_median),
      p75: num(r.A_PCT75 ?? r.a_pct75),
    };
    for (const [unit, v] of [["hourly", hourly], ["annual", annual]]) {
      if (v.p25 == null || v.p75 == null) continue; // honest: skip suppressed
      out.push({
        area_level: level,
        area_code: areaCode,
        area_name: areaName,
        soc_code: occ,
        pay_unit: unit,
        p25: v.p25,
        p50: v.p50,
        p75: v.p75,
        vintage: VINTAGE,
        source: SOURCE,
      });
    }
  }
  return out;
}

async function main() {
  const [natPath, statePath, metroPath] = process.argv.slice(2);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  if (!natPath) throw new Error("Usage: node scripts/load-oews.mjs <national.xlsx> [state.xlsx] [metro.xlsx]");

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let all = [];
  all = all.concat(records(rowsFrom(natPath), "national"));
  if (statePath && fs.existsSync(statePath)) {
    all = all.concat(records(rowsFrom(statePath), "state"));
  }
  if (metroPath && fs.existsSync(metroPath)) {
    all = all.concat(records(rowsFrom(metroPath), "metro"));
  }

  console.log(`Prepared ${all.length} benchmark rows. Upserting…`);
  for (let i = 0; i < all.length; i += 500) {
    const batch = all.slice(i, i + 500);
    const { error } = await supabase
      .from("comp_benchmarks")
      .upsert(batch, { onConflict: "area_level,area_code,soc_code,pay_unit" });
    if (error) throw error;
    console.log(`  upserted ${Math.min(i + 500, all.length)}/${all.length}`);
  }
  console.log("Done. The Your-market card will light up for mapped roles.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
