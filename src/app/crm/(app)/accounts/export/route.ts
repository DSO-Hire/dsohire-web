import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/crm/auth";
import { oppMrr, todayIso } from "../../format";
import {
  csvCell,
  enrichAccounts,
  filterAccounts,
  filtersFrom,
  sortAccounts,
  type AccountLite,
  type DemoVisit,
  type OppLite,
} from "../lib";

/*
 * The account list as CSV, filtered and sorted exactly like the screen
 * (ported from the EDC CRM's sellers/export). Superadmin + aal2 only; RLS
 * enforces the same rule again underneath. Long free text (notes, signals)
 * stays in the CRM; the next step travels because it is the call sheet.
 */
export async function GET(req: Request) {
  const session = await requireCrmAdmin();
  if (!session) return new NextResponse("Sign in to the CRM with your second factor first.", { status: 403 });
  const { supabase, me } = session;

  const sp = new URL(req.url).searchParams;
  const get = (k: string) => (sp.get(k) ?? "").slice(0, 100) || undefined;
  const archived = get("archived") === "1";

  let acctQ = supabase.from("crm_accounts").select("*").order("created_at", { ascending: false }).limit(5000);
  acctQ = archived ? acctQ.not("archived_at", "is", null) : acctQ.is("archived_at", null);
  const [acctRes, oppRes, visitRes] = await Promise.all([
    acctQ,
    supabase.from("crm_opportunities").select("id, account_id, name, stage, plan_tier, billing, mrr").limit(10000),
    supabase.from("demo_visits").select("for_key, for_label, visits, last_seen_at").not("for_key", "is", null).limit(10000),
  ]);
  if (acctRes.error) {
    return new NextResponse(`The export did not run: ${acctRes.error.message}`, { status: 500 });
  }

  const rows = sortAccounts(
    filterAccounts(
      enrichAccounts(
        (acctRes.data ?? []) as AccountLite[],
        (oppRes.data ?? []) as OppLite[],
        (visitRes.data ?? []) as DemoVisit[],
      ),
      filtersFrom(get),
      { me, today: todayIso() },
    ),
    get("sort"),
    get("dir"),
  );

  const COLS = [
    "name",
    "website",
    "hq_state",
    "states",
    "locations",
    "open_roles",
    "current_tool",
    "hiring_owner_title",
    "fit_tier",
    "status",
    "source",
    "warmth",
    "owner",
    "last_touch_at",
    "next_step",
    "next_step_due",
    "do_not_contact_at",
    "do_not_contact_reason",
    "open_opportunity_stage",
    "open_opportunity_plan",
    "open_opportunity_mrr",
    "demo_opens",
    "demo_last_seen",
    "researched_on",
    "created_at",
    "archived_at",
  ];
  const lines = [COLS.join(",")];
  for (const r of rows) {
    const rec: Record<string, unknown> = {
      ...r,
      owner: r.owner_id === me ? "me" : r.owner_id ? "other admin" : "",
      open_opportunity_stage: r.topOpp?.stage ?? "",
      open_opportunity_plan: r.topOpp?.plan_tier ?? "",
      open_opportunity_mrr: r.topOpp ? oppMrr(r.topOpp) || "" : "",
      demo_opens: r.demo?.visits ?? "",
      demo_last_seen: r.demo?.last_seen_at ?? "",
    };
    lines.push(COLS.map((c) => csvCell(rec[c])).join(","));
  }

  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dsohire-accounts-${todayIso()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
