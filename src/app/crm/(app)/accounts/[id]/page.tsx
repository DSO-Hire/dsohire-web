import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { crmPageGate } from "@/lib/crm/auth";
import { UUID_RE } from "@/lib/crm/events";
import ActionError from "../../ActionError";
import StickyIdentity from "../../StickyIdentity";
import { photoClass, photoStyle } from "../../avatars";
import { fmtDate, initialsOf, todayIso } from "../../format";
import { restoreAccount } from "../actions";
import { demoKeysFor, demoLinkFor, hostOf, hrefOf, type AccountLite, type DemoVisit } from "../lib";
import { FitPill, StatusPill, Warmth } from "../ui";
import Activity from "./Activity";
import Contacts from "./Contacts";
import Overview from "./Overview";
import type { ContactRec, EventRec, OppRec, SectionProps, TaskRec } from "./types";
import "../accounts.css";

const TABS: [string, string][] = [
  ["overview", "Overview"],
  ["contacts", "Contacts"],
  ["activity", "Activity"],
];

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Account" };
  const gate = await crmPageGate(`/crm/accounts/${id}`);
  if (typeof gate === "string") return { title: "Account" };
  const { data } = await gate.supabase.from("crm_accounts").select("name").eq("id", id).maybeSingle();
  return { title: (data?.name as string | undefined) ?? "Account" };
}

