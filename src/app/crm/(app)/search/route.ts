import { NextResponse, type NextRequest } from "next/server";
import { requireCrmAdmin } from "@/lib/crm/auth";
import { ACCOUNT_STATUS_LABELS, LEAD_KIND_LABELS, SALES_LEAD_KINDS, fmtDate, stageLabel } from "../format";

/*
 * GET /crm/search?q= : the Cmd-K palette's global search. Re-checks
 * superadmin + aal2 here, and RLS stays the real gate underneath. Only
 * names, emails, places and companies are searched, never notes or bodies.
 */

export type SearchItem = { id: string; label: string; sub: string; href: string };
export type SearchGroup = { type: string; label: string; items: SearchItem[] };

const NO_STORE = { "Cache-Control": "no-store" };
const LIMIT = 6;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/* Strip PostgREST .or() and LIKE metacharacters so a comma or a paren in
   the query cannot break (or widen) the filter string. */
function sanitizeQuery(raw: string | null): string | null {
  const s = String(raw ?? "")
    .slice(0, 60)
    .replace(/[%_,()*\\:"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length >= 2 ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await requireCrmAdmin();
  if (!session) return json({ error: "Sign in with your second factor first." }, 401);
  const { supabase } = session;

  const s = sanitizeQuery(req.nextUrl.searchParams.get("q"));
  const only = req.nextUrl.searchParams.get("type");
  if (!s) return json({ groups: [] });
  const p = `%${s}%`;
  const want = (t: string) => !only || only === t;
  const empty = Promise.resolve({ data: [] as Record<string, unknown>[] });

  const [acctRes, oppRes, contactsRes, leadsRes] = await Promise.all([
    want("account")
      ? supabase
          .from("crm_accounts")
          .select("id, name, hq_state, locations, status")
          .is("archived_at", null)
          .or(`name.ilike.${p},website.ilike.${p},hq_state.ilike.${p},current_tool.ilike.${p}`)
          .order("updated_at", { ascending: false })
          .limit(LIMIT)
      : empty,
    want("opportunity")
      ? supabase
          .from("crm_opportunities")
          .select("id, name, stage, crm_accounts(name)")
          .ilike("name", p)
          .order("updated_at", { ascending: false })
          .limit(LIMIT)
      : empty,
    want("contact")
      ? supabase
          .from("crm_contacts")
          .select("id, name, title, account_id, crm_accounts(name)")
          .or(`name.ilike.${p},email.ilike.${p},title.ilike.${p}`)
          .limit(LIMIT)
      : empty,
    want("lead")
      ? supabase
          .from("marketing_leads")
          .select("id, kind, name, company, contact, created_at")
          .in("kind", SALES_LEAD_KINDS)
          .or(`name.ilike.${p},company.ilike.${p},contact.ilike.${p}`)
          .order("created_at", { ascending: false })
          .limit(LIMIT)
      : empty,
  ]);

  const groups: SearchGroup[] = [];

  type AcctRow = { id: string; name: string; hq_state: string | null; locations: number | null; status: string };
  const accts = (acctRes.data ?? []) as unknown as AcctRow[];
  if (accts.length)
    groups.push({
      type: "account",
      label: "Accounts",
      items: accts.map((a) => ({
        id: a.id,
        label: a.name,
        sub: [
          ACCOUNT_STATUS_LABELS[a.status] ?? a.status,
          a.hq_state,
          a.locations ? `${a.locations} locations` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        href: `/crm/accounts/${a.id}`,
      })),
    });

  type OppRow = { id: string; name: string; stage: string; crm_accounts: { name?: string } | null };
  const opps = (oppRes.data ?? []) as unknown as OppRow[];
  if (opps.length)
    groups.push({
      type: "opportunity",
      label: "Opportunities",
      items: opps.map((o) => ({
        id: o.id,
        label: o.name,
        sub: [stageLabel(o.stage), o.crm_accounts?.name !== o.name ? o.crm_accounts?.name : null]
          .filter(Boolean)
          .join(" · "),
        href: `/crm/opportunities/${o.id}`,
      })),
    });

  type ContactRow = { id: string; name: string; title: string | null; account_id: string; crm_accounts: { name?: string } | null };
  const contacts = (contactsRes.data ?? []) as unknown as ContactRow[];
  if (contacts.length)
    groups.push({
      type: "contact",
      label: "Contacts",
      items: contacts.map((c) => ({
        id: c.id,
        label: c.name,
        sub: [c.title, c.crm_accounts?.name].filter(Boolean).join(" · "),
        href: `/crm/accounts/${c.account_id}`,
      })),
    });

  type LeadRow = { id: string; kind: string; name: string | null; company: string | null; contact: string; created_at: string };
  const leads = (leadsRes.data ?? []) as unknown as LeadRow[];
  if (leads.length)
    groups.push({
      type: "lead",
      label: "Website leads",
      items: leads.map((l) => ({
        id: l.id,
        label: l.company || l.name || l.contact,
        sub: [LEAD_KIND_LABELS[l.kind] ?? l.kind, fmtDate(l.created_at)].join(" · "),
        href: `/crm/inbox?lead=${l.id}`,
      })),
    });

  return json({ groups });
}
