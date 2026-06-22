/**
 * God-mode admin search (Tranche 1, Phase 3).
 *
 * One box → union across dsos / candidates / jobs / applications, type-tagged,
 * each linking to its Account-360 page. This is OPERATOR access (legitimate
 * platform-staff view), NOT impersonation — but the firewall still holds:
 * EEO is never selected, and deleted_at IS NULL is applied everywhere.
 *
 * Service-role reads (RLS scopes these tables to tenant members). Fail-safe.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export interface SearchResult {
  type: "dso" | "candidate" | "job" | "application";
  id: string;
  title: string;
  subtitle: string;
  status: string | null;
  href: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function searchAdmin(qRaw: string): Promise<SearchResult[]> {
  const q = qRaw.trim();
  if (q.length < 2) return [];

  // Strip characters that would break the PostgREST or() filter grammar.
  const safe = q.replace(/[%,()*]/g, "").trim();
  if (!safe) return [];
  const w = `*${safe}*`;

  const admin = createSupabaseServiceRoleClient();
  const out: SearchResult[] = [];

  try {
    const [dsos, cands, jobs] = await Promise.all([
      admin
        .from("dsos")
        .select("id, name, slug, status")
        .is("deleted_at", null)
        .or(`name.ilike.${w},slug.ilike.${w}`)
        .limit(8),
      admin
        .from("candidates")
        .select("id, full_name, email, current_title")
        .is("deleted_at", null)
        .or(`full_name.ilike.${w},email.ilike.${w}`)
        .limit(8),
      admin
        .from("jobs")
        .select("id, title, status")
        .is("deleted_at", null)
        .ilike("title", `%${safe}%`)
        .limit(8),
    ]);

    for (const d of (dsos.data ?? []) as Array<Record<string, unknown>>) {
      out.push({
        type: "dso",
        id: String(d.id),
        title: String(d.name ?? "(unnamed DSO)"),
        subtitle: `/${String(d.slug ?? "")}`,
        status: (d.status as string | null) ?? null,
        href: `/admin/dso/${String(d.id)}`,
      });
    }
    for (const c of (cands.data ?? []) as Array<Record<string, unknown>>) {
      out.push({
        type: "candidate",
        id: String(c.id),
        title: String(c.full_name ?? "(no name)"),
        subtitle: String(c.email ?? c.current_title ?? ""),
        status: null,
        href: `/admin/candidate/${String(c.id)}`,
      });
    }
    for (const j of (jobs.data ?? []) as Array<Record<string, unknown>>) {
      out.push({
        type: "job",
        id: String(j.id),
        title: String(j.title ?? "(untitled)"),
        subtitle: "Job posting",
        status: (j.status as string | null) ?? null,
        href: `/admin/job/${String(j.id)}`,
      });
    }

    // Applications: match an exact id (the typical "look up this app" case).
    if (UUID_RE.test(safe)) {
      const { data: app } = await admin
        .from("applications")
        .select("id, job_id, candidate_id")
        .eq("id", safe)
        .maybeSingle();
      if (app) {
        out.push({
          type: "application",
          id: String(app.id),
          title: `Application ${String(app.id).slice(0, 8)}…`,
          subtitle: "Opens the job",
          status: null,
          href: `/admin/job/${String(app.job_id)}`,
        });
      }
    }
  } catch {
    return out;
  }

  return out;
}
