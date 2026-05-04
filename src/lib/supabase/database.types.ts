/**
 * Database type — generated from the live schema.
 *
 * Regenerated 2026-05-04 (Phase 5D ai_usage_events migration) via the
 * Supabase MCP `generate_typescript_types` tool against project
 * viapivvlhjqvjhoflxmp (dsohire-prod). Do not hand-edit; rerun after each
 * migration that touches table shape, enum values, or RPC signatures.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          auth_user_id: string
          created_at: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["admin_role"]
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["admin_role"]
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["admin_role"]
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage_events: {
        Row: {
          cost_usd_estimate: number
          created_at: string
          dso_id: string
          error_message: string | null
          feature: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          request_metadata: Json
          succeeded: boolean
          user_id: string
        }
        Insert: {
          cost_usd_estimate: number
          created_at?: string
          dso_id: string
          error_message?: string | null
          feature: string
          id?: string
          input_tokens: number
          model: string
          output_tokens: number
          request_metadata?: Json
          succeeded?: boolean
          user_id: string
        }
        Update: {
          cost_usd_estimate?: number
          created_at?: string
          dso_id?: string
          error_message?: string | null
          feature?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          request_metadata?: Json
          succeeded?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_dso_id_fkey"
            columns: ["dso_id"]
            isOneToOne: false
            referencedRelation: "dsos"
            referencedColumns: ["id"]
          },
        ]
      }
      application_comments: {
        Row: {
          application_id: string
          author_dso_user_id: string
          author_user_id: string
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          mentioned_user_ids: string[]
          updated_at: string
        }
        Insert: {
          application_id: string
          author_dso_user_id: string
          author_user_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          mentioned_user_ids?: string[]
          updated_at?: string
        }
        Update: {
          application_id?: string
          author_dso_user_id?: string
          author_user_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          mentioned_user_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_comments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_comments_author_dso_user_id_fkey"
            columns: ["author_dso_user_id"]
            isOneToOne: false
            referencedRelation: "dso_users"
            referencedColumns: ["id"]
          },
        ]
      }
      application_question_answers: {
        Row: {
          answer_choice: string | null
          answer_choices: string[] | null
          answer_number: number | null
          answer_text: string | null
          application_id: string
          created_at: string
          id: string
          question_id: string
          updated_at: string
        }
        Insert: {
          answer_choice?: string | null
          answer_choices?: string[] | null
          answer_number?: number | null
          answer_text?: string | null
          application_id: string
          created_at?: string
          id?: string
          question_id: string
          updated_at?: string
        }
        Update: {
          answer_choice?: string | null
          answer_choices?: string[] | null
          answer_number?: number | null
          answer_text?: string | null
          application_id?: string
          created_at?: string
          id?: string
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_question_answers_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_question_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "job_screening_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      application_scorecards: {
        Row: {
          application_id: string
          attribute_scores: Json
          created_at: string
          id: string
          overall_note: string | null
          overall_recommendation: string | null
          reviewer_dso_user_id: string
          reviewer_user_id: string
          rubric_id: string
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          application_id: string
          attribute_scores?: Json
          created_at?: string
          id?: string
          overall_note?: string | null
          overall_recommendation?: string | null
          reviewer_dso_user_id: string
          reviewer_user_id: string
          rubric_id: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string
          attribute_scores?: Json
          created_at?: string
          id?: string
          overall_note?: string | null
          overall_recommendation?: string | null
          reviewer_dso_user_id?: string
          reviewer_user_id?: string
          rubric_id?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_scorecards_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_scorecards_reviewer_dso_user_id_fkey"
            columns: ["reviewer_dso_user_id"]
            isOneToOne: false
            referencedRelation: "dso_users"
            referencedColumns: ["id"]
          },
        ]
      }
      application_status_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          application_id: string
          created_at: string
          from_status: Database["public"]["Enums"]["application_status"] | null
          id: string
          note: string | null
          to_status: Database["public"]["Enums"]["application_status"]
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          application_id: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["application_status"] | null
          id?: string
          note?: string | null
          to_status: Database["public"]["Enums"]["application_status"]
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          application_id?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["application_status"] | null
          id?: string
          note?: string | null
          to_status?: Database["public"]["Enums"]["application_status"]
        }
        Relationships: [
          {
            foreignKeyName: "application_status_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          candidate_id: string
          cover_letter: string | null
          created_at: string
          employer_notes: string | null
          id: string
          job_id: string
          pipeline_position: number | null
          resume_url: string | null
          stage_entered_at: string
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
        }
        Insert: {
          candidate_id: string
          cover_letter?: string | null
          created_at?: string
          employer_notes?: string | null
          id?: string
          job_id: string
          pipeline_position?: number | null
          resume_url?: string | null
          stage_entered_at?: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          cover_letter?: string | null
          created_at?: string
          employer_notes?: string | null
          id?: string
          job_id?: string
          pipeline_position?: number | null
          resume_url?: string | null
          stage_entered_at?: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: []
      }
      candidates: {
        Row: {
          auth_user_id: string
          availability:
            | Database["public"]["Enums"]["candidate_availability"]
            | null
          avatar_url: string | null
          created_at: string
          current_title: string | null
          desired_locations: string[] | null
          desired_roles: string[] | null
          full_name: string | null
          headline: string | null
          id: string
          is_searchable: boolean
          linkedin_url: string | null
          phone: string | null
          resume_url: string | null
          summary: string | null
          updated_at: string
          years_experience: number | null
        }
        Insert: {
          auth_user_id: string
          availability?:
            | Database["public"]["Enums"]["candidate_availability"]
            | null
          avatar_url?: string | null
          created_at?: string
          current_title?: string | null
          desired_locations?: string[] | null
          desired_roles?: string[] | null
          full_name?: string | null
          headline?: string | null
          id?: string
          is_searchable?: boolean
          linkedin_url?: string | null
          phone?: string | null
          resume_url?: string | null
          summary?: string | null
          updated_at?: string
          years_experience?: number | null
        }
        Update: {
          auth_user_id?: string
          availability?:
            | Database["public"]["Enums"]["candidate_availability"]
            | null
          avatar_url?: string | null
          created_at?: string
          current_title?: string | null
          desired_locations?: string[] | null
          desired_roles?: string[] | null
          full_name?: string | null
          headline?: string | null
          id?: string
          is_searchable?: boolean
          linkedin_url?: string | null
          phone?: string | null
          resume_url?: string | null
          summary?: string | null
          updated_at?: string
          years_experience?: number | null
        }
        Relationships: []
      }
      dso_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          dso_id: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["dso_user_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          dso_id: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role: Database["public"]["Enums"]["dso_user_role"]
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          dso_id?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["dso_user_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "dso_invitations_dso_id_fkey"
            columns: ["dso_id"]
            isOneToOne: false
            referencedRelation: "dsos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dso_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "dso_users"
            referencedColumns: ["id"]
          },
        ]
      }
      dso_locations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          created_at: string
          dso_id: string
          geocoded_at: string | null
          id: string
          lat: number | null
          latitude: number | null
          lng: number | null
          longitude: number | null
          name: string
          postal_code: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          created_at?: string
          dso_id: string
          geocoded_at?: string | null
          id?: string
          lat?: number | null
          latitude?: number | null
          lng?: number | null
          longitude?: number | null
          name: string
          postal_code?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          created_at?: string
          dso_id?: string
          geocoded_at?: string | null
          id?: string
          lat?: number | null
          latitude?: number | null
          lng?: number | null
          longitude?: number | null
          name?: string
          postal_code?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dso_locations_dso_id_fkey"
            columns: ["dso_id"]
            isOneToOne: false
            referencedRelation: "dsos"
            referencedColumns: ["id"]
          },
        ]
      }
      dso_slug_history: {
        Row: {
          changed_at: string
          dso_id: string
          from_slug: string
          id: string
        }
        Insert: {
          changed_at?: string
          dso_id: string
          from_slug: string
          id?: string
        }
        Update: {
          changed_at?: string
          dso_id?: string
          from_slug?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dso_slug_history_dso_id_fkey"
            columns: ["dso_id"]
            isOneToOne: false
            referencedRelation: "dsos"
            referencedColumns: ["id"]
          },
        ]
      }
      dso_users: {
        Row: {
          auth_user_id: string
          avatar_url: string | null
          created_at: string
          dso_id: string
          full_name: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["dso_user_role"]
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          avatar_url?: string | null
          created_at?: string
          dso_id: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["dso_user_role"]
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          avatar_url?: string | null
          created_at?: string
          dso_id?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["dso_user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dso_users_dso_id_fkey"
            columns: ["dso_id"]
            isOneToOne: false
            referencedRelation: "dsos"
            referencedColumns: ["id"]
          },
        ]
      }
      dsos: {
        Row: {
          created_at: string
          description: string | null
          headquarters_city: string | null
          headquarters_state: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          name: string
          practice_count: number | null
          slug: string
          status: Database["public"]["Enums"]["dso_status"]
          updated_at: string
          verified_at: string | null
          website: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          headquarters_city?: string | null
          headquarters_state?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name: string
          practice_count?: number | null
          slug: string
          status?: Database["public"]["Enums"]["dso_status"]
          updated_at?: string
          verified_at?: string | null
          website?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          headquarters_city?: string | null
          headquarters_state?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          practice_count?: number | null
          slug?: string
          status?: Database["public"]["Enums"]["dso_status"]
          updated_at?: string
          verified_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      email_log: {
        Row: {
          created_at: string
          error: string | null
          from_email: string | null
          id: string
          related_candidate_id: string | null
          related_dso_id: string | null
          resend_message_id: string | null
          status: string
          subject: string | null
          template: string
          to_email: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          from_email?: string | null
          id?: string
          related_candidate_id?: string | null
          related_dso_id?: string | null
          resend_message_id?: string | null
          status: string
          subject?: string | null
          template: string
          to_email: string
        }
        Update: {
          created_at?: string
          error?: string | null
          from_email?: string | null
          id?: string
          related_candidate_id?: string | null
          related_dso_id?: string | null
          resend_message_id?: string | null
          status?: string
          subject?: string | null
          template?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_related_candidate_id_fkey"
            columns: ["related_candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_related_dso_id_fkey"
            columns: ["related_dso_id"]
            isOneToOne: false
            referencedRelation: "dsos"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          hosted_invoice_url: string | null
          id: string
          invoice_pdf_url: string | null
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          status: string
          stripe_invoice_id: string
          subscription_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf_url?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status: string
          stripe_invoice_id: string
          subscription_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf_url?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          stripe_invoice_id?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      job_locations: {
        Row: {
          job_id: string
          location_id: string
        }
        Insert: {
          job_id: string
          location_id: string
        }
        Update: {
          job_id?: string
          location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_locations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "dso_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_screening_questions: {
        Row: {
          created_at: string
          helper_text: string | null
          id: string
          job_id: string
          kind: Database["public"]["Enums"]["screening_question_kind"]
          options: Json | null
          prompt: string
          required: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          helper_text?: string | null
          id?: string
          job_id: string
          kind: Database["public"]["Enums"]["screening_question_kind"]
          options?: Json | null
          prompt: string
          required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          helper_text?: string | null
          id?: string
          job_id?: string
          kind?: Database["public"]["Enums"]["screening_question_kind"]
          options?: Json | null
          prompt?: string
          required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_screening_questions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_skills: {
        Row: {
          job_id: string
          skill: string
        }
        Insert: {
          job_id: string
          skill: string
        }
        Update: {
          job_id?: string
          skill?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_skills_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          applications_count: number
          benefits: string[] | null
          compensation_max: number | null
          compensation_min: number | null
          compensation_period:
            | Database["public"]["Enums"]["compensation_period"]
            | null
          compensation_visible: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          dso_id: string
          employment_type: Database["public"]["Enums"]["employment_type"]
          expires_at: string | null
          id: string
          posted_at: string | null
          requirements: string | null
          role_category: Database["public"]["Enums"]["role_category"]
          search_vector: unknown
          slug: string
          status: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at: string
          views: number
        }
        Insert: {
          applications_count?: number
          benefits?: string[] | null
          compensation_max?: number | null
          compensation_min?: number | null
          compensation_period?:
            | Database["public"]["Enums"]["compensation_period"]
            | null
          compensation_visible?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          dso_id: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          expires_at?: string | null
          id?: string
          posted_at?: string | null
          requirements?: string | null
          role_category?: Database["public"]["Enums"]["role_category"]
          search_vector?: unknown
          slug: string
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at?: string
          views?: number
        }
        Update: {
          applications_count?: number
          benefits?: string[] | null
          compensation_max?: number | null
          compensation_min?: number | null
          compensation_period?:
            | Database["public"]["Enums"]["compensation_period"]
            | null
          compensation_visible?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          dso_id?: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          expires_at?: string | null
          id?: string
          posted_at?: string | null
          requirements?: string | null
          role_category?: Database["public"]["Enums"]["role_category"]
          search_vector?: unknown
          slug?: string
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "dso_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_dso_id_fkey"
            columns: ["dso_id"]
            isOneToOne: false
            referencedRelation: "dsos"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          dso_id: string
          founding_locked_until: string | null
          id: string
          listings_used: number
          seats_used: number
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          dso_id: string
          founding_locked_until?: string | null
          id?: string
          listings_used?: number
          seats_used?: number
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          dso_id?: string
          founding_locked_until?: string | null
          id?: string
          listings_used?: number
          seats_used?: number
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_dso_id_fkey"
            columns: ["dso_id"]
            isOneToOne: true
            referencedRelation: "dsos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      application_comment_counts: {
        Row: {
          application_id: string | null
          comment_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "application_comments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_scorecard_summaries: {
        Row: {
          application_id: string | null
          avg_score: number | null
          reviewer_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "application_scorecards_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      current_dso_id: { Args: never; Returns: string }
      current_dso_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["dso_user_role"]
      }
      is_dso_admin: { Args: { target_dso_id: string }; Returns: boolean }
      is_internal_admin: { Args: never; Returns: boolean }
      search_jobs_public: {
        Args: {
          category_filter?: Database["public"]["Enums"]["role_category"]
          employment_filter?: Database["public"]["Enums"]["employment_type"]
          posted_within_days?: number
          query_text?: string
          state_filter?: string
        }
        Returns: {
          applications_count: number
          benefits: string[] | null
          compensation_max: number | null
          compensation_min: number | null
          compensation_period:
            | Database["public"]["Enums"]["compensation_period"]
            | null
          compensation_visible: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          dso_id: string
          employment_type: Database["public"]["Enums"]["employment_type"]
          expires_at: string | null
          id: string
          posted_at: string | null
          requirements: string | null
          role_category: Database["public"]["Enums"]["role_category"]
          search_vector: unknown
          slug: string
          status: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at: string
          views: number
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      admin_role: "superadmin" | "support"
      application_status:
        | "new"
        | "reviewed"
        | "interviewing"
        | "offered"
        | "hired"
        | "rejected"
        | "withdrawn"
      candidate_availability: "immediate" | "2_weeks" | "1_month" | "passive"
      compensation_period: "hourly" | "daily" | "annual"
      dso_status: "pending" | "active" | "suspended" | "cancelled"
      dso_user_role: "owner" | "admin" | "recruiter"
      employment_type: "full_time" | "part_time" | "contract" | "prn" | "locum"
      job_status:
        | "draft"
        | "active"
        | "paused"
        | "expired"
        | "filled"
        | "archived"
      role_category:
        | "dentist"
        | "dental_hygienist"
        | "dental_assistant"
        | "front_office"
        | "office_manager"
        | "regional_manager"
        | "specialist"
        | "other"
      screening_question_kind:
        | "short_text"
        | "long_text"
        | "yes_no"
        | "single_select"
        | "multi_select"
        | "number"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
        | "incomplete_expired"
        | "unpaid"
      subscription_tier: "founding" | "starter" | "growth" | "enterprise"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      admin_role: ["superadmin", "support"],
      application_status: [
        "new",
        "reviewed",
        "interviewing",
        "offered",
        "hired",
        "rejected",
        "withdrawn",
      ],
      candidate_availability: ["immediate", "2_weeks", "1_month", "passive"],
      compensation_period: ["hourly", "daily", "annual"],
      dso_status: ["pending", "active", "suspended", "cancelled"],
      dso_user_role: ["owner", "admin", "recruiter"],
      employment_type: ["full_time", "part_time", "contract", "prn", "locum"],
      job_status: [
        "draft",
        "active",
        "paused",
        "expired",
        "filled",
        "archived",
      ],
      role_category: [
        "dentist",
        "dental_hygienist",
        "dental_assistant",
        "front_office",
        "office_manager",
        "regional_manager",
        "specialist",
        "other",
      ],
      screening_question_kind: [
        "short_text",
        "long_text",
        "yes_no",
        "single_select",
        "multi_select",
        "number",
      ],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "incomplete",
        "incomplete_expired",
        "unpaid",
      ],
      subscription_tier: ["founding", "starter", "growth", "enterprise"],
    },
  },
} as const
