/* Server mount for the compose panel (2026-10-19): reads the templates and
   the workspace signature, builds the account's merge values and the list
   of templates already logged, then hands off to the client panel. Kept
   out of page.tsx so the profile's own queries stay untouched. */

import { crmPageGate } from "@/lib/crm/auth";
import Compose, { type ComposeContact, type SentRec } from "./Compose";
import { calcLinkFor, signalPlaceholder, type TemplateRec } from "./compose-lib";
import type { SectionProps } from "./types";

export default async function ComposeSection({
  a,
  contacts,
  events,
  demoLink,
  sp,
}: Pick<SectionProps, "a" | "contacts" | "events" | "demoLink" | "sp">) {
  const gate = await crmPageGate(`/crm/accounts/${a.id}`);
  if (typeof gate === "string") return null;
  const { supabase } = gate;
  const [tplRes, setRes] = await Promise.all([
    supabase
      .from("crm_email_templates")
      .select("id, key, name, channel, subject, body, next_step_days, next_step, sort, archived_at")
      .order("sort")
      .order("name"),
    supabase.from("crm_workspace_settings").select("email_signature, mailing_address").eq("id", true).maybeSingle(),
  ]);
  const all = (tplRes.data ?? []) as TemplateRec[];
  const templates = all.filter((t) => !t.archived_at);
  const settings = (setRes.data ?? {}) as { email_signature?: string | null; mailing_address?: string | null };

  const names = new Map(all.map((t) => [t.key, t.name]));
  const contactName = new Map(contacts.map((c) => [c.id, c.name]));
  const sent: SentRec[] = [];
  for (const e of events) {
    if (e.kind !== "email" && e.kind !== "linkedin") continue;
    const key = e.meta && typeof e.meta.template_key === "string" ? e.meta.template_key : null;
    if (!key) continue;
    sent.push({
      id: e.id,
      key,
      name: names.get(key) ?? key,
      at: e.occurred_at,
      contact: e.contact_id ? (contactName.get(e.contact_id) ?? null) : null,
    });
  }

  const signal = (a.hiring_signal ?? "").trim() || (a.growth_signal ?? "").trim();
  const recipients: ComposeContact[] = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title,
    role: c.role,
    email: c.email,
    linkedin_url: c.linkedin_url,
  }));

  return (
    <Compose
      accountId={a.id}
      group={a.name}
      templates={templates}
      contacts={recipients}
      sent={sent}
      vars={{
        group: a.name,
        demo_link: demoLink ?? "",
        calc_link: calcLinkFor(a.locations, a.open_roles),
        signal: signal || signalPlaceholder(a.name),
        referrer: "",
      }}
      hasSignal={!!signal}
      signature={settings.email_signature ?? ""}
      mailingAddress={settings.mailing_address ?? ""}
      footerAvailable={!setRes.error}
      templatesAvailable={!tplRes.error}
      initiallyOpen={sp.compose === "1"}
    />
  );
}
