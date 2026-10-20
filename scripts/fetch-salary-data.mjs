/**
 * fetch-salary-data.mjs — refresh the two committed data files behind the
 * /salary pages, from official sources only:
 *
 *   1. src/lib/comp/oews-detail.json — full BLS OEWS wage distribution
 *      (p10..p90, means, employment, jobs per 1,000, location quotient) for
 *      the dental SOCs, national + every state + every metro/nonmetro area.
 *   2. src/lib/comp/state-projections.json — state long-term employment
 *      projections from Projections Central (projectionscentral.org), the
 *      official site where state labor market information offices publish
 *      their projections (sponsored by the U.S. Department of Labor).
 *
 * WHY: `comp_benchmarks` (Supabase) only stores p25/p50/p75. The salary pages
 * also show the 10th and 90th percentiles, mean wages, employment, jobs per
 * 1,000 and the location quotient. Those all live in the same official BLS
 * release, so this script reads them from BLS and nothing else.
 *
 * SOURCE (official, no API key needed):
 *   https://download.bls.gov/pub/time.series/oe/oe.data.0.Current  (~330 MB)
 *   https://download.bls.gov/pub/time.series/oe/oe.area
 *   https://download.bls.gov/pub/time.series/oe/oe.release
 * The data file is STREAMED and filtered line by line; nothing large is
 * written to disk. BLS rejects requests without a descriptive User-Agent, so
 * we send one with a contact address (BLS asks for this).
 *
 * Series id layout (25 chars): OEU + areatype(N|S|M) + area(7) +
 *   industry(6, "000000" = all industries) + SOC(6, no dash) + datatype(2).
 * Datatypes kept: 01 employment, 03/04 hourly/annual mean, 06-10 hourly
 *   p10/p25/p50/p75/p90, 11-15 annual p10..p90, 16 jobs per 1,000, 17 LQ.
 * Footnote 5 = top-coded wage (>= $115.00/hr or $239,200/yr); those cells are
 * stored as the string "#" so the UI can say "$239,200 or more".
 *
 * Output shape (compact, positional to keep the file small):
 *   { vintage, fields: ["emp", ...], socs: { "29-1292": {
 *       national: [v...], states: { TX: [v...] }, metros: { "0019100": [name, v...] } } } }
 * where each v is a number, null (not published) or "#" (top-coded).
 *
 * Projections Central exposes a public JSON endpoint used by its own site:
 *   https://public.projectionscentral.org/Projections/LongTermRestJson/all/<SOC>
 * Each row: Area, Base, Projected, Change, PercentChange, AvgAnnualOpenings,
 * BaseYear, ProjYear, StateURL (the state LMI office that produced it).
 *
 * RUN (from repo root, Node 18+, no dependencies):
 *   node scripts/fetch-salary-data.mjs
 * Commit both JSON files. Re-run each spring when BLS publishes the new May
 * OEWS vintage (label comes from oe.release) and whenever Projections Central
 * rolls to a new projection period. The comp_benchmarks table (p25/p50/p75,
 * loaded by scripts/load-oews.mjs) should be refreshed to the same vintage.
 */

import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import readline from "node:readline";

const BASE = "https://download.bls.gov/pub/time.series/oe/";
const UA = "DSO Hire salary data refresh (support@dsohire.com)";
const OUT = path.join(process.cwd(), "src/lib/comp/oews-detail.json");
const PROJ_OUT = path.join(process.cwd(), "src/lib/comp/state-projections.json");
const PROJ_BASE = "https://public.projectionscentral.org/Projections/LongTermRestJson/all/";

// Keep in sync with SALARY_ROLES in src/lib/comp/salary.ts.
const SOCS = ["291292", "319091", "291021", "291029", "436013", "119111", "519081"];

const FIELDS = {
  "01": "emp",
  "03": "hMean",
  "04": "aMean",
  "06": "h10",
  "07": "h25",
  "08": "h50",
  "09": "h75",
  "10": "h90",
  "11": "a10",
  "12": "a25",
  "13": "a50",
  "14": "a75",
  "15": "a90",
  "16": "per1000",
  "17": "lq",
};

