/**
 * Marketplace Liquidity Radar loader (Tranche 1, Phase 2).
 *
 * Thin typed wrappers over the service_role-only liquidity RPCs (migration
 * 20260622060000). Aggregate-only; the candidate side is counts (buyer-leak is
 * a number, supply in the matrix is a count) — never per-candidate identity.
 * Fail-safe: errors → empty/zero so the page renders partial data.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export interface MatrixCell {
  role_category: string;
  metro: string;
  demand: number;
  supply: number;
}
export interface SellerLeak {
  job_id: string;
  title: string;
  dso_name: string;
  metro: string;
  posted_at: string | null;
  days_live: number;
}
export interface VelocityRow {
  role_category: string;
  jobs_with_apps: number;
  median_days: number | null;
}
export interface LiquiditySnapshot {
  matrix: MatrixCell[];
  sellerLeaks: SellerLeak[];
  buyerLeakCount: number;
  velocity: VelocityRow[];
}

export async function getLiquiditySnapshot(): Promise<LiquiditySnapshot> {
  try {
    const admin = createSupabaseServiceRoleClient();
    const [matrix, seller, buyer, velocity] = await Promise.all([
      admin.rpc("admin_liquidity_matrix"),
      admin.rpc("admin_liquidity_seller_leaks", { p_limit: 25 }),
      admin.rpc("admin_liquidity_buyer_leak"),
      admin.rpc("admin_liquidity_velocity"),
    ]);

    return {
      matrix: (Array.isArray(matrix.data) ? matrix.data : []).map((r) => ({
        role_category: String(r.role_category ?? ""),
        metro: String(r.metro ?? ""),
        demand: Number(r.demand ?? 0),
        supply: Number(r.supply ?? 0),
      })),
      sellerLeaks: (Array.isArray(seller.data) ? seller.data : []).map((r) => ({
        job_id: String(r.job_id ?? ""),
        title: String(r.title ?? "(untitled)"),
        dso_name: String(r.dso_name ?? "—"),
        metro: String(r.metro ?? "—"),
        posted_at: r.posted_at ? String(r.posted_at) : null,
        days_live: Number(r.days_live ?? 0),
      })),
      buyerLeakCount: Number(buyer.data ?? 0),
      velocity: (Array.isArray(velocity.data) ? velocity.data : []).map((r) => ({
        role_category: String(r.role_category ?? ""),
        jobs_with_apps: Number(r.jobs_with_apps ?? 0),
        median_days: r.median_days == null ? null : Number(r.median_days),
      })),
    };
  } catch {
    return { matrix: [], sellerLeaks: [], buyerLeakCount: 0, velocity: [] };
  }
}

export type LiquidityTone = "under" | "over" | "balanced" | "neutral";

/** Classify a matrix cell. "Undersupplied" = too few candidates for the demand
 * (the GTM signal to go recruit supply). */
export function liquidityFlag(
  demand: number,
  supply: number,
): { label: string; tone: LiquidityTone } {
  if (demand === 0) {
    return supply > 0
      ? { label: "No demand", tone: "over" }
      : { label: "—", tone: "neutral" };
  }
  const ratio = supply / demand;
  if (ratio < 0.5) return { label: "Undersupplied", tone: "under" };
  if (ratio > 2) return { label: "Oversupplied", tone: "over" };
  return { label: "Balanced", tone: "balanced" };
}

/** Humanize a role_category enum value: dental_hygienist → "Dental Hygienist". */
export function humanizeRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
