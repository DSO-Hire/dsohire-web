/**
 * /employer/automations — N13 automation rules management + builder.
 *
 * Lists the DSO's rules (the seeded `is_system` default pinned first) as
 * plain-English sentences with enable/disable + run counts, and hosts the
 * full builder. Custom rules are Scale+ (Fork B); the default rule runs on
 * every tier, so lower tiers still see + can disable it here.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dsoCanUseAutomationRules } from "@/lib/automations/tier";
import { dsoCanUseSequences } from "@/lib/sequences/tier";
import { AutomationsManager } from "./automations-manager";
import { SequencesManager, type SequenceView } from "./sequences-manager";
import { HelpDisclosure } from "@/components/help/help-disclosure";
import type { RuleCondition } from "@/lib/automations/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Automations · DSO Hire" };

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

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

export default async function AutomationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const tab = sp.tab === "sequences" ? "sequences" : "rules";
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
  const canManageSequences = await dsoCanUseSequences(supabase, dsoId);

  // ── N16 v2 — load drip sequences + per-sequence enrollment counts.
  const { data: seqRows } = await supabase
    .from("automation_sequences")
    .select(
      "id, name, is_enabled, created_at, steps:automation_sequence_steps(delay_days, subject, body, step_order)"
    )
    .eq("dso_id", dsoId)
    .order("created_at", { ascending: true });
  const { data: enrRows } = await supabase
    .from("automation_sequence_enrollments")
    .select("sequence_id, status")
    .eq("dso_id", dsoId);
  const activeBySeq = new Map<string, number>();
  const completedBySeq = new Map<string, number>();
  for (const e of (enrRows as Array<Record<string, unknown>> | null) ?? []) {
    const sid = e.sequence_id as string;
    const st = e.status as string;
    if (st === "active") activeBySeq.set(sid, (activeBySeq.get(sid) ?? 0) + 1);
    else if (st === "completed")
      completedBySeq.set(sid, (completedBySeq.get(sid) ?? 0) + 1);
  }
  const sequences: SequenceView[] = (
    (seqRows as Array<Record<string, unknown>> | null) ?? []
  ).map((s) => {
    const rawSteps = (s.steps as Array<Record<string, unknown>> | null) ?? [];
    return {
      id: s.id as string,
      name: s.name as string,
      is_enabled: s.is_enabled as boolean,
      steps: rawSteps
        .map((st) => ({
          delay_days: (st.delay_days as number | null) ?? 0,
          subject: (st.subject as string | null) ?? "",
          body: (st.body as string | null) ?? "",
          step_order: (st.step_order as number | null) ?? 0,
        }))
        .sort((a, b) => a.step_order - b.step_order)
        .map(({ delay_days, subject, body }) => ({ delay_days, subject, body })),
      activeCount: activeBySeq.get(s.id as string) ?? 0,
      completedCount: completedBySeq.get(s.id as string) ?? 0,
    };
  });

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
    <>
      <div className="mb-5">
        <HelpDisclosure helpKey="automations.overview" />
      </div>

      <div className="mb-7 inline-flex items-center gap-1 rounded-lg border border-[var(--rule-strong)] bg-cream p-1">
        <TabLink href="/employer/automations?tab=rules" active={tab === "rules"}>
          Rules
        </TabLink>
        <TabLink href="/employer/automations?tab=sequences" active={tab === "sequences"}>
          Drip sequences
        </TabLink>
      </div>

      {tab === "sequences" ? (
        <SequencesManager sequences={sequences} canManage={canManageSequences} />
      ) : (
        <AutomationsManager
          rules={rules}
          jobs={jobs}
          teammates={teammates}
          canManage={canManage}
        />
      )}
    </>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        "px-5 py-2 rounded-md text-[12px] font-bold tracking-[1px] uppercase transition-colors " +
        (active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-slate-body hover:text-ink hover:bg-card/70")
      }
    >
      {children}
    </Link>
  );
}
