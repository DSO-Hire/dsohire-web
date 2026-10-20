#!/usr/bin/env node
/**
 * One-time import of the July 2026 single-file CRM (~/DSO Hire/DSO Hire CRM,
 * dsohire-crm-data.json, v4) into the /crm tables, plus the never-applied
 * Updates-Inbox/warm_edc_contacts_2026-07-27.json merge.
 *
 * Rules: never overwrite a field already set in /crm; add contacts only when
 * the email (or name, when no email) isn't on the account yet; old activities
 * become note events tagged meta.source = "legacy_crm". Re-runs are no-ops
 * (accounts matched by name, events skipped when legacy ids already exist).
 * Candidates are skipped: the supply side now lives in the product itself.
 *
 *   node scripts/crm-import-legacy.mjs            # dry run
 *   node scripts/crm-import-legacy.mjs --apply
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const DIR = join(homedir(), "DSO Hire", "DSO Hire CRM");
const TODAY = "2026-10-20";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const data = JSON.parse(readFileSync(join(DIR, "dsohire-crm-data.json"), "utf8"));
const warm = JSON.parse(readFileSync(join(DIR, "Updates-Inbox", "warm_edc_contacts_2026-07-27.json"), "utf8"));
const old = data.records.filter((r) => r.type === "dso" && !r.isExample);

// Apply the warm-EDC merge to the legacy records first.
for (const u of warm.updates) {
  const rec = old.find((r) => r.name.toLowerCase().startsWith(u.match.name.toLowerCase()));
  if (!rec) continue;
  rec.temperature = u.setTemperature ?? rec.temperature;
  if (u.setNextAction) rec.nextAction = u.setNextAction;
  rec.contacts = [...(u.addContacts ?? []), ...(rec.contacts ?? []).map((c) => ({ ...c, primary: u.addContacts?.length ? false : c.primary }))];
  rec.tags = [...new Set([...(rec.tags ?? []), ...(u.addTags ?? [])])];
  rec.activities = [...(rec.activities ?? []), ...(u.addActivities ?? []).map((a, i) => ({ ...a, id: `warm-edc-${rec.id}-${i}` }))];
  rec.warmEdc = true;
}

const ALIASES = { "dental associates (wisconsin)": "dental associates" };
const key = (s) => (ALIASES[s.toLowerCase()] ?? s.toLowerCase()).replace(/[^a-z0-9]/g, "");

const STATE_CODES = { texas: "TX", florida: "FL", california: "CA" };
const stateOf = (s) => (!s ? null : s.length === 2 ? s.toUpperCase() : STATE_CODES[s.toLowerCase()] ?? s.slice(0, 40));

function fitTier(r) {
  if (r.warmEdc || r.icpTier === "warm") return "A";
  if (r.priority === "P1") return "A";
  if (r.priority === "P2") return "B";
  if (r.priority === "P3" || r.icpTier === "reference") return "C";
  return null;
}
function warmth(r) {
  if (r.warmEdc) return 5;
  return { hot: 4, warm: 4, cold: 2 }[r.temperature] ?? null;
}
function source(r) {
  if (r.warmEdc || /referral|edc/i.test(r.source ?? "")) return "warm_intro";
  return "research";
}
const isWarmRelationship = (r) => r.warmEdc || r.icpTier === "warm";

function legacyNotes(r) {
  const lines = ["Imported from the July 2026 CRM (Oct 20, 2026)."];
  if (r.hqCity || r.hqState) lines.push(`HQ: ${[r.hqCity, r.hqState].filter(Boolean).join(", ")}${r.region ? ` (${r.region})` : ""}`);
  if (r.locationsLabel) lines.push(`Locations: ${r.locationsLabel}`);
  if (r.specialty) lines.push(`Specialty: ${r.specialty}`);
  if (r.peBacked || r.peSponsor) lines.push(`PE-backed${r.peSponsor ? `: ${r.peSponsor}` : ""}`);
  if (r.targetPlan) lines.push(`Target plan: ${r.targetPlan}${r.estAcv ? ` (est. ACV $${Number(r.estAcv).toLocaleString("en-US")})` : ""}`);
  if (r.tags?.length) lines.push(`Tags: ${r.tags.join(", ")}`);
  if (r.source) lines.push(`Original source: ${r.source}`);
  if (r.sourceUrl) lines.push(`Source URL: ${r.sourceUrl}`);
  if (r.nextAction) lines.push(`July next action: ${r.nextAction}${r.nextActionDue ? ` (due ${r.nextActionDue}; no send was logged)` : ""}`);
  if (r.notes?.trim()) lines.push("", r.notes.trim());
  return lines.join("\n");
}

const DM = /talent|recruit|people|human|hr\b|ceo|coo|chief|president|founder|owner|operations|development/i;
function contactRole(c) {
  if (/recruit|talent acquisition/i.test(c.title ?? "")) return "recruiter";
  return DM.test(`${c.title ?? ""} ${c.role ?? ""}`) ? "decision_maker" : "other";
}

const { data: existing, error } = await sb.from("crm_accounts").select("id,name,website,hq_state,states,locations,fit_tier,warmth,next_step,next_step_due,notes");
if (error) throw error;
const byKey = new Map(existing.map((a) => [key(a.name), a]));
const { data: legacyEvents } = await sb.from("crm_events").select("meta").eq("meta->>source", "legacy_crm");
const seenEvent = new Set((legacyEvents ?? []).map((e) => e.meta.legacy_id));

const stats = { created: 0, updated: 0, contacts: 0, events: 0, warmNext: [] };

for (const r of old) {
  let acct = byKey.get(key(r.name));
  const notesBlock = legacyNotes(r);
  const nextStep = isWarmRelationship(r) && r.nextAction ? r.nextAction.slice(0, 300) : null;

  if (!acct) {
    const row = {
      name: r.name.slice(0, 160),
      website: r.website?.slice(0, 300) || null,
      hq_state: stateOf(r.hqState),
      states: r.hqState ? [stateOf(r.hqState)] : [],
      locations: Number.isFinite(r.locations) && r.locations >= 0 ? r.locations : null,
      locations_note: r.locationsLabel?.slice(0, 300) || null,
      fit_tier: fitTier(r),
      warmth: warmth(r),
      status: "target",
      source: source(r),
      sources: r.sourceUrl ? [r.sourceUrl] : [],
      next_step: nextStep,
      next_step_due: nextStep ? TODAY : null,
      notes: notesBlock.slice(0, 20000),
    };
    stats.created++;
    if (nextStep) stats.warmNext.push(r.name);
    if (APPLY) {
      const { data: ins, error: e } = await sb.from("crm_accounts").insert(row).select("id").single();
      if (e) throw new Error(`${r.name}: ${e.message}`);
      acct = { id: ins.id };
      await sb.from("crm_events").insert({ account_id: ins.id, kind: "import", body: "Imported from the July 2026 CRM", meta: { source: "legacy_crm" } });
    } else acct = { id: null };
  } else {
    const patch = {};
    if (!acct.website && r.website) patch.website = r.website.slice(0, 300);
    if (!acct.hq_state && r.hqState) patch.hq_state = stateOf(r.hqState);
    if (acct.locations == null && Number.isFinite(r.locations)) patch.locations = r.locations;
    if (!acct.fit_tier && fitTier(r)) patch.fit_tier = fitTier(r);
    if (r.warmEdc) patch.warmth = 5;
    if (!acct.next_step && nextStep) { patch.next_step = nextStep; patch.next_step_due = TODAY; stats.warmNext.push(r.name); }
    if (!(acct.notes ?? "").includes("Imported from the July 2026 CRM")) {
      patch.notes = [acct.notes?.trim(), notesBlock].filter(Boolean).join("\n\n").slice(0, 20000);
    }
    if (Object.keys(patch).length) {
      stats.updated++;
      if (APPLY) {
        const { error: e } = await sb.from("crm_accounts").update(patch).eq("id", acct.id);
        if (e) throw new Error(`${r.name}: ${e.message}`);
      }
    }
  }

  // Contacts
  let have = [];
  if (acct.id) {
    const { data: cs } = await sb.from("crm_contacts").select("name,email").eq("account_id", acct.id);
    have = cs ?? [];
  }
  for (const c of r.contacts ?? []) {
    if (!c.name?.trim()) continue;
    const dup = have.some((h) => (c.email && h.email?.toLowerCase() === c.email.toLowerCase()) || h.name.toLowerCase() === c.name.toLowerCase());
    if (dup) continue;
    stats.contacts++;
    have.push({ name: c.name, email: c.email });
    if (APPLY) {
      const { error: e } = await sb.from("crm_contacts").insert({
        account_id: acct.id,
        name: c.name.slice(0, 160),
        title: c.title?.slice(0, 160) || null,
        role: contactRole(c),
        email: c.email?.trim() || null,
        phone: c.phone?.trim().slice(0, 40) || null,
        linkedin_url: c.linkedin?.trim().slice(0, 300) || null,
        notes: c.primary ? "Primary contact in the July 2026 CRM." : null,
      });
      if (e) throw new Error(`${r.name} contact ${c.name}: ${e.message}`);
    }
  }

  // Activities -> note events
  for (const a of r.activities ?? []) {
    if (!a.text?.trim() || seenEvent.has(a.id)) continue;
    stats.events++;
    if (APPLY) {
      const { error: e } = await sb.from("crm_events").insert({
        account_id: acct.id,
        kind: "note",
        body: a.text.slice(0, 20000),
        occurred_at: a.createdAt ?? `${a.date}T12:00:00Z`,
        meta: { source: "legacy_crm", legacy_id: a.id },
      });
      if (e) throw new Error(`${r.name} event: ${e.message}`);
    }
  }
}

console.log(APPLY ? "APPLIED" : "DRY RUN", { ...stats, warmNext: stats.warmNext.join("; ") });
