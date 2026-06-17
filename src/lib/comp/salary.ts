/**
 * salary.ts — data layer for the programmatic /salary/[role]/[state] SEO pages.
 *
 * Reuses the BLS OEWS data already loaded into `comp_benchmarks`
 * (10 SOCs × national/state/metro, p25/p50/p75, annual + hourly).
 * State is keyed by 2-letter USPS code in `area_code`; metros by CBSA code
 * with the state(s) embedded in `area_name` after the last comma.
 *
 * NOTE (project hard rule): the Supabase client is untyped, so every `.select()`
 * below lists EXACTLY the columns the mappers read. Don't trim them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { US_STATES } from "@/lib/us-states";

export type PayTriple = { p25: number; p50: number; p75: number };

export type SalaryRole = {
  slug: string; // matches role-config + the URL segment
  soc: string;
  searchTitle: string; // the keyword phrase, e.g. "Dental Hygienist"
  hubHref: string; // the matching /for-[role] hub
};

/** The dental roles that have a clean BLS SOC mapping (others are excluded). */
export const SALARY_ROLES: readonly SalaryRole[] = [
  { slug: "hygienists", soc: "29-1292", searchTitle: "Dental Hygienist", hubHref: "/for-hygienists" },
  { slug: "dental-assistants", soc: "31-9091", searchTitle: "Dental Assistant", hubHref: "/for-dental-assistants" },
  { slug: "dentists", soc: "29-1021", searchTitle: "Dentist", hubHref: "/for-dentists" },
  { slug: "specialists", soc: "29-1029", searchTitle: "Dental Specialist", hubHref: "/for-specialists" },
  { slug: "front-desk", soc: "43-6013", searchTitle: "Dental Front Office", hubHref: "/for-front-desk" },
  { slug: "office-managers", soc: "11-9111", searchTitle: "Dental Office Manager", hubHref: "/for-office-managers" },
  { slug: "practice-administrators", soc: "11-9111", searchTitle: "Dental Practice Administrator", hubHref: "/for-practice-administrators" },
  { slug: "dental-lab-technicians", soc: "51-9081", searchTitle: "Dental Lab Technician", hubHref: "/for-dental-lab-technicians" },
];

export const SALARY_ROLE_BY_SLUG: Readonly<Record<string, SalaryRole>> =
  Object.fromEntries(SALARY_ROLES.map((r) => [r.slug, r]));

export function stateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
}

export const STATE_BY_SLUG: Readonly<Record<string, { code: string; name: string }>> =
  Object.fromEntries(US_STATES.map((s) => [stateSlug(s.name), { code: s.code, name: s.name }]));

export const ALL_STATE_SLUGS: readonly string[] = US_STATES.map((s) => stateSlug(s.name));

export type SalaryData = {
  areaName: string;
  level: "state" | "national";
  annual: PayTriple | null;
  hourly: PayTriple | null;
  vintage: string;
  source: string;
};

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function foldRows(rows: Record<string, unknown>[]): {
  annual: PayTriple | null;
  hourly: PayTriple | null;
  vintage: string;
  source: string;
  areaName: string;
} {
  let annual: PayTriple | null = null;
  let hourly: PayTriple | null = null;
  let vintage = "";
  let source = "";
  let areaName = "";
  for (const r of rows) {
    vintage = (r.vintage as string) ?? vintage;
    source = (r.source as string) ?? source;
    areaName = (r.area_name as string) ?? areaName;
    const p25 = num(r.p25);
    const p50 = num(r.p50);
    const p75 = num(r.p75);
    if (p25 === null || p50 === null || p75 === null) continue;
    const triple = { p25, p50, p75 };
    if (r.pay_unit === "annual") annual = triple;
    else if (r.pay_unit === "hourly") hourly = triple;
  }
  return { annual, hourly, vintage, source, areaName };
}

const SELECT_COLS = "area_name, area_code, pay_unit, p25, p50, p75, vintage, source";