export default async function AccountProfile({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const raw = await searchParams;
  const sp: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) sp[k] = (Array.isArray(v) ? v[0] : v)?.slice(0, 400);
  if (!UUID_RE.test(id)) notFound();

  const gate = await crmPageGate(`/crm/accounts/${id}`);
  if (gate === "denied" || gate === "needs_mfa") return null;
  const { supabase, me, admin } = gate;
  const tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as string) : "overview";

  const [acctRes, contactsRes, oppsRes, openTasksRes, doneTasksRes, eventsRes] = await Promise.all([
    supabase.from("crm_accounts").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("crm_contacts")
      .select("id, name, title, role, email, phone, linkedin_url, notes, created_at")
      .eq("account_id", id)
      .order("created_at"),
    supabase
      .from("crm_opportunities")
      .select(
        "id, name, stage, plan_tier, billing, mrr, next_step, next_step_due, primary_contact_id, won_at, lost_at, created_at, updated_at",
      )
      .eq("account_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("crm_tasks")
      .select("id, title, ball, priority, due_date, completed_at, contact_id, opportunity_id, owner_id, created_at")
      .eq("account_id", id)
      .is("completed_at", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(100),
    supabase
      .from("crm_tasks")
      .select("id, title, ball, priority, due_date, completed_at, contact_id, opportunity_id, owner_id, created_at")
      .eq("account_id", id)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(8),
    supabase
      .from("crm_events")
      .select("id, kind, body, meta, occurred_at, contact_id, opportunity_id, created_by")
      .eq("account_id", id)
      .order("occurred_at", { ascending: false })
      .limit(200),
  ]);
  const a = acctRes.data as AccountLite | null;
  if (!a) notFound();

  /* the demo opens for this group's personalized link */
  const keys = demoKeysFor(a);
  const { data: visitRows } = keys.length
    ? await supabase
        .from("demo_visits")
        .select("for_key, for_label, visits, created_at, last_seen_at")
        .in("for_key", keys)
        .order("last_seen_at", { ascending: false })
        .limit(1)
    : { data: [] };
  const demo = ((visitRows ?? [])[0] as DemoVisit | undefined) ?? null;

  const props: SectionProps = {
    a,
    contacts: (contactsRes.data ?? []) as ContactRec[],
    opps: (oppsRes.data ?? []) as OppRec[],
    openTasks: (openTasksRes.data ?? []) as TaskRec[],
    doneTasks: (doneTasksRes.data ?? []) as TaskRec[],
    events: (eventsRes.data ?? []) as EventRec[],
    demo,
    demoLink: demoLinkFor(a.name),
    today: todayIso(),
    me,
    admin,
    sp,
  };

  const openOpp = props.opps.find((o) => o.stage !== "won" && o.stage !== "lost") ?? null;
  const host = hostOf(a.website);
  const sub =
    [
      a.locations ? `${a.locations} ${a.locations === 1 ? "location" : "locations"}` : null,
      a.open_roles !== null && a.open_roles !== undefined ? `${a.open_roles} open roles` : null,
      a.hq_state ? `HQ ${a.hq_state}` : null,
      a.current_tool ? `Hiring on ${a.current_tool}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Dental group";
  const due = a.next_step_due ? String(a.next_step_due).slice(0, 10) : null;
  const tabHref = (k: string) => (k === "overview" ? `/crm/accounts/${a.id}` : `/crm/accounts/${a.id}?tab=${k}`);
  const initials = a.name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "AC";
  const counts: Record<string, number> = { contacts: props.contacts.length, activity: props.events.length };

  return (
    <>
      <StickyIdentity watch="profile-hero">
        <span className="sid-logo" aria-hidden="true">
          <span>{initials}</span>
        </span>
        <span className="sid-id">
          <b>{a.name}</b>
          <span>{sub}</span>
        </span>
        <span className="sid-pills">
          <StatusPill status={a.status} topOpp={openOpp} />
        </span>
        <span className="sid-right">
          <nav className="sid-tabs" aria-label="Account profile sections">
            {TABS.map(([k, label]) => (
              <Link key={k} href={tabHref(k)} className={tab === k ? "on" : undefined}>
                {label}
              </Link>
            ))}
          </nav>
          <a className="sid-top" href="#profile-hero">
            ↑ TOP
          </a>
        </span>
      </StickyIdentity>
      <ActionError error={sp.error} />
      {a.archived_at ? (
        <div className="sl-banner ac-arch-banner">
          <span>Archived {fmtDate(a.archived_at)}. It is off the list, the pipeline and Today.</span>
          <form action={restoreAccount}>
            <input type="hidden" name="account_id" value={a.id} />
            <button className="dbtn dbtn-line dbtn-sm" type="submit">
              Restore account
            </button>
          </form>
        </div>
      ) : null}
      <div className="profile-hero" id="profile-hero">
        <div className="ph-logo">
          <span>{initials}</span>
        </div>
        <div className="ph-id">
          <h1>{a.name}</h1>
          <div className="ph-sub">{sub}</div>
          <div className="ph-links">
            {a.website && host ? (
              <a href={hrefOf(a.website)} target="_blank" rel="noreferrer">
                {host} ⇗
              </a>
            ) : null}
            {a.hiring_owner_title ? <span>Hiring owned by {a.hiring_owner_title}</span> : null}
            <Link href="/crm/accounts">All accounts</Link>
          </div>
        </div>
        <div className="ph-side">
          <div className="sl-herochips">
            <StatusPill status={a.status} topOpp={openOpp} />
            <FitPill tier={a.fit_tier} />
            <Warmth value={a.warmth} />
            {a.owner_id === me ? (
              <span className="mini2" title={admin.email ?? ""}>
                <span className={`ownchip${photoClass(admin)}`} style={photoStyle(admin, { marginRight: 6 })}>
                  {initialsOf(admin)}
                </span>
                YOU
              </span>
            ) : (
              <span className="mini2">{a.owner_id ? "ANOTHER ADMIN" : "UNASSIGNED"}</span>
            )}
          </div>
          <span className={`mini2${due && due < props.today ? " sl-crit" : ""}`}>
            {due
              ? `NEXT STEP ${fmtDate(due).toUpperCase()}${due < props.today ? " · OVERDUE" : ""}`
              : "NO NEXT STEP SET"}
          </span>
          {a.next_step ? <span className="ac-hero-next">{a.next_step}</span> : null}
          <span className="mini2">ON FILE SINCE {fmtDate(a.created_at).toUpperCase()}</span>
          <Link className="dbtn dbtn-green dbtn-sm" href={`/crm/accounts/${a.id}?tab=activity&compose=1#compose`}>
            Compose email
          </Link>
        </div>
      </div>

      <nav className="sl-tabs" aria-label="Account profile sections">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={tabHref(k)}
            className={tab === k ? "on" : undefined}
            aria-current={tab === k ? "page" : undefined}
          >
            {label}
            {counts[k] ? <span className="sl-tabn">{counts[k]}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "contacts" ? <Contacts {...props} /> : tab === "activity" ? <Activity {...props} /> : <Overview {...props} />}
    </>
  );
}
