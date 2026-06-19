/**
 * /admin/support/conversations — Tier 2 Phase D admin dashboard.
 *
 * Cam-only. Lists every support chat conversation across all customers
 * with filters + cost + tool-call count + review status. Click a row
 * to drill into the full transcript at /admin/support/conversations/[id].
 *
 * v1 access gate: email match against ADMIN_EMAIL (cam@dsohire.com).
 * Proper admin role model lands later.
 *
 * Sort: most recently flagged-bad first, then unreviewed, then
 * reviewed. Pagination defaults to 50 rows.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { isFirstHundredMode } from "@/lib/support/auto-flag";

export const metadata: Metadata = {
  title: "Support conversations · Admin",
};
export const dynamic = "force-dynamic";

const ADMIN_EMAILS = new Set(["cam@dsohire.com", "cameron@eslingerdental.com"]);

interface PageProps {
  searchParams: Promise<{
    status?: string;
    review?: string;
    limit?: string;
  }>;
}

export default async function AdminConversationsPage({ searchParams }: PageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in?next=/admin/support/conversations");
  if (!user.email || !ADMIN_EMAILS.has(user.email.toLowerCase())) {
    notFound();
  }

  const sp = await searchParams;
  const reviewFilter = sp.review ?? "all"; // all | unreviewed | flagged_bad | reviewed
  const limit = Math.min(
    Math.max(10, Number.parseInt(sp.limit ?? "50", 10) || 50),
    200
  );

  const admin = createSupabaseServiceRoleClient();
  let q = admin
    .from("support_requests")
    .select(
      "id, dso_id, auth_user_id, body, tier_snapshot, status, review_status, auto_flag_reason, page_url, page_title, created_at, reviewed_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (reviewFilter !== "all") {
    q = q.eq("review_status", reviewFilter);
  }
  const { data: rawRows } = await q;

  type RequestRow = {
    id: string;
    dso_id: string | null;
    auth_user_id: string;
    body: string;
    tier_snapshot: string | null;
    status: string;
    review_status: "unreviewed" | "reviewed" | "flagged_bad";
    auto_flag_reason: string | null;
    page_url: string | null;
    page_title: string | null;
    created_at: string;
    reviewed_at: string | null;
  };
  const rows = (rawRows as RequestRow[] | null) ?? [];

  // Resolve DSO names + per-conversation stats in batch.
  const dsoIds = Array.from(
    new Set(rows.map((r) => r.dso_id).filter((id): id is string => !!id))
  );
  const dsoNames = new Map<string, string>();
  if (dsoIds.length > 0) {
    const { data: dsos } = await admin
      .from("dsos")
      .select("id, name")
      .in("id", dsoIds);
    for (const d of (dsos as Array<{ id: string; name: string }> | null) ?? []) {
      dsoNames.set(d.id, d.name);
    }
  }

  const requestIds = rows.map((r) => r.id);
  const turnCounts = new Map<string, { assistant: number; tools: number }>();
  if (requestIds.length > 0) {
    const { data: msgs } = await admin
      .from("support_chat_messages")
      .select("request_id, role")
      .in("request_id", requestIds);
    for (const m of (msgs as Array<{ request_id: string; role: string }> | null) ?? []) {
      const cur = turnCounts.get(m.request_id) ?? { assistant: 0, tools: 0 };
      if (m.role === "assistant") cur.assistant++;
      if (m.role === "tool") cur.tools++;
      turnCounts.set(m.request_id, cur);
    }
  }

  const costByRequest = new Map<string, number>();
  if (requestIds.length > 0) {
    const { data: usage } = await admin
      .from("claude_usage_log")
      .select("request_id, cost_cents")
      .in("request_id", requestIds);
    for (const u of (usage as Array<{
      request_id: string | null;
      cost_cents: number | string;
    }> | null) ?? []) {
      if (!u.request_id) continue;
      const v =
        typeof u.cost_cents === "string"
          ? parseFloat(u.cost_cents)
          : u.cost_cents;
      costByRequest.set(
        u.request_id,
        (costByRequest.get(u.request_id) ?? 0) + (Number.isFinite(v) ? v : 0)
      );
    }
  }

  // Counts for the filter pills.
  const { count: unreviewedCount } = await admin
    .from("support_requests")
    .select("id", { count: "exact", head: true })
    .eq("review_status", "unreviewed");
  const { count: flaggedCount } = await admin
    .from("support_requests")
    .select("id", { count: "exact", head: true })
    .eq("review_status", "flagged_bad");
  const { count: reviewedCount } = await admin
    .from("support_requests")
    .select("id", { count: "exact", head: true })
    .eq("review_status", "reviewed");

  const first100 = isFirstHundredMode();

  return (
    <main className="min-h-screen bg-cream/30 px-6 py-10">
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="space-y-2">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep inline-flex items-center gap-2">
            <ShieldCheck className="size-3" />
            Admin · Support conversations
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.8px] text-ink leading-tight">
            Tier 2 chat review queue
          </h1>
          <p className="text-[13px] text-slate-body">
            Every Claude support conversation across all customers. Click a row
            to read the transcript and mark it reviewed or flag it.{" "}
            {first100 ? (
              <span className="inline-flex items-center gap-1.5 text-warning font-semibold">
                <Clock className="size-3" />
                First-100 mode ON ({reviewedCount ?? 0} of 100 reviewed)
              </span>
            ) : (
              <span className="text-slate-meta">First-100 mode OFF</span>
            )}
          </p>
        </header>

        <nav className="flex items-center gap-1 flex-wrap text-[12px]">
          <FilterPill
            label={`All (${(unreviewedCount ?? 0) + (flaggedCount ?? 0) + (reviewedCount ?? 0)})`}
            href="/admin/support/conversations?review=all"
            active={reviewFilter === "all"}
          />
          <FilterPill
            label={`Flagged bad (${flaggedCount ?? 0})`}
            href="/admin/support/conversations?review=flagged_bad"
            active={reviewFilter === "flagged_bad"}
            tone="red"
          />
          <FilterPill
            label={`Unreviewed (${unreviewedCount ?? 0})`}
            href="/admin/support/conversations?review=unreviewed"
            active={reviewFilter === "unreviewed"}
            tone="amber"
          />
          <FilterPill
            label={`Reviewed (${reviewedCount ?? 0})`}
            href="/admin/support/conversations?review=reviewed"
            active={reviewFilter === "reviewed"}
          />
        </nav>

        {rows.length === 0 ? (
          <div className="border border-dashed border-[var(--rule-strong)] bg-card px-6 py-12 text-center text-[13px] text-slate-meta">
            No conversations match this filter.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const dso = r.dso_id ? dsoNames.get(r.dso_id) : null;
              const counts = turnCounts.get(r.id);
              const cents = costByRequest.get(r.id) ?? 0;
              return (
                <li key={r.id}>
                  <Link
                    href={`/admin/support/conversations/${r.id}`}
                    className="group flex items-start gap-3 border border-[var(--rule)] bg-card p-4 hover:border-heritage transition-colors"
                  >
                    <StatusBadge status={r.review_status} />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap text-[12px]">
                        <span className="font-bold text-ink">
                          {dso ?? "(no DSO)"}
                        </span>
                        <span className="text-slate-meta">·</span>
                        <span className="text-slate-meta uppercase tracking-[1px] text-[10px] font-bold">
                          {r.tier_snapshot ?? "?"}
                        </span>
                        <span className="text-slate-meta">·</span>
                        <span className="text-slate-meta">
                          {new Date(r.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-[14px] text-ink line-clamp-2">
                        {r.body}
                      </div>
                      {r.auto_flag_reason && (
                        <div className="text-[11.5px] text-danger inline-flex items-center gap-1.5">
                          <AlertTriangle className="size-3" />
                          {r.auto_flag_reason}
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-[11px] text-slate-meta">
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="size-3" />
                          {counts?.assistant ?? 0} turn
                          {(counts?.assistant ?? 0) === 1 ? "" : "s"}
                        </span>
                        {(counts?.tools ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Wrench className="size-3" />
                            {counts?.tools} tool call
                            {counts?.tools === 1 ? "" : "s"}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Sparkles className="size-3" />
                          {(cents / 100).toFixed(4)}$
                        </span>
                        {r.page_url && (
                          <span className="truncate max-w-[280px]">
                            {r.page_title ?? r.page_url}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-slate-meta group-hover:text-heritage-deep group-hover:translate-x-0.5 transition-all mt-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

function FilterPill({
  label,
  href,
  active,
  tone,
}: {
  label: string;
  href: string;
  active: boolean;
  tone?: "red" | "amber";
}) {
  const base =
    "inline-flex items-center px-3 py-1.5 border text-[11px] font-bold tracking-[1px] uppercase ";
  const toneActive =
    tone === "red"
      ? "border-danger bg-danger text-danger-foreground"
      : tone === "amber"
        ? "border-warning bg-warning text-warning-foreground"
        : "border-primary bg-primary text-primary-foreground";
  const toneIdle =
    tone === "red"
      ? "border-danger text-danger hover:bg-danger-bg"
      : tone === "amber"
        ? "border-warning text-warning hover:bg-warning-bg"
        : "border-[var(--rule-strong)] text-slate-body hover:bg-cream/60";
  return (
    <Link href={href} className={base + (active ? toneActive : toneIdle)}>
      {label}
    </Link>
  );
}

function StatusBadge({
  status,
}: {
  status: "unreviewed" | "reviewed" | "flagged_bad";
}) {
  if (status === "flagged_bad") {
    return (
      <div className="size-6 rounded-full bg-danger-bg flex items-center justify-center shrink-0">
        <AlertTriangle className="size-3.5 text-danger" />
      </div>
    );
  }
  if (status === "reviewed") {
    return (
      <div className="size-6 rounded-full bg-heritage/[0.12] flex items-center justify-center shrink-0">
        <CheckCircle2 className="size-3.5 text-heritage-deep" />
      </div>
    );
  }
  return (
    <div className="size-6 rounded-full bg-warning-bg flex items-center justify-center shrink-0">
      <Clock className="size-3.5 text-warning" />
    </div>
  );
}
