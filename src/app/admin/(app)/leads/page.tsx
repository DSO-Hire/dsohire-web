/**
 * /admin/leads: every marketing hand-raise, newest first.
 *
 * Reads marketing_leads through the service-role client (the table has no
 * RLS policies by design). Founder-only: rows carry contact details, so
 * `support`-role staff are bounced even though the (app) layout already
 * passed them through the admin_users gate.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { isSuperadminEmail } from "@/lib/admin/gate";
import { LEAD_KINDS, LEAD_KIND_LABELS, type LeadKind } from "@/lib/marketing/leads";

export const metadata: Metadata = {
  title: "Leads · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

interface LeadRow {
  id: string;
  created_at: string;
  kind: LeadKind;
  contact: string;
  contact_type: "email" | "phone";
  name: string | null;
  company: string | null;
  audience: string | null;
  context: Record<string, unknown>;
  source_path: string | null;
  referrer: string | null;
  utm: Record<string, unknown>;
  status: string;
}

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isSuperadminEmail(user?.email)) redirect("/admin");

  const { kind: rawKind } = await searchParams;
  const kind = LEAD_KINDS.includes(rawKind as LeadKind) ? (rawKind as LeadKind) : null;

  const admin = createSupabaseServiceRoleClient();
  let q = admin
    .from("marketing_leads")
    .select(
      "id, created_at, kind, contact, contact_type, name, company, audience, context, source_path, referrer, utm, status"
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  const rows = (data ?? []) as LeadRow[];

  const { data: all } = await admin.from("marketing_leads").select("kind");

  // Live-demo opens (reported by the demo deployment's /demo route).
  const since30 = daysAgoIso(30);
  const [{ data: named }, { count: opens30 }] = await Promise.all([
    admin
      .from("demo_visits")
      .select("id, for_label, visits, created_at, last_seen_at")
      .not("for_key", "is", null)
      .order("last_seen_at", { ascending: false })
      .limit(50),
    admin
      .from("demo_visits")
      .select("id", { count: "exact", head: true })
      .gte("last_seen_at", since30),
  ]);
  const namedVisits = (named ?? []) as Array<{
    id: string;
    for_label: string;
    visits: number;
    created_at: string;
    last_seen_at: string;
  }>;
  const counts = new Map<string, number>();
  for (const r of (all ?? []) as { kind: string }[]) {
    counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  }

  return (
    <>
      <header className="mb-8">
        <div className="text-2xs font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Pipeline top
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink">
          Leads
        </h1>
        <p className="mt-3 text-sm text-slate-body leading-relaxed max-w-[680px]">
          Every demo ask, calculator handoff, report signup, contact message,
          and job alert. Saved before any email goes out, so nothing here
          depends on the inbox.
        </p>
      </header>

      <section className="mb-8 border border-[var(--rule)] bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule)] px-5 py-3">
          <div>
            <div className="text-2xs font-bold uppercase tracking-[1.5px] text-heritage-deep">Live demo opens</div>
            <div className="text-xs text-slate-meta mt-0.5">
              Send prospects <code className="text-ink">demo.dsohire.com/demo?for=Their+Group</code> to see
              them here (and get an email when they open it).
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-extrabold tracking-[-0.02em] text-ink tabular">{opens30 ?? 0}</div>
            <div className="text-2xs text-slate-meta">opens, last 30 days</div>
          </div>
        </div>
        {namedVisits.length === 0 ? (
          <div className="px-5 py-4 text-xs text-slate-meta">No named prospects have opened the demo yet.</div>
        ) : (
          <ul className="divide-y divide-[var(--rule)]">
            {namedVisits.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
                <span className="text-sm font-bold text-ink">{v.for_label}</span>
                <span className="text-xs text-slate-meta tabular">
                  {v.visits} {v.visits === 1 ? "open" : "opens"} · last{" "}
                  {new Date(v.last_seen_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: "America/Chicago",
                  })}{" "}
                  CT
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Filter by type">
        <FilterChip href="/admin/leads" active={!kind} label="All" n={all?.length ?? 0} />
        {LEAD_KINDS.map((k) => (
          <FilterChip
            key={k}
            href={`/admin/leads?kind=${k}`}
            active={kind === k}
            label={LEAD_KIND_LABELS[k]}
            n={counts.get(k) ?? 0}
          />
        ))}
      </nav>

      {error ? (
        <p className="border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          Couldn&apos;t load leads: {error.message}
        </p>
      ) : rows.length === 0 ? (
        <div className="border border-dashed border-[var(--rule-strong)] bg-card px-6 py-14 text-center text-sm text-slate-meta">
          No leads {kind ? `of this type ` : ""}yet. They&apos;ll appear here the
          moment someone raises a hand.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--rule)] border border-[var(--rule)] bg-card">
          {rows.map((r) => (
            <li key={r.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[180px_1fr_1fr]">
              <div>
                <div className="text-2xs font-bold uppercase tracking-[1.5px] text-heritage-deep">
                  {LEAD_KIND_LABELS[r.kind] ?? r.kind}
                </div>
                <time className="mt-1 block text-xs text-slate-meta tabular" dateTime={r.created_at}>
                  {new Date(r.created_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: "America/Chicago",
                  })}{" "}
                  CT
                </time>
              </div>
              <div className="min-w-0">
                <a
                  href={r.contact_type === "email" ? `mailto:${r.contact}` : `tel:${r.contact}`}
                  className="text-sm font-bold text-ink hover:text-heritage-deep break-all"
                >
                  {r.contact}
                </a>
                {(r.name || r.company) && (
                  <div className="text-xs text-slate-body mt-0.5">
                    {[r.name, r.company].filter(Boolean).join(" · ")}
                  </div>
                )}
                <div className="text-xs text-slate-meta mt-1">
                  {r.source_path ?? "unknown page"}
                  {r.referrer ? ` · via ${r.referrer}` : ""}
                  {Object.keys(r.utm ?? {}).length
                    ? ` · ${Object.values(r.utm).filter(Boolean).join(" / ")}`
                    : ""}
                </div>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                {Object.entries(r.context ?? {}).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-slate-meta">{k.replace(/_/g, " ")}</dt>
                    <dd className="text-ink whitespace-pre-wrap break-words">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function FilterChip({
  href,
  active,
  label,
  n,
}: {
  href: string;
  active: boolean;
  label: string;
  n: number;
}) {
  return (
    <Link
      href={href}
      className={
        "border px-3 py-1.5 text-xs font-semibold transition-colors " +
        (active
          ? "border-ink bg-ink text-ivory"
          : "border-[var(--rule-strong)] bg-card text-slate-body hover:border-heritage hover:text-ink")
      }
    >
      {label} <span className="tabular opacity-60">{n}</span>
    </Link>
  );
}

/* Module-level so the render stays pure (react-hooks purity rule). */
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}
