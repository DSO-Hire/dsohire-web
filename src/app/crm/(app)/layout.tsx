import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-mark";
import { crmPageGate } from "@/lib/crm/auth";
import { photoClass, photoStyle } from "./avatars";
import CrmNav, { type NavBadge } from "./CrmNav";
import CrmPrefs, { type CrmPrefValues } from "./CrmPrefs";
import NotificationsBell, { type BellEvent } from "./NotificationsBell";
import CrmCmdK from "./CrmCmdK";
import CrmKeys from "./CrmKeys";
import { SALES_LEAD_KINDS, initialsOf, nowMs, todayIso } from "./format";
import "./workspace.css";

function Gate({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return (
    <div className="gate-wrap">
      <div className="gate" style={{ textAlign: "center" }}>
        <div className="glogo">
          <BrandMark className="size-[54px]" />
        </div>
        <h1>{title}</h1>
        <div className="gnote">{body}</div>
        {action}
      </div>
    </div>
  );
}

export default async function CrmAppLayout({ children }: { children: React.ReactNode }) {
  const gate = await crmPageGate("/crm");
  if (gate === "denied") {
    return (
      <Gate
        title="No access"
        body="The CRM is limited to DSO Hire founders. Your sign-in worked, but this account is not on the list."
        action={
          <form action="/employer/sign-out" method="post">
            <button className="gbtn" type="submit">
              Sign out
            </button>
          </form>
        }
      />
    );
  }
  if (gate === "needs_mfa") {
    return (
      <Gate
        title="Turn on two-factor first"
        body="The CRM holds prospect and pipeline data, so it requires an authenticator code on every session. Set one up, then come back."
        action={
          <Link className="gbtn" href="/auth/mfa/setup">
            Set up two-factor
          </Link>
        }
      />
    );
  }

  const { supabase, me, admin } = gate;
  const today = todayIso();

  /* Everything the shell needs in one round of bounded queries: the bell
     (14 days), the nav badges (head counts, 30-day inbox), and my prefs. */
  const now = nowMs();
  const since14 = new Date(now - 14 * 86_400_000).toISOString();
  const since30 = new Date(now - 30 * 86_400_000).toISOString();
  const mineOrUnowned = `owner_id.eq.${me},owner_id.is.null`;
  const [prefsRes, readsRes, leadsRes, demosRes, overdueRes, overdueCountRes, dueTodayCountRes, leads30Res] =
    await Promise.all([
      supabase.from("crm_user_prefs").select("density, motion, bell_seen_at").eq("user_id", me).maybeSingle(),
      supabase
        .from("crm_notification_reads")
        .select("event_key")
        .eq("user_id", me)
        .gte("read_at", since30)
        .limit(500),
      supabase
        .from("marketing_leads")
        .select("id, kind, name, company, contact, created_at")
        .in("kind", SALES_LEAD_KINDS)
        .neq("status", "spam")
        .gte("created_at", since14)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("demo_visits")
        .select("id, for_label, for_key, visits, last_seen_at")
        .not("for_key", "is", null)
        .neq("for_key", "qa-probe")
        .gte("last_seen_at", since14)
        .order("last_seen_at", { ascending: false })
        .limit(10),
      supabase
        .from("crm_tasks")
        .select("id, title, due_date, account_id, crm_accounts(name)")
        .is("completed_at", null)
        .lt("due_date", today)
        .or(mineOrUnowned)
        .order("due_date")
        .limit(8),
      supabase
        .from("crm_tasks")
        .select("id", { count: "exact", head: true })
        .is("completed_at", null)
        .lt("due_date", today)
        .or(mineOrUnowned),
      supabase
        .from("crm_tasks")
        .select("id", { count: "exact", head: true })
        .is("completed_at", null)
        .eq("due_date", today)
        .or(mineOrUnowned),
      supabase
        .from("marketing_leads")
        .select("id, crm_lead_triage(status)")
        .in("kind", SALES_LEAD_KINDS)
        .neq("status", "spam")
        .gte("created_at", since30)
        .limit(300),
    ]);

  const KIND_COPY: Record<string, string> = {
    demo_request: "Demo request",
    calculator: "Calculator lead",
    contact: "New inquiry",
  };
  const events: BellEvent[] = [];
  for (const l of leadsRes.data ?? []) {
    const who = l.company || l.name || l.contact;
    events.push({
      id: `lead-${l.id}`,
      ts: l.created_at,
      text: `${KIND_COPY[l.kind] ?? "New lead"} · ${who}`,
      href: `/crm/inbox?lead=${l.id}`,
      kind: "lead",
    });
  }
  /* Keyed by visit count, so a group opening the demo again rings again. */
  for (const d of demosRes.data ?? []) {
    events.push({
      id: `demo-${d.id}-${d.visits}`,
      ts: d.last_seen_at,
      text:
        d.visits > 1
          ? `${d.for_label ?? d.for_key} opened the demo again (${d.visits} opens)`
          : `${d.for_label ?? d.for_key} opened their demo link`,
      href: `/crm/inbox?tab=demos`,
      kind: "demo",
    });
  }
  for (const t of overdueRes.data ?? []) {
    const acct = (t.crm_accounts as { name?: string } | null)?.name;
    events.push({
      id: `task-${t.id}`,
      ts: `${t.due_date}T12:00:00Z`,
      text: `Overdue: ${t.title}${acct ? ` (${acct})` : ""}`,
      href: t.account_id ? `/crm/accounts/${t.account_id}` : "/crm/tasks",
      kind: "task",
    });
  }
  events.sort((x, y) => new Date(y.ts).getTime() - new Date(x.ts).getTime());
  const bellEvents = events.slice(0, 20);

  const prefsOk = !prefsRes.error;
  const prefs = prefsRes.data as { density?: string; motion?: string; bell_seen_at?: string | null } | null;
  const seenAt = prefsOk ? (prefs?.bell_seen_at ?? null) : undefined;
  const readKeys = !readsRes.error ? (readsRes.data ?? []).map((r) => r.event_key as string) : [];
  const serverPrefs: CrmPrefValues | null =
    prefsOk &&
    prefs &&
    (prefs.density === "compact" || prefs.density === "comfortable") &&
    (prefs.motion === "full" || prefs.motion === "reduced")
      ? { density: prefs.density, motion: prefs.motion }
      : null;

  const overdueN = overdueCountRes.count ?? 0;
  const dueTodayN = dueTodayCountRes.count ?? 0;
  /* the Inbox badge counts leads nobody has worked yet (untriaged or still New) */
  const triageOf = (s: { crm_lead_triage?: unknown }) => {
    const t = s.crm_lead_triage as { status?: string } | { status?: string }[] | null | undefined;
    return (Array.isArray(t) ? t[0]?.status : t?.status) ?? "new";
  };
  const newLeads = (leads30Res.data ?? []).filter((s) => triageOf(s) === "new").length;
  const badges: Partial<Record<string, NavBadge>> = {
    "/crm": {
      count: overdueN + dueTodayN,
      crit: overdueN > 0,
      label: [overdueN ? `${overdueN} overdue` : "", dueTodayN ? `${dueTodayN} due today` : ""]
        .filter(Boolean)
        .join(", "),
    },
    "/crm/inbox": { count: newLeads, label: `${newLeads} new ${newLeads === 1 ? "lead" : "leads"}` },
  };

  const fullName = admin.full_name || admin.email || "";

  return (
    <div className="crm-app">
      <a className="ws-skip" href="#crm-content">
        Skip to content
      </a>
      <aside className="crm-side" aria-label="CRM">
        <div className="side-brand">
          <BrandMark dark className="size-[30px]" />
          <div className="wm">
            <b>DSO&nbsp;HIRE&nbsp;CRM</b>
            <span>SALES&nbsp;WORKSPACE</span>
          </div>
        </div>
        <CrmNav badges={badges} />
        <CrmPrefs server={serverPrefs} />
        <div className="side-foot">
          <div>
            <span className="dot">●</span>&nbsp;RLS ENFORCED · 2FA SESSION
          </div>
          <div>{(admin.email ?? "").toUpperCase()}</div>
          <Link className="side-acct" href="/admin">
            ADMIN CONSOLE →
          </Link>
          <form action="/employer/sign-out" method="post">
            <button type="submit">SIGN OUT →</button>
          </form>
        </div>
      </aside>
      <div className="crm-main">
        <div className="crm-topbar" role="banner">
          <span className="crumb">DSO HIRE CRM</span>
          <span className="env">FOUNDER WORKSPACE · TOTP VERIFIED</span>
          <NotificationsBell events={bellEvents} seenAt={seenAt} readKeys={readKeys} />
          <CrmCmdK />
          <CrmKeys />
          <div className="avatars">
            <span
              className={`av cam${photoClass(admin)}`}
              style={photoStyle(admin)}
              title={fullName}
              aria-label={`Signed in as ${fullName}`}
              role="img"
            >
              {initialsOf(admin)}
            </span>
          </div>
        </div>
        <main className="crm-content" id="crm-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