/** State-level pay for a SOC, falling back to national if the state cell is empty. */
export async function loadStateSalary(
  supabase: SupabaseClient,
  soc: string,
  stateCode: string,
): Promise<SalaryData | null> {
  const stateRes = await supabase
    .from("comp_benchmarks")
    .select(SELECT_COLS)
    .eq("soc_code", soc)
    .eq("area_level", "state")
    .eq("area_code", stateCode);
  const sRows = (stateRes.data ?? []) as Record<string, unknown>[];
  if (sRows.length) {
    const f = foldRows(sRows);
    if (f.annual || f.hourly) {
      return { areaName: f.areaName, level: "state", annual: f.annual, hourly: f.hourly, vintage: f.vintage, source: f.source };
    }
  }
  return loadNationalSalary(supabase, soc);
}

export async function loadNationalSalary(
  supabase: SupabaseClient,
  soc: string,
): Promise<SalaryData | null> {
  const res = await supabase
    .from("comp_benchmarks")
    .select(SELECT_COLS)
    .eq("soc_code", soc)
    .eq("area_level", "national")
    .eq("area_code", "US");
  const rows = (res.data ?? []) as Record<string, unknown>[];
  if (!rows.length) return null;
  const f = foldRows(rows);
  if (!f.annual && !f.hourly) return null;
  return { areaName: f.areaName || "the United States", level: "national", annual: f.annual, hourly: f.hourly, vintage: f.vintage, source: f.source };
}

export type MetroPay = { name: string; slug: string; annual: PayTriple | null; hourly: PayTriple | null };

/** All metros within a state for a SOC, sorted by median desc. Metros carry the state in `area_name`. */
export async function loadStateMetros(
  supabase: SupabaseClient,
  soc: string,
  stateCode: string,
): Promise<MetroPay[]> {
  const res = await supabase
    .from("comp_benchmarks")
    .select("area_name, pay_unit, p25, p50, p75")
    .eq("soc_code", soc)
    .eq("area_level", "metro");
  const rows = (res.data ?? []) as Record<string, unknown>[];
  const byName = new Map<string, { annual: PayTriple | null; hourly: PayTriple | null }>();
  for (const r of rows) {
    const name = (r.area_name as string) ?? "";
    const statePart = name.split(",").pop()?.trim() ?? "";
    const codes = statePart.split(/[-\s]+/);
    if (!codes.includes(stateCode)) continue;
    const p25 = num(r.p25);
    const p50 = num(r.p50);
    const p75 = num(r.p75);
    if (p25 === null || p50 === null || p75 === null) continue;
    const cur = byName.get(name) ?? { annual: null, hourly: null };
    const triple = { p25, p50, p75 };
    if (r.pay_unit === "annual") cur.annual = triple;
    else if (r.pay_unit === "hourly") cur.hourly = triple;
    byName.set(name, cur);
  }
  const list: MetroPay[] = [...byName.entries()].map(([name, v]) => ({
    name,
    slug: metroCitySlug(name),
    annual: v.annual,
    hourly: v.hourly,
  }));
  list.sort((a, b) => (b.annual?.p50 ?? b.hourly?.p50 ?? 0) - (a.annual?.p50 ?? a.hourly?.p50 ?? 0));
  return list;
}

/** Top N metros (by median) within a state. */
export async function loadTopMetros(
  supabase: SupabaseClient,
  soc: string,
  stateCode: string,
  limit = 6,
): Promise<MetroPay[]> {
  return (await loadStateMetros(supabase, soc, stateCode)).slice(0, limit);
}

export function fmtAnnual(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}
export function fmtHourly(n: number): string {
  return "$" + n.toFixed(2);
}
/** Short metro label: drop the trailing state codes for display. */
export function metroShort(name: string): string {
  const i = name.lastIndexOf(",");
  return i > 0 ? name.slice(0, i) : name;
}

/** URL slug for a metro, derived from the city portion of its name. */
export function metroCitySlug(name: string): string {
  const city = name.split(",")[0] ?? name;
  return city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Resolve a role slug + state slug to the canonical role/state, or null. */
export function resolveRoleState(roleSlug: string, stSlug: string) {
  const role = SALARY_ROLE_BY_SLUG[roleSlug];
  const state = STATE_BY_SLUG[stSlug];
  if (!role || !state) return null;
  return { role, state };
}
