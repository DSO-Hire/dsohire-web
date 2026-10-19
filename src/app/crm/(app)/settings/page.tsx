import Link from "next/link";
import { crmPageGate } from "@/lib/crm/auth";
import { ShortcutTable } from "../CrmKeys";
import { DEFAULT_STAGE_WEIGHTS, fmtDate, parseStageWeights, TEMPLATE_STAGES } from "../format";
import type { TemplateRec } from "../accounts/[id]/compose-lib";
import PrefsCard, { type InitialPrefs, type ServerPrefs } from "./PrefsCard";
import SignatureCard from "./SignatureCard";
import TemplatesCard from "./TemplatesCard";
import WeightsCard from "./WeightsCard";

export const metadata = { title: "Settings" };

/* Settings: my synced preferences, the workspace pipeline weights,
   keyboard shortcuts, and the fixed workspace facts. Password and
   two-factor live on the site's own account pages. */
export default async function Settings() {
  const gate = await crmPageGate("/crm/settings");
  if (typeof gate === "string") return null;
  const { supabase, me } = gate;
  const [prefsRes, settingsRes, tplRes, sigRes] = await Promise.all([
    supabase
      .from("crm_user_prefs")
      .select("density, motion, today_scope, quiet_after_days")
      .eq("user_id", me)
      .maybeSingle(),
    supabase.from("crm_workspace_settings").select("stage_weights, updated_at").maybeSingle(),
    supabase
      .from("crm_email_templates")
      .select("id, key, name, channel, subject, body, next_step_days, next_step, sort, archived_at")
      .order("sort")
      .order("name"),
    supabase.from("crm_workspace_settings").select("email_signature, mailing_address").eq("id", true).maybeSingle(),
  ]);
  const sig = (sigRes.data ?? null) as { email_signature?: string | null; mailing_address?: string | null } | null;

  const p = (prefsRes.data ?? {}) as { [K in keyof ServerPrefs]?: ServerPrefs[K] | null };
  const initial: InitialPrefs = {
    density: p.density === "compact" || p.density === "comfortable" ? p.density : null,
    motion: p.motion === "reduced" || p.motion === "full" ? p.motion : null,
    today_scope: p.today_scope === "all" ? "all" : "mine",
    quiet_after_days: Number(p.quiet_after_days) || 7,
  };

  const stages = TEMPLATE_STAGES.filter((s) => s !== "won");
  const stored = parseStageWeights((settingsRes.data as { stage_weights?: unknown } | null)?.stage_weights);
  const weights: Record<string, number> = {};
  for (const s of stages) weights[s] = stored[s] ?? DEFAULT_STAGE_WEIGHTS[s] ?? 0;
  const s = settingsRes.data as { updated_at?: string } | null;
  const lastChanged = Object.keys(stored).length && s?.updated_at ? `Last changed ${fmtDate(s.updated_at)}.` : null;

  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
        <span className="sub2">Your preferences, plus the pipeline weights, email templates and signature the whole workspace uses.</span>
      </div>

      <PrefsCard initial={initial} synced={!prefsRes.error} />

      <WeightsCard stages={stages} initial={weights} lastChanged={lastChanged} available={!settingsRes.error} />

      <TemplatesCard templates={(tplRes.data ?? []) as TemplateRec[]} available={!tplRes.error} />

      <SignatureCard
        signature={sig?.email_signature ?? ""}
        mailingAddress={sig?.mailing_address ?? ""}
        available={!sigRes.error && !!sig}
      />

      <section className="dcardx ws-set" aria-labelledby="ws-keys-h">
        <div className="ch">
          <h3 id="ws-keys-h">Keyboard shortcuts</h3>
          <span className="mini">PRESS ? ANYWHERE</span>
        </div>
        <ShortcutTable />
      </section>

      <div className="dcardx" style={{ maxWidth: "40rem", marginTop: "0.875rem" }} id="account">
        <div className="ch">
          <h3>Workspace</h3>
          <span className="mini">FIXED BY DESIGN</span>
        </div>
        <div className="kvrow">
          <span className="k2">Access</span>
          <span className="v2">DSO Hire superadmins only · no self-signup</span>
        </div>
        <div className="kvrow">
          <span className="k2">Second factor</span>
          <span className="v2">Authenticator code required every session (enforced in the database too)</span>
        </div>
        <div className="kvrow">
          <span className="k2">Lead sources</span>
          <span className="v2">
            Website leads and demo opens, read-only from the{" "}
            <Link className="ws-link" href="/admin/leads">
              admin leads page
            </Link>
          </span>
        </div>
      </div>
    </>
  );
}
