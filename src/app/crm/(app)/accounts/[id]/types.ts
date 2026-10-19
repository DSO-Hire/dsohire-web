/* Shapes the account profile sections read (the Supabase client is untyped). */

import type { CrmSession } from "@/lib/crm/auth";
import type { AccountLite, DemoVisit } from "../lib";

export type ContactRec = {
  id: string;
  name: string;
  title: string | null;
  role: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  notes: string | null;
  created_at: string;
  do_not_contact_at?: string | null;
  do_not_contact_reason?: string | null;
  do_not_contact_note?: string | null;
};

export type OppRec = {
  id: string;
  name: string;
  stage: string;
  plan_tier: string | null;
  billing: string | null;
  mrr: number | string | null;
  next_step: string | null;
  next_step_due: string | null;
  primary_contact_id: string | null;
  won_at: string | null;
  lost_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type TaskRec = {
  id: string;
  title: string;
  ball: string;
  priority: string;
  due_date: string | null;
  completed_at: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  owner_id: string | null;
  created_at: string;
};

export type EventRec = {
  id: string;
  kind: string;
  body: string | null;
  meta: Record<string, unknown> | null;
  occurred_at: string;
  contact_id: string | null;
  opportunity_id: string | null;
  created_by: string | null;
};

export type SectionProps = {
  a: AccountLite;
  contacts: ContactRec[];
  opps: OppRec[];
  openTasks: TaskRec[];
  doneTasks: TaskRec[];
  events: EventRec[];
  demo: DemoVisit | null;
  demoLink: string | null;
  today: string;
  me: string;
  admin: CrmSession["admin"];
  sp: Record<string, string | undefined>;
};
