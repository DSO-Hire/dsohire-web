/**
 * load-comp-csv.mjs — one-time bulk load of the comp reference-data CSVs
 * generated into "DSO Hire/BLS Compensation Data/":
 *   • loadme_zip_cbsa.csv    → zip_cbsa        (~32k rows)
 *   • loadme_comp_metro.csv  → comp_benchmarks (~3.7k metro rows)
 *
 * This is a pure DATA load (upsert). It does NOT run migrations and does NOT
 * touch the schema/migration ledger — safe to run/re-run anytime.
 *
 * Run from the repo root:
 *   export SUPABASE_URL="https://viapivvlhjqvjhoflxmp.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="<Project Settings → API → service_role key>"
 *   node scripts/load-comp-csv.mjs "/Users/cam/DSO Hire/BLS Compensation Data"
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// Minimal RFC-ish CSV line splitter (handles quoted fields w/ commas).
function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "").trim();
  const [head, ...lines] = text.split(/\r?\n/);
  const cols = splitCsvLine(head);
  return lines.filter(Boolean).map((ln) => {
    const v = splitCsvLine(ln);
    const o = {};
    cols.forEach((c, i) => (o[c] = v[i]));
    return o;
  });
}

const numOrNull = (s) => (s === "" || s == null ? null : Number(s));

async function upsertAll(supabase, table, rows, conflict) {
  for (let i = 0; i < rows.length; i += 1000) {
    const batch = rows.slice(i, i + 1000);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: conflict });
    if (error) throw error;
    console.log(`  ${table}: ${Math.min(i + 1000, rows.length)}/${rows.length}`);
  }
}

async function main() {
  const dir = process.argv[2];
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dir) throw new Error('Usage: node scripts/load-comp-csv.mjs "<BLS Compensation Data folder>"');
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // zip_cbsa
  const zip = parseCsv(path.join(dir, "loadme_zip_cbsa.csv")).map((r) => ({
    zip: r.zip,
    cbsa: r.cbsa,
  }));
  console.log(`zip_cbsa: ${zip.length} rows`);
  await upsertAll(supabase, "zip_cbsa", zip, "zip");

  // comp_benchmarks (metro)
  const comp = parseCsv(path.join(dir, "loadme_comp_metro.csv")).map((r) => ({
    area_level: r.area_level,
    area_code: r.area_code,
    area_name: r.area_name,
    soc_code: r.soc_code,
    pay_unit: r.pay_unit,
    p25: numOrNull(r.p25),
    p50: numOrNull(r.p50),
    p75: numOrNull(r.p75),
    vintage: r.vintage,
    source: r.source,
  }));
  console.log(`comp_benchmarks (metro): ${comp.length} rows`);
  await upsertAll(supabase, "comp_benchmarks", comp, "area_level,area_code,soc_code,pay_unit");

  console.log("Done. Metro Your-market is live for any candidate with a ZIP.");
}

main().catch((e) => { console.error(e); process.exit(1); });