async function getText(file) {
  const res = await fetch(BASE + file, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.text();
}

function parseTsv(text) {
  const [head, ...lines] = text.split(/\r?\n/).filter(Boolean);
  const cols = head.split("\t").map((s) => s.trim());
  return lines.map((l) => {
    const v = l.split("\t").map((s) => s.trim());
    return Object.fromEntries(cols.map((c, i) => [c, v[i] ?? ""]));
  });
}

async function main() {
  const release = parseTsv(await getText("oe.release"));
  const rel = release[release.length - 1];
  const vintage = rel.description; // e.g. "May 2025"
  const year = rel.release_date.slice(0, 4);

  const areas = new Map(
    parseTsv(await getText("oe.area")).map((a) => [a.area_code, { name: a.area_name, state: a.state_code, type: a.areatype_code }]),
  );

  const re = new RegExp(`^OEU([NSM])(\\d{7})000000(${SOCS.join("|")})(\\d{2})$`);
  const out = {}; // soc -> { national, states, metros }
  const res = await fetch(BASE + "oe.data.0.Current", { headers: { "User-Agent": UA } });
  if (!res.ok || !res.body) throw new Error(`oe.data.0.Current: HTTP ${res.status}`);
  const rl = readline.createInterface({ input: Readable.fromWeb(res.body), crlfDelay: Infinity });
  let kept = 0;
  for await (const line of rl) {
    if (!line.startsWith("OEU")) continue;
    const [sid, yr, , rawVal, foot] = line.split("\t").map((s) => s.trim());
    if (yr !== year) continue;
    const m = re.exec(sid);
    if (!m) continue;
    const [, type, area, socRaw, dt] = m;
    const field = FIELDS[dt];
    if (!field) continue;
    const soc = `${socRaw.slice(0, 2)}-${socRaw.slice(2)}`;
    const bucket = (out[soc] ??= { national: null, states: {}, metros: {} });
    let rec;
    if (type === "N") rec = bucket.national ??= {};
    else if (type === "S") {
      // State area codes are FIPS + "00000"; key states by FIPS for now.
      const fips = area.slice(0, 2);
      rec = bucket.states[fips] ??= {};
    } else {
      rec = bucket.metros[area] ??= { name: areas.get(area)?.name ?? area };
    }
    const n = Number(rawVal.replace(/,/g, ""));
    if (foot === "5" || rawVal === "#") {
      rec[field] = "#";
    } else {
      rec[field] = Number.isFinite(n) && rawVal !== "-" && rawVal !== "*" ? n : null;
    }
    kept++;
  }

  // FIPS -> USPS code via the state names in oe.area (type S rows).
  const FIPS_TO_USPS = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC",
    "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
    "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT",
    "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
    "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
    "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY", "66": "GU", "72": "PR", "78": "VI",
  };
  for (const soc of Object.keys(out)) {
    const states = {};
    for (const [fips, rec] of Object.entries(out[soc].states)) {
      const usps = FIPS_TO_USPS[fips];
      if (usps) states[usps] = rec;
    }
    out[soc].states = states;
  }

  const fieldList = Object.keys(FIELDS).sort().map((k) => FIELDS[k]); // datatype order
  const pack = (rec) => fieldList.map((f) => (rec[f] === undefined ? null : rec[f]));
  const packed = {};
  for (const [soc, b] of Object.entries(out)) {
    packed[soc] = {
      national: b.national ? pack(b.national) : null,
      states: Object.fromEntries(Object.entries(b.states).sort().map(([k, r]) => [k, pack(r)])),
      metros: Object.fromEntries(Object.entries(b.metros).sort().map(([k, r]) => [k, [r.name, ...pack(r)]])),
    };
  }

  const doc = {
    source: "U.S. Bureau of Labor Statistics, Occupational Employment and Wage Statistics (OEWS)",
    sourceUrl: BASE + "oe.data.0.Current",
    vintage,
    fetchedAt: new Date().toISOString().slice(0, 10),
    note: "Generated by scripts/fetch-salary-data.mjs. Do not hand-edit. Values are positional per `fields`. null = not published by BLS; \"#\" = wage at or above $115.00/hr or $239,200/yr.",
    fields: fieldList,
    socs: packed,
  };
  fs.writeFileSync(OUT, JSON.stringify(doc) + "\n");
  console.log(`kept ${kept} values for ${Object.keys(out).length} SOCs (${vintage}) -> ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
}

const NAME_TO_USPS = {
  "United States": "US", Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO",
  Connecticut: "CT", Delaware: "DE", "District of Columbia": "DC", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
  Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE",
  Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
  "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI",
  "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA",
  Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY", "Puerto Rico": "PR", Guam: "GU",
  "Virgin Islands": "VI",
};

async function projections() {
  const socs = {};
  let period = null;
  for (const raw of SOCS) {
    const soc = `${raw.slice(0, 2)}-${raw.slice(2)}`;
    const res = await fetch(PROJ_BASE + soc + "?items_per_page=100", { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`projections ${soc}: HTTP ${res.status}`);
    const body = await res.json();
    if (body.pager && body.pager.total_pages > 1) throw new Error(`projections ${soc}: paging not handled`);
    const n = (v) => {
      const x = Number(String(v ?? "").replace(/,/g, ""));
      return v === "" || v == null || !Number.isFinite(x) ? null : x;
    };
    const areas = {};
    for (const r of body.rows ?? []) {
      const code = NAME_TO_USPS[String(r.Area).trim()];
      if (!code) continue;
      const p = `${r.BaseYear}-${r.ProjYear}`;
      period ??= p;
      if (p !== period) continue; // keep one consistent period
      areas[code] = {
        base: n(r.Base),
        projected: n(r.Projected),
        change: n(r.Change),
        pct: n(r.PercentChange),
        openings: n(r.AvgAnnualOpenings),
        lmiUrl: r.StateURL || null,
      };
    }
    socs[soc] = areas;
  }
  const doc = {
    source: "Projections Central, state long-term occupational projections",
    sourceUrl: "https://projectionscentral.org/Projections/LongTerm",
    period,
    fetchedAt: new Date().toISOString().slice(0, 10),
    note: "Generated by scripts/fetch-salary-data.mjs. Do not hand-edit. US row is the BLS national projection carried on Projections Central.",
    socs,
  };
  fs.writeFileSync(PROJ_OUT, JSON.stringify(doc, null, 0) + "\n");
  console.log(`projections ${period}: ${Object.keys(socs).map((k) => `${k}=${Object.keys(socs[k]).length}`).join(" ")} -> ${path.relative(process.cwd(), PROJ_OUT)}`);
}

Promise.all([main(), projections()]).catch((e) => {
  console.error(e);
  process.exit(1);
});
