/**
 * /employer/automations — N13 automation rules management + builder.
 *
 * Lists the DSO's rules (the seeded `is_system` default pinned first) as
 * plain-English sentences with enable/disable + run counts, and hosts the
 * full builder. Custom rules are Scale+ (Fork B); the default rule runs on
 * every tier, so lower tiers still see + can disable it here.
 */

import { redirect } from "next/navigation";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dsoCanUseAutomationRules } from "@/lib/automations/tier";
import { AutomationsManager } from "./automations-manager";
import type { RuleCondition } from "@/lib/automations/types";

export const dynamic = "force-dynamic";

export interface RuleView {
  id: string;
  name: string;
  trigger_kind: string;
  conditions: RuleCondition[];
  is_enabled: boolean;
  is_system: boolean;
  sort_order: number;
  actions: Array<{ action_kind: string; config: Record<string, unknown>; sort_order: number }>;
  firedCount: number;
}

export default async function AutomationsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: me } = await supabase
    .from("dso_users")
    .select("dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!me) redirect("/employer/onboarding");
  const dsoId = me.dso_id as string;
  const role = me.role as string;
  if (role !== "owner" && role !== "admin") redirect("/employer/dashboard");

  const canManage = await dsoCanUseAutomationRules(supabase, dsoId);

  const { data: ruleRows } = await supabase
    .from("automation_rules")
    .select(
      "id, name, trigger_kind, conditions, is_enabled, is_system, sort_order, " +
        "actions:automation_rule_actions(action_kind, config, sort_order)"
    )
    .eq("dso_id", dsoId)
    .order("is_system", { ascending: false })
    .order("sort_order", { ascending: true });

  const rules: RuleView[] = [];
  for (const r of (ruleRows as unknown as Array<Record<string, unknown>>) ?? []) {
    const { count } = await supabase
      .from("automation_rule_runs")
      .select("*", { count: "exact", head: true })
      .eq("rule_id", r.id as string)
      .eq("status", "fired");
    const rawActions = (r.actions as Array<Record<string, unknown>> | null) ?? [];
    rules.push({
      id: r.id as string,
      name: r.name as string,
      trigger_kind: r.trigger_kind as string,
      conditions: Array.isArray(r.conditions) ? (r.conditions as RuleCondition[]) : [],
      is_enabled: r.is_enabled as boolean,
      is_system: r.is_system as boolean,
      sort_order: (r.sort_order as number | null) ?? 0,
      actions: rawActions
        .map((a) => ({
          action_kind: a.action_kind as string,
          config: (a.config as Record<string, unknown> | null) ?? {},
          sort_order: (a.sort_order as number | null) ?? 0,
        }))
        .sort((a, b) => a.sort_order - b.sort_order),
      firedCount: count ?? 0,
    });
  }

  const { data: jobRows } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("dso_id", dsoId)
    .order("created_at", { ascending: false })
    .limit(200);
  const jobs = ((jobRows as Array<Record<string, unknown>> | null) ?? []).map((j) => ({
    id: j.id as string,
    title: (j.title as string | null) ?? "Untitled job",
  }));

  const { data: teamRows } = await supabase
    .from("dso_users")
    .select("id, first_name, last_name")
    .eq("dso_id", dsoId)
    .order("first_name", { ascending: true });
  const teammates = ((teamRows as Array<Record<string, unknown>> | null) ?? []).map((t) => ({
    id: t.id as string,
    name:
      [t.first_name as string | null, t.last_name as string | null]
        .filter(Boolean)
        .join(" ") || "Teammate",
  }));

  return (
    <EmployerShell active="automations">
      <AutomationsManager
        rules={rules}
        jobs={jobs}
        teammates={teammates}
        canManage={canManage}
      />
    </EmployerShell>
  );
}
