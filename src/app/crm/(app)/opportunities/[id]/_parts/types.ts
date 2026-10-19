/* Row shapes the opportunity page passes to its parts. The Supabase client
   is untyped, so these describe what the page selects. */

export type { Admin } from "../../_lib/server";

export type OppRow = {
  id: string;
  account_id: string;
  name: string;
  stage: string;
  custom_stages: string[] | null;
  owner_id: string | null;
  primary_contact_id: string | null;
  plan_tier: string | null;
  billing: string | null;
  mrr: number | string | null;
  close_probability: number | null;
  target_close: string | null;
  next_step: string | null;
  next_step_due: string | null;
  stage_changed_at: string | null;
  lost_reason: string | null;
  lost_note: string | null;
  lost_at: string | null;
  won_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountRow = {
  id: string;
  name: string;
  hq_state: string | null;
  locations: number | null;
  status: string;
  website: string | null;
  last_touch_at: string | null;
  current_tool: string | null;
} | null;

export type ContactRow = {
  id: string;
  name: string;
  title: string | null;
  role: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
};

export type TaskRow = {
  id: string;
  opportunity_id: string | null;
  account_id: string | null;
  contact_id: string | null;
  title: string;
  notes: string | null;
  ball: string;
  priority: string | null;
  repeat: string | null;
  owner_id: string | null;
  due_date: string | null;
  waiting_since: string | null;
  completed_at: string | null;
  created_at: string | null;
};

export type EventRow = {
  id: string;
  kind: string;
  body: string | null;
  meta: Record<string, unknown> | null;
  occurred_at: string;
  created_by: string | null;
  opportunity_id: string | null;
  contact_id: string | null;
};

export type QuoteRow = {
  id: string;
  number: number;
  plan_tier: string;
  billing: string;
  monthly_price: number | string;
  locations: number | null;
  contact_id: string | null;
  valid_until: string;
  status: string;
  sent_at: string | null;
  created_at: string;
};
