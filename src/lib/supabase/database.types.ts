/**
 * Database type — hand-written from the Phase 1 migrations
 * (supabase/migrations/20260501000000_initial_schema.sql + RLS).
 *
 * Regenerate from the live schema later via:
 *   npx supabase gen types typescript \
 *     --project-id viapivvlhjqvjhoflxmp \
 *     --schema public \
 *     > src/lib/supabase/database.types.ts
 *
 * That requires Supabase CLI + login. Until that's set up, this hand-written
 * version provides typed query results across the app. Keep in sync with
 * migrations as they evolve.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/* ───────── Enums ───────── */

export type DsoUserRole = "owner" | "admin" | "recruiter";
export type DsoStatus = "pending" | "active" | "suspended" | "cancelled";
export type CandidateAvailability =
  | "immediate"
  | "2_weeks"
  | "1_month"
  | "passive";
export type AdminRole = "superadmin" | "support";
export type SubscriptionTier =
  | "founding"
  | "starter"
  | "growth"
  | "enterprise";
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid";

/* ───────── Table row types ───────── */

export interface Dso {
  id: string;
  name: string;
  legal_name: string | null;
  website: string | null;
  description: string | null;
  logo_url: string | null;
  headquarters_city: string | null;
  headquarters_state: string | null;
  practice_count: number | null;
  slug: string;
  verified_at: string | null;
  status: DsoStatus;
  created_at: string;
  updated_at: string;
}

export interface DsoSlugHistory {
  id: string;
  dso_id: string;
  from_slug: string;
  changed_at: string;
}

export interface DsoLocation {
  id: string;
  dso_id: string;
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  updated_at: string;
}

export interface DsoUser {
  id: string;
  auth_user_id: string;
  dso_id: string;
  role: DsoUserRole;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Candidate {
  id: string;
  auth_user_id: string;
  full_name: string | null;
  phone: string | null;
  headline: string | null;
  summary: string | null;
  years_experience: number | null;
  current_title: string | null;
  desired_roles: string[] | null;
  desired_locations: string[] | null;
  availability: CandidateAvailability | null;
  resume_url: string | null;
  linkedin_url: string | null;
  avatar_url: string | null;
  is_searchable: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  id: string;
  auth_user_id: string;
  role: AdminRole;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  dso_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  seats_used: number;
  listings_used: number;
  founding_locked_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  subscription_id: string;
  stripe_invoice_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  invoice_pdf_url: string | null;
  hosted_invoice_url: string | null;
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  metadata: Json | null;
  created_at: string;
}

export interface EmailLogEntry {
  id: string;
  to_email: string;
  from_email: string | null;
  template: string;
  subject: string | null;
  resend_message_id: string | null;
  status: string;
  error: string | null;
  related_dso_id: string | null;
  related_candidate_id: string | null;
  created_at: string;
}

/* ───────── Database type (Supabase client expects this shape) ───────── */

export interface Database {
  public: {
    Tables: {
      dsos: {
        Row: Dso;
        Insert: Omit<Dso, "id" | "created_at" | "updated_at"> &
          Partial<Pick<Dso, "id" | "created_at" | "updated_at">>;
        Update: Partial<Omit<Dso, "id">>;
      };
      dso_slug_history: {
        Row: DsoSlugHistory;
        Insert: Omit<DsoSlugHistory, "id" | "changed_at"> &
          Partial<Pick<DsoSlugHistory, "id" | "changed_at">>;
        Update: Partial<DsoSlugHistory>;
      };
      dso_locations: {
        Row: DsoLocation;
        Insert: Omit<DsoLocation, "id" | "created_at" | "updated_at"> &
          Partial<Pick<DsoLocation, "id" | "created_at" | "updated_at">>;
        Update: Partial<DsoLocation>;
      };
      dso_users: {
        Row: DsoUser;
        Insert: Omit<DsoUser, "id" | "created_at" | "updated_at"> &
          Partial<Pick<DsoUser, "id" | "created_at" | "updated_at">>;
        Update: Partial<DsoUser>;
      };
      candidates: {
        Row: Candidate;
        Insert: Omit<Candidate, "id" | "created_at" | "updated_at"> &
          Partial<Pick<Candidate, "id" | "created_at" | "updated_at">>;
        Update: Partial<Candidate>;
      };
      admin_users: {
        Row: AdminUser;
        Insert: Omit<AdminUser, "id" | "created_at" | "updated_at"> &
          Partial<Pick<AdminUser, "id" | "created_at" | "updated_at">>;
        Update: Partial<AdminUser>;
      };
      subscriptions: {
        Row: Subscription;
        Insert: Omit<Subscription, "id" | "created_at" | "updated_at"> &
          Partial<Pick<Subscription, "id" | "created_at" | "updated_at">>;
        Update: Partial<Subscription>;
      };
      invoices: {
        Row: Invoice;
        Insert: Omit<Invoice, "id" | "created_at"> &
          Partial<Pick<Invoice, "id" | "created_at">>;
        Update: Partial<Invoice>;
      };
      audit_log: {
        Row: AuditLogEntry;
        Insert: Omit<AuditLogEntry, "id" | "created_at"> &
          Partial<Pick<AuditLogEntry, "id" | "created_at">>;
        Update: Partial<AuditLogEntry>;
      };
      email_log: {
        Row: EmailLogEntry;
        Insert: Omit<EmailLogEntry, "id" | "created_at"> &
          Partial<Pick<EmailLogEntry, "id" | "created_at">>;
        Update: Partial<EmailLogEntry>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_dso_id: { Args: Record<string, never>; Returns: string | null };
      current_dso_user_role: {
        Args: Record<string, never>;
        Returns: DsoUserRole | null;
      };
      is_dso_admin: { Args: { target_dso_id: string }; Returns: boolean };
      is_internal_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: {
      dso_user_role: DsoUserRole;
      dso_status: DsoStatus;
      candidate_availability: CandidateAvailability;
      admin_role: AdminRole;
      subscription_tier: SubscriptionTier;
      subscription_status: SubscriptionStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
