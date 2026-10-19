/* "DSO Hire customer" card on the account profile (2026-10-19). Shows the
   paying DSO this account is linked to and its live subscription, or a
   picker to link one (likely matches first). Linking an already-paying DSO
   runs the Stripe sync, so the account turns Customer and the deal closes
   Won. Reads the DSO list through the CRM session (dsos_crm_read policy);
   the subscription is read with the service-role client only after the
   CRM gate passed, because subscriptions has no CRM read policy. */

import { crmPageGate } from "@/lib/crm/auth";
import { rankDsosForAccount } from "@/lib/crm/match";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { periodFromStripePriceId } from "@/lib/stripe/prices";
import { PLAN_LABELS, fmtDate, fmtMoney, planMonthly } from "../../format";
import type { AccountLite } from "../lib";
import { linkAccountToDso, unlinkAccountFromDso } from "./dso-actions";

type DsoRec = {
  id: string;
  name: string;
  website: string | null;
  status: string | null;
  practice_count: number | null;
  headquarters_state: string | null;
};

type SubRec = {
  tier: string | null;
  status: string | null;
  stripe_price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
};

const SUB_STATUS: Record<string, string> = {
  active: "ACTIVE",
  trialing: "TRIAL",
  past_due: "PAST DUE",
  unpaid: "UNPAID",
  canceled: "CANCELED",
  incomplete: "INCOMPLETE",
  incomplete_expired: "EXPIRED",
  paused: "PAUSED",
};

export default async function DsoLinkCard({ a }: { a: Pick<AccountLite, "id" | "name" | "website" | "dso_id" | "archived_at"> }) {
  const gate = await crmPageGate(`/crm/accounts/${a.id}`);
  if (typeof gate === "string") return null;
  const { supabase } = gate;

  if (a.dso_id) {
    const { data: dsoData } = await supabase
      .from("dsos")
      .select("id, name, website, status, practice_count, headquarters_state")
      .eq("id", a.dso_id)
      .maybeSingle();
    const dso = dsoData as DsoRec | null;
    const admin = createSupabaseServiceRoleClient();
    const { data: subData } = await admin
      .from("subscriptions")
      .select("tier, status, stripe_price_id, current_period_end, cancel_at_period_end")
      .eq("dso_id", a.dso_id)
      .maybeSingle();
    const sub = subData as SubRec | null;
    const billing = sub?.stripe_price_id ? periodFromStripePriceId(sub.stripe_price_id) : null;
    const list = sub ? planMonthly(sub.tier, billing ?? "monthly") : null;
    const paying = sub?.status === "active" || sub?.status === "trialing";

    return (
      <div className="dcardx">
        <div className="ch">
          <h3>DSO Hire customer</h3>
          <a className="mini" href={`/admin/dso/${a.dso_id}`}>
            OPEN IN ADMIN
          </a>
        </div>
        <div className="kvrow">
          <span className="k2">DSO</span>
          <span className="v2">
            <b>{dso?.name ?? "Not found (deleted?)"}</b>
            {dso?.status ? <span className="pill navy" style={{ marginLeft: 8 }}>{dso.status.toUpperCase()}</span> : null}
          </span>
        </div>
        {dso?.practice_count ? (
          <div className="kvrow">
            <span className="k2">Practices</span>
            <span className="v2">{dso.practice_count}</span>
          </div>
        ) : null}
        <div className="kvrow">
          <span className="k2">Subscription</span>
          <span className="v2">
            {sub ? (
              <>
                {PLAN_LABELS[sub.tier ?? ""] ?? sub.tier ?? "Plan"}
                {billing ? `, ${billing}` : ""}
                {list ? ` (${fmtMoney(list)}/mo list)` : ""}
                <span className={`pill${paying ? " edc" : ""}`} style={{ marginLeft: 8 }}>
                  {SUB_STATUS[sub.status ?? ""] ?? (sub.status ?? "").toUpperCase()}
                </span>
              </>
            ) : (
              <span className="sl-dim">No subscription yet</span>
            )}
          </span>
        </div>
        {sub?.current_period_end ? (
          <div className="kvrow">
            <span className="k2">{sub.cancel_at_period_end ? "Ends" : "Renews"}</span>
            <span className={`v2${sub.cancel_at_period_end ? " sl-crit" : ""}`}>{fmtDate(sub.current_period_end)}</span>
          </div>
        ) : null}
        <form action={unlinkAccountFromDso} className="dform">
          <input type="hidden" name="account_id" value={a.id} />
          <div>
            <button className="dbtn dbtn-line dbtn-sm" type="submit">
              Unlink
            </button>
          </div>
        </form>
      </div>
    );
  }

  const [{ data: dsoRows }, { data: linkedRows }] = await Promise.all([
    supabase
      .from("dsos")
      .select("id, name, website, status, practice_count, headquarters_state")
      .eq("is_demo", false)
      .is("deleted_at", null)
      .order("name")
      .limit(2000),
    supabase.from("crm_accounts").select("dso_id").not("dso_id", "is", null).limit(5000),
  ]);
  const linked = new Set(((linkedRows ?? []) as { dso_id: string }[]).map((r) => r.dso_id));
  const available = ((dsoRows ?? []) as DsoRec[]).filter((d) => !linked.has(d.id));
  const { suggested, rest } = rankDsosForAccount(a, available);
  const label = (d: DsoRec) =>
    [d.name, d.headquarters_state, d.practice_count ? `${d.practice_count} practices` : null, d.status]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="dcardx">
      <div className="ch">
        <h3>DSO Hire customer</h3>
        <span className="mini">{suggested.length ? `${suggested.length} LIKELY MATCH${suggested.length === 1 ? "" : "ES"}` : "NOT LINKED"}</span>
      </div>
      {available.length === 0 ? (
        <div className="empty-note">No unlinked DSOs on DSO Hire yet. When this group signs up and pays, it links on its own.</div>
      ) : (
        <form action={linkAccountToDso} className="dform">
          <input type="hidden" name="account_id" value={a.id} />
          <div>
            <label htmlFor={`dl-${a.id}`}>LINK TO DSO</label>
            <select id={`dl-${a.id}`} name="dso_id" defaultValue={suggested[0]?.id ?? ""} required>
              <option value="">Pick a DSO</option>
              {suggested.length ? (
                <optgroup label="Likely matches">
                  {suggested.map((d) => (
                    <option key={d.id} value={d.id}>
                      {label(d)}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <optgroup label={suggested.length ? "All other DSOs" : "All DSOs"}>
                {rest.map((d) => (
                  <option key={d.id} value={d.id}>
                    {label(d)}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <p className="ac-hint">
            Payments link on their own when the name or website matches. If the DSO already pays, linking marks this
            account a Customer and closes the open opportunity as Won.
          </p>
          <div>
            <button className="dbtn dbtn-green dbtn-sm" type="submit" disabled={!!a.archived_at}>
              Link DSO
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
