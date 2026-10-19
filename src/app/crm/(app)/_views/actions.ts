"use server";

/* Saved views (2026-10-19): per-founder named filter sets on Accounts,
   Pipeline, Inbox and Tasks, stored in crm_saved_views (own-row RLS:
   owner_id defaults to auth.uid() and the policy pins it there). Each
   action re-checks the caller and returns {error} for the client chips to
   show inline. A "use server" file exports async functions only; the
   constants and the query normalizer live in ./query. */

import { revalidatePath } from "next/cache";
import { requireCrmAdmin, type CrmSession } from "@/lib/crm/auth";
import { UUID_RE, crmDbMessage } from "@/lib/crm/events";
import {
  MAX_VIEWS_PER_SURFACE,
  VIEW_NAME_MAX,
  VIEW_QUERY_MAX,
  isViewSurface,
  normalizeViewQuery,
  surfacePath,
  type ViewSurface,
} from "./query";

type Result = { error: string | null };
type ViewRow = { id: string; surface: string; name: string; sort: number };

const EXPIRED = "Your CRM session expired. Sign in again with your second factor.";

function cleanName(raw: unknown): string | null {
  const v = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!v) return null;
  return v.slice(0, VIEW_NAME_MAX);
}

export async function saveView(surface: string, name: string, query: string): Promise<Result> {
  const s = await requireCrmAdmin();
  if (!s) return { error: EXPIRED };
  if (!isViewSurface(surface)) return { error: "Unknown list." };
  const n = cleanName(name);
  if (!n) return { error: "Give the view a name." };
  const q = normalizeViewQuery(String(query ?? ""));
  if (q.length > VIEW_QUERY_MAX) return { error: "That view has too many filters to save." };

  const { data, error: readErr } = await s.supabase
    .from("crm_saved_views")
    .select("id, surface, name, sort")
    .eq("owner_id", s.me)
    .eq("surface", surface)
    .order("sort");
  if (readErr) return { error: crmDbMessage(readErr, "The view") };
  const rows = (data ?? []) as ViewRow[];

  /* Saving under a name you already use updates that view's filters. */
  const same = rows.find((r) => r.name.toLowerCase() === n.toLowerCase());
  if (same) {
    const { error } = await s.supabase.from("crm_saved_views").update({ query: q, name: n }).eq("id", same.id);
    if (error) return { error: crmDbMessage(error, "The view") };
  } else {
    if (rows.length >= MAX_VIEWS_PER_SURFACE)
      return { error: `You have ${MAX_VIEWS_PER_SURFACE} saved views here. Delete one first.` };
    const nextSort = rows.reduce((m, r) => Math.max(m, Number(r.sort) || 0), 0) + 1;
    const { error } = await s.supabase
      .from("crm_saved_views")
      .insert({ owner_id: s.me, surface, name: n, query: q, sort: nextSort });
    if (error) return { error: crmDbMessage(error, "The view") };
  }
  revalidatePath(surfacePath(surface));
  return { error: null };
}

async function ownView(id: string): Promise<{ error: string } | { s: CrmSession; row: ViewRow }> {
  const s = await requireCrmAdmin();
  if (!s) return { error: EXPIRED };
  if (typeof id !== "string" || !UUID_RE.test(id)) return { error: "Missing view." };
  const { data, error } = await s.supabase
    .from("crm_saved_views")
    .select("id, surface, name, sort")
    .eq("id", id)
    .eq("owner_id", s.me)
    .maybeSingle();
  if (error) return { error: crmDbMessage(error, "The view") };
  if (!data) return { error: "That view no longer exists." };
  return { s, row: data as ViewRow };
}

export async function deleteView(id: string): Promise<Result> {
  const got = await ownView(id);
  if ("error" in got) return { error: got.error };
  const { s, row } = got;
  const { error } = await s.supabase.from("crm_saved_views").delete().eq("id", row.id).eq("owner_id", s.me);
  if (error) return { error: crmDbMessage(error, "The delete") };
  if (isViewSurface(row.surface)) revalidatePath(surfacePath(row.surface));
  return { error: null };
}

export async function renameView(id: string, name: string): Promise<Result> {
  const got = await ownView(id);
  if ("error" in got) return { error: got.error };
  const { s, row } = got;
  const n = cleanName(name);
  if (!n) return { error: "Give the view a name." };
  if (n === row.name) return { error: null };
  const { error } = await s.supabase.from("crm_saved_views").update({ name: n }).eq("id", row.id).eq("owner_id", s.me);
  if (error) return { error: error.code === "23505" ? `You already have a view called "${n}".` : crmDbMessage(error, "The rename") };
  if (isViewSurface(row.surface)) revalidatePath(surfacePath(row.surface));
  return { error: null };
}

/* Swap with the neighbour, then renumber the whole surface 1..n so sort
   stays dense even after deletes or equal values. */
export async function moveView(id: string, dir: "up" | "down"): Promise<Result> {
  const got = await ownView(id);
  if ("error" in got) return { error: got.error };
  const { s, row } = got;
  if (dir !== "up" && dir !== "down") return { error: "Unknown direction." };
  const surface = row.surface as ViewSurface;
  const { data, error: readErr } = await s.supabase
    .from("crm_saved_views")
    .select("id, surface, name, sort")
    .eq("owner_id", s.me)
    .eq("surface", surface)
    .order("sort")
    .order("created_at");
  if (readErr) return { error: crmDbMessage(readErr, "The move") };
  const list = ((data ?? []) as ViewRow[]).map((r) => r.id);
  const i = list.indexOf(row.id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return { error: null };
  [list[i], list[j]] = [list[j], list[i]];
  const writes = await Promise.all(
    list.map((vid, idx) => s.supabase.from("crm_saved_views").update({ sort: idx + 1 }).eq("id", vid).eq("owner_id", s.me)),
  );
  const failed = writes.find((w) => w.error);
  if (failed?.error) return { error: crmDbMessage(failed.error, "The move") };
  if (isViewSurface(surface)) revalidatePath(surfacePath(surface));
  return { error: null };
}
