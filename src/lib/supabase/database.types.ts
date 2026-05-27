/**
 * Database type — generated from the live schema.
 *
 * Regenerated 2026-05-14 via the Supabase MCP `generate_typescript_types`
 * tool against project viapivvlhjqvjhoflxmp (dsohire-prod), after migration
 * 20260514000003_job_verifications (Phase 5G.e Tier 2 — job_verification_
 * requirements + application_verifications tables).
 *
 * Do not hand-edit; rerun after each migration that touches table shape,
 * enum values, or RPC signatures.
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
          dso_id: string | null
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
          dso_id?: string | null
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
          dso_id?: string | null
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
      application_tags: {
        Row: {
          application_id: string
          color: string
          created_at: string
          created_by: string | null
          id: string
          label: string
        }
        Insert: {
          application_id: string
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
        }
        Update: {
          application_id?: string
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_tags_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_message_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          message_id: string
          mime_type: string
          size_bytes: number
          storage_path: string
          uploaded_by_user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          message_id: string
          mime_type: string
          size_bytes: number
          storage_path: string
          uploaded_by_user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          message_id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "application_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      application_messages: {
        Row: {
          application_id: string
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          event_kind: string | null
          id: string
          kind: string
          payload: Json | null
          read_at: string | null
          sender_dso_user_id: string | null
          sender_role: string
          sender_user_id: string | null
          updated_at: string
        }
        Insert: {
          application_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          event_kind?: string | null
          id?: string
          kind?: string
          payload?: Json | null
          read_at?: string | null
          sender_dso_user_id?: string | null
          sender_role: string
          sender_user_id?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          event_kind?: string | null
          id?: string
          kind?: string
          payload?: Json | null
          read_at?: string | null
          sender_dso_user_id?: string | null
          sender_role?: string
          sender_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_messages_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_messages_sender_dso_user_id_fkey"
            columns: ["sender_dso_user_id"]
            isOneToOne: false
            referencedRelation: "dso_users"
            referencedColumns: ["id"]
          },
        ]
      }
      application_offer_responses: {
        Row: {
          application_id: string
          created_at: string
          id: string
          ip: string | null
          offer_send_id: string
          reason: string | null
          responded_at: string
          response: string
          signed_name: string | null
          user_agent: string | null
        }
        Insert: {
          application_id: string
          created_at?: string
          id?: string
          ip?: string | null
          offer_send_id: string
          reason?: string | null
          responded_at?: string
          response: string
          signed_name?: string | null
          user_agent?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string
          id?: string
          ip?: string | null
          offer_send_id?: string
          reason?: string | null
          responded_at?: string
          response?: string
          signed_name?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_offer_responses_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_offer_responses_offer_send_id_fkey"
            columns: ["offer_send_id"]
            isOneToOne: false
            referencedRelation: "application_offer_sends"
            referencedColumns: ["id"]
          },
        ]
      }
      application_offer_sends: {
        Row: {
          application_id: string
          body_html: string
          created_at: string
          id: string
          merge_values: Json
          recipient_email: string
          sent_at: string
          sent_by_user_id: string | null
          subject: string
          template_id: string | null
          token: string | null
        }
        Insert: {
          application_id: string
          body_html: string
          created_at?: string
          id?: string
          merge_values?: Json
          recipient_email: string
          sent_at?: string
          sent_by_user_id?: string | null
          subject: string
          template_id?: string | null
          token?: string | null
        }
        Update: {
          application_id?: string
          body_html?: string
          created_at?: string
          id?: string
          merge_values?: Json
          recipient_email?: string
          sent_at?: string
          sent_by_user_id?: string | null
          subject?: string
          template_id?: string | null
          token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_offer_sends_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_offer_sends_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "dso_offer_letter_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      application_eeo_responses: {
        Row: {
          application_id: string
          disability_status: string | null
          gender: string | null
          id: string
          race_ethnicity: string | null
          submitted_at: string
          updated_at: string
          veteran_status: string | null
        }
        Insert: {
          application_id: string
          disability_status?: string | null
          gender?: string | null
          id?: string
          race_ethnicity?: string | null
          submitted_at?: string
          updated_at?: string
          veteran_status?: string | null
        }
        Update: {
          application_id?: string
          disability_status?: string | null
          gender?: string | null
          id?: string
          race_ethnicity?: string | null
          submitted_at?: string
          updated_at?: string
          veteran_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_eeo_responses_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
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
          from_stage_kind: string | null
          from_stage_label: string | null
          id: string
          note: string | null
          to_stage_kind: string
          to_stage_label: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          application_id: string
          created_at?: string
          from_stage_kind?: string | null
          from_stage_label?: string | null
          id?: string
          note?: string | null
          to_stage_kind: string
          to_stage_label?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          application_id?: string
          created_at?: string
          from_stage_kind?: string | null
          from_stage_label?: string | null
          id?: string
          note?: string | null
          to_stage_kind?: string
          to_stage_label?: string | null
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
      application_verification_credentials: {
        Row: {
          application_verification_id: string
          created_at: string
          credential_id: string
          credential_type: string
          id: string
        }
        Insert: {
          application_verification_id: string
          created_at?: string
          credential_id: string
          credential_type: string
          id?: string
        }
        Update: {
          application_verification_id?: string
          created_at?: string
          credential_id?: string
          credential_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_verification_crede_application_verification_id_fkey"
            columns: ["application_verification_id"]
            isOneToOne: false
            referencedRelation: "application_verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_verifications: {
        Row: {
          application_id: string
          attested: boolean
          attested_at: string | null
          created_at: string
          id: string
          note: string | null
          updated_at: string
          verification_type: string
        }
        Insert: {
          application_id: string
          attested?: boolean
          attested_at?: string | null
          created_at?: string
          id?: string
          note?: string | null
          updated_at?: string
          verification_type: string
        }
        Update: {
          application_id?: string
          attested?: boolean
          attested_at?: string | null
          created_at?: string
          id?: string
          note?: string | null
          updated_at?: string
          verification_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_verifications_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_withdraw_reasons: {
        Row: {
          application_id: string
          created_at: string
          id: string
          reason_chips: string[]
          reason_text: string | null
        }
        Insert: {
          application_id: string
          created_at?: string
          id?: string
          reason_chips?: string[]
          reason_text?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string
          id?: string
          reason_chips?: string[]
          reason_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_withdraw_reasons_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          affiliation_revealed: boolean
          affiliation_revealed_at: string | null
          affiliation_revealed_by_dso_user_id: string | null
          candidate_id: string
          cover_letter: string | null
          created_at: string
          employer_notes: string | null
          hidden_at: string | null
          hired_at: string | null
          id: string
          job_id: string
          knockout_failed_at: string | null
          knockout_failed_questions: string[]
          moved_from_application_id: string | null
          pipeline_position: number | null
          resume_url: string | null
          self_reported_status: string | null
          source: string | null
          stage_entered_at: string
          stage_id: string
          updated_at: string
          withdrawn_at: string | null
        }
        Insert: {
          affiliation_revealed?: boolean
          affiliation_revealed_at?: string | null
          affiliation_revealed_by_dso_user_id?: string | null
          candidate_id: string
          cover_letter?: string | null
          created_at?: string
          employer_notes?: string | null
          hidden_at?: string | null
          hired_at?: string | null
          id?: string
          job_id: string
          knockout_failed_at?: string | null
          knockout_failed_questions?: string[]
          moved_from_application_id?: string | null
          pipeline_position?: number | null
          resume_url?: string | null
          self_reported_status?: string | null
          source?: string | null
          stage_entered_at?: string
          stage_id: string
          updated_at?: string
          withdrawn_at?: string | null
        }
        Update: {
          affiliation_revealed?: boolean
          affiliation_revealed_at?: string | null
          affiliation_revealed_by_dso_user_id?: string | null
          candidate_id?: string
          cover_letter?: string | null
          created_at?: string
          employer_notes?: string | null
          hidden_at?: string | null
          hired_at?: string | null
          id?: string
          job_id?: string
          knockout_failed_at?: string | null
          knockout_failed_questions?: string[]
          moved_from_application_id?: string | null
          pipeline_position?: number | null
          resume_url?: string | null
          self_reported_status?: string | null
          source?: string | null
          stage_entered_at?: string
          stage_id?: string
          updated_at?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_affiliation_revealed_by_dso_user_id_fkey"
            columns: ["affiliation_revealed_by_dso_user_id"]
            isOneToOne: false
            referencedRelation: "dso_users"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "applications_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "dso_pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor_dso_user_id: string | null
          actor_name: string | null
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          dso_id: string
          event_kind: string
          id: string
          metadata: Json | null
          summary: string
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          actor_dso_user_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          dso_id: string
          event_kind: string
          id?: string
          metadata?: Json | null
          summary: string
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          actor_dso_user_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          dso_id?: string
          event_kind?: string
          id?: string
          metadata?: Json | null
          summary?: string
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_dso_user_id_fkey"
            columns: ["actor_dso_user_id"]
            isOneToOne: false
            referencedRelation: "dso_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_dso_id_fkey"
            columns: ["dso_id"]
            isOneToOne: false
            referencedRelation: "dsos"
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
      calendar_connections: {
        Row: {
          access_token: string
          auth_user_id: string
          connected_email: string
          created_at: string
          expires_at: string
          id: string
          provider: Database["public"]["Enums"]["calendar_provider"]
          provider_metadata: Json
          refresh_token: string
          scopes: string[]
          updated_at: string
        }
        Insert: {
          access_token: string
          auth_user_id: string
          connected_email: string
          created_at?: string
          expires_at: string
          id?: string
          provider: Database["public"]["Enums"]["calendar_provider"]
          provider_metadata?: Json
          refresh_token: string
          scopes?: string[]
          updated_at?: string
        }
        Update: {
          access_token?: string
          auth_user_id?: string
          connected_email?: string
          created_at?: string
          expires_at?: string
          id?: string
          provider?: Database["public"]["Enums"]["calendar_provider"]
          provider_metadata?: Json
          refresh_token?: string
          scopes?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      candidate_blocked_employers: {
        Row: {
          candidate_id: string
          created_at: string
          dso_id: string
          id: string
          reason_optional: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          dso_id: string
          id?: string
          reason_optional?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          dso_id?: string
          id?: string
          reason_optional?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_blocked_employers_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_blocked_employers_dso_id_fkey"
            columns: ["dso_id"]
            isOneToOne: false
            referencedRelation: "dsos"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_certifications: {
        Row: {
          candidate_id: string
          created_at: string
          document_path: string | null
          expires_date: string | null
          file_url: string | null
          id: string
          issued_date: string | null
          kind: string
          level: string | null
          updated_at: string
          verification_status: string
          verified_at: string | null
          verified_by_user_id: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          document_path?: string | null
          expires_date?: string | null
          file_url?: string | null
          id?: string
          issued_date?: string | null
          kind: string
          level?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by_user_id?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          document_path?: string | null
          expires_date?: string | null
          file_url?: string | null
          id?: string
          issued_date?: string | null
          kind?: string
          level?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_certifications_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_education: {
        Row: {
          candidate_id: string
          created_at: string
          degree: string | null
          description: string | null
          end_year: number | null
          field_of_study: string | null
          id: string
          school_name: string
          start_year: number | null
          updated_at: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          degree?: string | null
          description?: string | null
          end_year?: number | null
          field_of_study?: string | null
          id?: string
          school_name: string
          start_year?: number | null
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          degree?: string | null
          description?: string | null
          end_year?: number | null
          field_of_study?: string | null
          id?: string
          school_name?: string
          start_year?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_education_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_licenses: {
        Row: {
          candidate_id: string
          created_at: string
          display_number: boolean
          document_path: string | null
          expires_date: string | null
          file_url: string | null
          id: string
          issued_date: string | null
          license_number: string | null
          license_type: string
          state: string | null
          updated_at: string
          verification_status: string
          verified_at: string | null
          verified_by_user_id: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          display_number?: boolean
          document_path?: string | null
          expires_date?: string | null
          file_url?: string | null
          id?: string
          issued_date?: string | null
          license_number?: string | null
          license_type: string
          state?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by_user_id?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          display_number?: boolean
          document_path?: string | null
          expires_date?: string | null
          file_url?: string | null
          id?: string
          issued_date?: string | null
          license_number?: string | null
          license_type?: string
          state?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_licenses_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_saved_searches: {
        Row: {
          candidate_id: string
          created_at: string
          filter_state: Json
          frequency: string
          id: string
          last_dispatched_at: string | null
          name: string
          updated_at: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          filter_state?: Json
          frequency?: string
          id?: string
          last_dispatched_at?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          filter_state?: Json
          frequency?: string
          id?: string
          last_dispatched_at?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_saved_searches_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_work_history: {
        Row: {
          auto_blocklisted: boolean
          candidate_id: string
          company_name: string
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          is_current: boolean
          is_dso: boolean | null
          pms_systems_used: string[]
          procedures_performed: string[]
          start_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          auto_blocklisted?: boolean
          candidate_id: string
          company_name: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_current?: boolean
          is_dso?: boolean | null
          pms_systems_used?: string[]
          procedures_performed?: string[]
          start_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          auto_blocklisted?: boolean
          candidate_id?: string
          company_name?: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_current?: boolean
          is_dso?: boolean | null
          pms_systems_used?: string[]
          procedures_performed?: string[]
          start_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_work_history_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          auth_user_id: string | null
          availability:
            | Database["public"]["Enums"]["candidate_availability"]
            | null
          avatar_url: string | null
          claim_expires_at: string | null
          contact_info_visibility: string
          created_at: string
          current_location_city: string | null
          current_location_state: string | null
          current_title: string | null
          cv_visibility: Database["public"]["Enums"]["candidate_visibility"]
          deleted_at: string | null
          desired_locations: string[] | null
          desired_roles: string[] | null
          desired_specialty: string[]
          dso_size_preference: string | null
          email: string | null
          first_name: string | null
          full_name: string | null
          headline: string | null
          id: string
          is_guest: boolean
          is_searchable: boolean
          languages: string[]
          last_name: string | null
          last_parsed_at: string | null
          license_states: string[]
          linkedin_url: string | null
          min_salary: number | null
          parsed_resume_json: Json | null
          profile_accent_color: string | null
          phone: string | null
          pms_systems: string[]
          practice_fit_consent: string
          preferred_timezone: string
          pronouns: string | null
          resume_url: string | null
          resume_visibility: string
          salary_unit: string | null
          salutation: string | null
          schedule_preferences: Json
          skills: string[]
          summary: string | null
          temp_or_perm: string | null
          updated_at: string
          years_experience: number | null
          years_experience_dental: number | null
        }
        Insert: {
          auth_user_id?: string | null
          availability?:
            | Database["public"]["Enums"]["candidate_availability"]
            | null
          avatar_url?: string | null
          claim_expires_at?: string | null
          contact_info_visibility?: string
          created_at?: string
          current_location_city?: string | null
          current_location_state?: string | null
          current_title?: string | null
          cv_visibility?: Database["public"]["Enums"]["candidate_visibility"]
          deleted_at?: string | null
          desired_locations?: string[] | null
          desired_roles?: string[] | null
          desired_specialty?: string[]
          dso_size_preference?: string | null
          email?: string | null
          first_name?: string | null
          headline?: string | null
          id?: string
          is_guest?: boolean
          is_searchable?: boolean
          languages?: string[]
          last_name?: string | null
          last_parsed_at?: string | null
          license_states?: string[]
          linkedin_url?: string | null
          min_salary?: number | null
          parsed_resume_json?: Json | null
          profile_accent_color?: string | null
          phone?: string | null
          pms_systems?: string[]
          practice_fit_consent?: string
          preferred_timezone?: string
          pronouns?: string | null
          resume_url?: string | null
          resume_visibility?: string
          salary_unit?: string | null
          salutation?: string | null
          schedule_preferences?: Json
          skills?: string[]
          summary?: string | null
          temp_or_perm?: string | null
          updated_at?: string
          years_experience?: number | null
          years_experience_dental?: number | null
        }
        Update: {
          auth_user_id?: string | null
          availability?:
            | Database["public"]["Enums"]["candidate_availability"]
            | null
          avatar_url?: string | null
          claim_expires_at?: string | null
          contact_info_visibility?: string
          created_at?: string
          current_location_city?: string | null
          current_location_state?: string | null
          current_title?: string | null
          cv_visibility?: Database["public"]["Enums"]["candidate_visibility"]
          deleted_at?: string | null
          desired_locations?: string[] | null
          desired_roles?: string[] | null
          desired_specialty?: string[]
          dso_size_preference?: string | null
          email?: string | null
          first_name?: string | null
          headline?: string | null
          id?: string
          is_guest?: boolean
          is_searchable?: boolean
          languages?: string[]
          last_name?: string | null
          last_parsed_at?: string | null
          license_states?: string[]
          linkedin_url?: string | null
          min_salary?: number | null
          parsed_resume_json?: Json | null
          profile_accent_color?: string | null
          phone?: string | null
          pms_systems?: string[]
          practice_fit_consent?: string
          preferred_timezone?: string
          pronouns?: string | null
          resume_url?: string | null
          resume_visibility?: string
          salary_unit?: string | null
          salutation?: string | null
          schedule_preferences?: Json
          skills?: string[]
          summary?: string | null
          temp_or_perm?: string | null
          updated_at?: string
          years_experience?: number | null
          years_experience_dental?: number | null
        }
        Relationships: []
      }
      ce_certificates: {
        Row: {
          candidate_id: string
          category: string | null
          completion_date: string
          course_name: string
          created_at: string
          file_path: string | null
          file_size_bytes: number | null
          hours_credit: number
          id: string
          license_type: string | null
          provider: string | null
          updated_at: string
        }
        Insert: {
          candidate_id: string
          category?: string | null
          completion_date: string
          course_name: string
          created_at?: string
          file_path?: string | null
          file_size_bytes?: number | null
          hours_credit: number
          id?: string
          license_type?: string | null
          provider?: string | null
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          category?: string | null
          completion_date?: string
          course_name?: string
          created_at?: string
          file_path?: string | null
          file_size_bytes?: number | null
          hours_credit?: number
          id?: string
          license_type?: string | null
          provider?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ce_certificates_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
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
          scoped_location_ids: string[] | null
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
          scoped_location_ids?: string[] | null
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
          scoped_location_ids?: string[] | null
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
          logo_url: string | null
          longitude: number | null
          name: string
          postal_code: string | null
          precise_geocoded_at: string | null
          precise_latitude: number | null
          precise_longitude: number | null
          public_dso_affiliation: boolean
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
          logo_url?: string | null
          longitude?: number | null
          name: string
          postal_code?: string | null
          precise_geocoded_at?: string | null
          precise_latitude?: number | null
          precise_longitude?: number | null
          public_dso_affiliation?: boolean
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
          logo_url?: string | null
          longitude?: number | null
          name?: string
          postal_code?: string | null
          precise_geocoded_at?: string | null
          precise_latitude?: number | null
          precise_longitude?: number | null
          public_dso_affiliation?: boolean
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
      dso_offer_letter_templates: {
        Row: {
          body: string
          created_at: string
          created_by_user_id: string | null
          dso_id: string
          id: string
          is_archived: boolean
          name: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by_user_id?: string | null
          dso_id: string
          id?: string
          is_archived?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by_user_id?: string | null
          dso_id?: string
          id?: string
          is_archived?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dso_offer_letter_templates_dso_id_fkey"
            columns: ["dso_id"]
            isOneToOne: false
            referencedRelation: "dsos"
            referencedColumns: ["id"]
          },
        ]
      }
      dso_outreach_messages: {
        Row: {
          body: string
          candidate_id: string
          dso_id: string
          id: string
          opened_at: string | null
          replied_at: string | null
          resend_message_id: string | null
          sent_at: string
          sent_by: string | null
          subject: string
        }
        Insert: {
          body: string
          candidate_id: string
          dso_id: string
          id?: string
          opened_at?: string | null
          replied_at?: string | null
          resend_message_id?: string | null
          sent_at?: string
          sent_by?: string | null
          subject: string
        }
        Update: {
          body?: string
          candidate_id?: string
          dso_id?: string
          id?: string
          opened_at?: string | null
          replied_at?: string | null
          resend_message_id?: string | null
          sent_at?: string
          sent_by?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "dso_outreach_messages_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dso_outreach_messages_dso_id_fkey"
            columns: ["dso_id"]
            isOneToOne: false
            referencedRelation: "dsos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dso_outreach_messages_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "dso_users"
            referencedColumns: ["id"]
          },
        ]
      }
      dso_outreach_templates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          dso_id: string
          id: string
          last_used_at: string | null
          name: string
          subject: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          dso_id: string
          id?: string
          last_used_at?: string | null
          name: string
          subject: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          dso_id?: string
          id?: string
          last_used_at?: string | null
          name?: string
          subject?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "dso_outreach_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "dso_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dso_outreach_templates_dso_id_fkey"
            columns: ["dso_id"]
            isOneToOne: false
            referencedRelation: "dsos"
            referencedColumns: ["id"]
          },
        ]
      }
      dso_photos: {
        Row: {
          caption: string | null
          created_at: string
          dso_id: string
          id: string
          sort_order: number
          storage_url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          dso_id: string
          id?: string
          sort_order?: number
          storage_url: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          dso_id?: string
          id?: string
          sort_order?: number
          storage_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "dso_photos_dso_id_fkey"
            columns: ["dso_id"]
            isOneToOne: false
            referencedRelation: "dsos"
            referencedColumns: ["id"]
          },
        ]
      }
      dso_pipeline_stages: {
        Row: {
          color_class: string | null
          created_at: string
          dso_id: string
          id: string
          is_default: boolean
          is_hidden: boolean
          kind: string
          label: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color_class?: string | null
          created_at?: string
          dso_id: string
          id?: string
          is_default?: boolean
          is_hidden?: boolean
          kind: string
          label: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color_class?: string | null
          created_at?: string
          dso_id?: string
          id?: string
          is_default?: boolean
          is_hidden?: boolean
          kind?: string
          label?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dso_pipeline_stages_dso_id_fkey"
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
      dso_talent_pool_entries: {
        Row: {
          added_by: string | null
          candidate_id: string
          created_at: string
          dso_id: string
          id: string
          notes: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          candidate_id: string
          created_at?: string
          dso_id: string
          id?: string
          notes?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          candidate_id?: string
          created_at?: string
          dso_id?: string
          id?: string
          notes?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dso_talent_pool_entries_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "dso_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dso_talent_pool_entries_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dso_talent_pool_entries_dso_id_fkey"
            columns: ["dso_id"]
            isOneToOne: false
            referencedRelation: "dsos"
            referencedColumns: ["id"]
          },
        ]
      }
      dso_user_locations: {
        Row: {
          created_at: string
          dso_location_id: string
          dso_user_id: string
          id: string
        }
        Insert: {
          created_at?: string
          dso_location_id: string
          dso_user_id: string
          id?: string
        }
        Update: {
          created_at?: string
          dso_location_id?: string
          dso_user_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dso_user_locations_dso_location_id_fkey"
            columns: ["dso_location_id"]
            isOneToOne: false
            referencedRelation: "dso_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dso_user_locations_dso_user_id_fkey"
            columns: ["dso_user_id"]
            isOneToOne: false
            referencedRelation: "dso_users"
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
          first_name: string | null
          full_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          preferred_timezone: string
          role: Database["public"]["Enums"]["dso_user_role"]
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          avatar_url?: string | null
          created_at?: string
          dso_id: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          preferred_timezone?: string
          role?: Database["public"]["Enums"]["dso_user_role"]
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          avatar_url?: string | null
          created_at?: string
          dso_id?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          preferred_timezone?: string
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
          affiliation_reveal_policy: Database["public"]["Enums"]["dso_affiliation_reveal_policy"]
          banner_url: string | null
          brand_color: string | null
          contact_cta_label: string | null
          contact_cta_url: string | null
          corporate_affiliation_policy: string
          created_at: string
          culture_chips: string[]
          deleted_at: string | null
          description: string | null
          featured_until: string | null
          headquarters_city: string | null
          headquarters_state: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          mission: string | null
          name: string
          practice_count: number | null
          require_mfa: boolean
          slug: string
          status: Database["public"]["Enums"]["dso_status"]
          updated_at: string
          verified_at: string | null
          website: string | null
          why_join_us: Json
        }
        Insert: {
          affiliation_reveal_policy?: Database["public"]["Enums"]["dso_affiliation_reveal_policy"]
          banner_url?: string | null
          brand_color?: string | null
          contact_cta_label?: string | null
          contact_cta_url?: string | null
          corporate_affiliation_policy?: string
          created_at?: string
          culture_chips?: string[]
          deleted_at?: string | null
          description?: string | null
          featured_until?: string | null
          headquarters_city?: string | null
          headquarters_state?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          mission?: string | null
          name: string
          practice_count?: number | null
          require_mfa?: boolean
          slug: string
          status?: Database["public"]["Enums"]["dso_status"]
          updated_at?: string
          verified_at?: string | null
          website?: string | null
          why_join_us?: Json
        }
        Update: {
          affiliation_reveal_policy?: Database["public"]["Enums"]["dso_affiliation_reveal_policy"]
          banner_url?: string | null
          brand_color?: string | null
          contact_cta_label?: string | null
          contact_cta_url?: string | null
          corporate_affiliation_policy?: string
          created_at?: string
          culture_chips?: string[]
          deleted_at?: string | null
          description?: string | null
          featured_until?: string | null
          headquarters_city?: string | null
          headquarters_state?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          mission?: string | null
          name?: string
          practice_count?: number | null
          require_mfa?: boolean
          slug?: string
          status?: Database["public"]["Enums"]["dso_status"]
          updated_at?: string
          verified_at?: string | null
          website?: string | null
          why_join_us?: Json
        }
        Relationships: []
      }
      email_log: {
        Row: {
          bounce_kind: string | null
          bounced_at: string | null
          clicked_at: string | null
          complained_at: string | null
          created_at: string
          delivered_at: string | null
          error: string | null
          from_email: string | null
          id: string
          last_event: string | null
          last_event_at: string | null
          opened_at: string | null
          related_candidate_id: string | null
          related_dso_id: string | null
          resend_message_id: string | null
          status: string
          subject: string | null
          template: string
          to_email: string
        }
        Insert: {
          bounce_kind?: string | null
          bounced_at?: string | null
          clicked_at?: string | null
          complained_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          from_email?: string | null
          id?: string
          last_event?: string | null
          last_event_at?: string | null
          opened_at?: string | null
          related_candidate_id?: string | null
          related_dso_id?: string | null
          resend_message_id?: string | null
          status: string
          subject?: string | null
          template: string
          to_email: string
        }
        Update: {
          bounce_kind?: string | null
          bounced_at?: string | null
          clicked_at?: string | null
          complained_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          from_email?: string | null
          id?: string
          last_event?: string | null
          last_event_at?: string | null
          opened_at?: string | null
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
      email_templates: {
        Row: {
          body_html: string
          created_at: string
          description: string | null
          dso_id: string
          id: string
          is_archived: boolean
          is_custom: boolean
          kind: string
          name: string | null
          subject: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body_html: string
          created_at?: string
          description?: string | null
          dso_id: string
          id?: string
          is_archived?: boolean
          is_custom?: boolean
          kind: string
          name?: string | null
          subject: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body_html?: string
          created_at?: string
          description?: string | null
          dso_id?: string
          id?: string
          is_archived?: boolean
          is_custom?: boolean
          kind?: string
          name?: string | null
          subject?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_dso_id_fkey"
            columns: ["dso_id"]
            isOneToOne: false
            referencedRelation: "dsos"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_archived_threads: {
        Row: {
          application_id: string
          archived_at: string
          auth_user_id: string
          id: string
        }
        Insert: {
          application_id: string
          archived_at?: string
          auth_user_id: string
          id?: string
        }
        Update: {
          application_id?: string
          archived_at?: string
          auth_user_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_archived_threads_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_bookings: {
        Row: {
          candidate_confirmed_at: string
          candidate_notes: string | null
          id: string
          proposal_id: string
          reminder_1h_sent_at: string | null
          reminder_24h_sent_at: string | null
          selected_option_id: string
        }
        Insert: {
          candidate_confirmed_at?: string
          candidate_notes?: string | null
          id?: string
          proposal_id: string
          reminder_1h_sent_at?: string | null
          reminder_24h_sent_at?: string | null
          selected_option_id: string
        }
        Update: {
          candidate_confirmed_at?: string
          candidate_notes?: string | null
          id?: string
          proposal_id?: string
          reminder_1h_sent_at?: string | null
          reminder_24h_sent_at?: string | null
          selected_option_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_bookings_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "interview_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_bookings_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "interview_proposal_options"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_calendar_events: {
        Row: {
          auth_user_id: string
          booking_id: string
          created_at: string
          id: string
          meeting_url: string | null
          provider: Database["public"]["Enums"]["calendar_provider"]
          provider_event_id: string
        }
        Insert: {
          auth_user_id: string
          booking_id: string
          created_at?: string
          id?: string
          meeting_url?: string | null
          provider: Database["public"]["Enums"]["calendar_provider"]
          provider_event_id: string
        }
        Update: {
          auth_user_id?: string
          booking_id?: string
          created_at?: string
          id?: string
          meeting_url?: string | null
          provider?: Database["public"]["Enums"]["calendar_provider"]
          provider_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_calendar_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "interview_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_proposal_options: {
        Row: {
          created_at: string
          id: string
          proposal_id: string
          sort_order: number
          start_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          proposal_id: string
          sort_order?: number
          start_at: string
        }
        Update: {
          created_at?: string
          id?: string
          proposal_id?: string
          sort_order?: number
          start_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_proposal_options_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "interview_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_proposals: {
        Row: {
          application_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          created_at: string
          duration_minutes: number
          id: string
          interview_kind: Database["public"]["Enums"]["interview_kind"]
          location_text: string | null
          message_to_candidate: string | null
          proposed_by: string | null
          status: Database["public"]["Enums"]["interview_proposal_status"]
          updated_at: string
        }
        Insert: {
          application_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          interview_kind?: Database["public"]["Enums"]["interview_kind"]
          location_text?: string | null
          message_to_candidate?: string | null
          proposed_by?: string | null
          status?: Database["public"]["Enums"]["interview_proposal_status"]
          updated_at?: string
        }
        Update: {
          application_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          interview_kind?: Database["public"]["Enums"]["interview_kind"]
          location_text?: string | null
          message_to_candidate?: string | null
          proposed_by?: string | null
          status?: Database["public"]["Enums"]["interview_proposal_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_proposals_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "dso_users"
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
      job_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string
          file_size_bytes: number
          hide_until_applied: boolean
          id: string
          job_id: string
          mime_type: string
          sort_order: number
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name: string
          file_size_bytes: number
          hide_until_applied?: boolean
          id?: string
          job_id: string
          mime_type: string
          sort_order?: number
          storage_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string
          file_size_bytes?: number
          hide_until_applied?: boolean
          id?: string
          job_id?: string
          mime_type?: string
          sort_order?: number
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "dso_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_attachments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
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
          knockout: boolean
          knockout_correct_answer: Json | null
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
          knockout?: boolean
          knockout_correct_answer?: Json | null
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
          knockout?: boolean
          knockout_correct_answer?: Json | null
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
      job_verification_requirements: {
        Row: {
          created_at: string
          id: string
          job_id: string
          required: boolean
          verification_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          required?: boolean
          verification_type: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          required?: boolean
          verification_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_verification_requirements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_view_events: {
        Row: {
          id: string
          is_authenticated: boolean
          job_id: string
          referer_host: string | null
          session_id: string | null
          source: string | null
          viewed_at: string
        }
        Insert: {
          id?: string
          is_authenticated?: boolean
          job_id: string
          referer_host?: string | null
          session_id?: string | null
          source?: string | null
          viewed_at?: string
        }
        Update: {
          id?: string
          is_authenticated?: boolean
          job_id?: string
          referer_host?: string | null
          session_id?: string | null
          source?: string | null
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_view_events_job_id_fkey"
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
          authority_level: string | null
          benefits: string[] | null
          bonus_enabled: boolean
          bonus_structure: string | null
          bonus_target: number | null
          compensation_max: number | null
          compensation_min: number | null
          compensation_period:
            | Database["public"]["Enums"]["compensation_period"]
            | null
          compensation_type: string
          compensation_visible: boolean
          corporate_function: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          direct_reports_band: string | null
          dso_id: string
          education_requirement: string | null
          employment_type: Database["public"]["Enums"]["employment_type"]
          equity_note: string | null
          equity_offered: boolean
          expires_at: string | null
          external_links: Json
          hide_stages_from_candidate: boolean
          id: string
          indirect_reports_band: string | null
          industry_experience: string | null
          max_years_corporate_experience: number | null
          min_years_corporate_experience: number | null
          min_years_experience: number | null
          posted_at: string | null
          remote_state_restrictions: string[]
          reports_to: string | null
          requirements: string | null
          role_category: Database["public"]["Enums"]["role_category"]
          schedule_days: string[]
          schedule_evenings: boolean
          schedule_weekends: boolean
          scope: Database["public"]["Enums"]["job_scope"]
          visibility: Database["public"]["Enums"]["job_visibility"]
          search_vector: unknown
          slug: string
          specialty: string[]
          status: Database["public"]["Enums"]["job_status"]
          title: string
          travel_expectation: string | null
          travel_territory: string | null
          updated_at: string
          variable_comp_enabled: boolean
          variable_comp_structure: string | null
          variable_comp_target: number | null
          views: number
          work_mode: string | null
          work_mode_detail: string | null
        }
        Insert: {
          applications_count?: number
          authority_level?: string | null
          benefits?: string[] | null
          bonus_enabled?: boolean
          bonus_structure?: string | null
          bonus_target?: number | null
          compensation_max?: number | null
          compensation_min?: number | null
          compensation_period?:
            | Database["public"]["Enums"]["compensation_period"]
            | null
          compensation_type?: string
          compensation_visible?: boolean
          corporate_function?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          direct_reports_band?: string | null
          dso_id: string
          education_requirement?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          equity_note?: string | null
          equity_offered?: boolean
          expires_at?: string | null
          external_links?: Json
          hide_stages_from_candidate?: boolean
          id?: string
          indirect_reports_band?: string | null
          industry_experience?: string | null
          max_years_corporate_experience?: number | null
          min_years_corporate_experience?: number | null
          min_years_experience?: number | null
          posted_at?: string | null
          remote_state_restrictions?: string[]
          reports_to?: string | null
          requirements?: string | null
          role_category?: Database["public"]["Enums"]["role_category"]
          schedule_days?: string[]
          schedule_evenings?: boolean
          schedule_weekends?: boolean
          scope?: Database["public"]["Enums"]["job_scope"]
          visibility?: Database["public"]["Enums"]["job_visibility"]
          search_vector?: unknown
          slug: string
          specialty?: string[]
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          travel_expectation?: string | null
          travel_territory?: string | null
          updated_at?: string
          variable_comp_enabled?: boolean
          variable_comp_structure?: string | null
          variable_comp_target?: number | null
          views?: number
          work_mode?: string | null
          work_mode_detail?: string | null
        }
        Update: {
          applications_count?: number
          authority_level?: string | null
          benefits?: string[] | null
          bonus_enabled?: boolean
          bonus_structure?: string | null
          bonus_target?: number | null
          compensation_max?: number | null
          compensation_min?: number | null
          compensation_period?:
            | Database["public"]["Enums"]["compensation_period"]
            | null
          compensation_type?: string
          compensation_visible?: boolean
          corporate_function?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          direct_reports_band?: string | null
          dso_id?: string
          education_requirement?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          equity_note?: string | null
          equity_offered?: boolean
          expires_at?: string | null
          external_links?: Json
          hide_stages_from_candidate?: boolean
          id?: string
          indirect_reports_band?: string | null
          industry_experience?: string | null
          max_years_corporate_experience?: number | null
          min_years_corporate_experience?: number | null
          min_years_experience?: number | null
          posted_at?: string | null
          remote_state_restrictions?: string[]
          reports_to?: string | null
          requirements?: string | null
          role_category?: Database["public"]["Enums"]["role_category"]
          schedule_days?: string[]
          schedule_evenings?: boolean
          schedule_weekends?: boolean
          scope?: Database["public"]["Enums"]["job_scope"]
          visibility?: Database["public"]["Enums"]["job_visibility"]
          search_vector?: unknown
          slug?: string
          specialty?: string[]
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          travel_expectation?: string | null
          travel_territory?: string | null
          updated_at?: string
          variable_comp_enabled?: boolean
          variable_comp_structure?: string | null
          variable_comp_target?: number | null
          views?: number
          work_mode?: string | null
          work_mode_detail?: string | null
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
      mfa_recovery_codes: {
        Row: {
          auth_user_id: string
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
        }
        Insert: {
          auth_user_id: string
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
        }
        Update: {
          auth_user_id?: string
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
        }
        Relationships: []
      }
      notification_dispatch_log: {
        Row: {
          channel: string
          dispatched_at: string
          error_message: string | null
          event_kind: string
          id: string
          payload: Json
          resend_id: string | null
          status: string
          template_key: string | null
          user_id: string
        }
        Insert: {
          channel: string
          dispatched_at?: string
          error_message?: string | null
          event_kind: string
          id?: string
          payload?: Json
          resend_id?: string | null
          status: string
          template_key?: string | null
          user_id: string
        }
        Update: {
          channel?: string
          dispatched_at?: string
          error_message?: string | null
          event_kind?: string
          id?: string
          payload?: Json
          resend_id?: string | null
          status?: string
          template_key?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          channel: string
          enabled: boolean
          event_kind: string
          frequency: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: string
          enabled?: boolean
          event_kind: string
          frequency?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          enabled?: boolean
          event_kind?: string
          frequency?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          active: boolean
          body_template: string
          channel: string
          created_at: string
          dso_id: string | null
          event_kind: string
          id: string
          subject_template: string | null
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          body_template: string
          channel: string
          created_at?: string
          dso_id?: string | null
          event_kind: string
          id?: string
          subject_template?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          body_template?: string
          channel?: string
          created_at?: string
          dso_id?: string | null
          event_kind?: string
          id?: string
          subject_template?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_dso_id_fkey"
            columns: ["dso_id"]
            isOneToOne: false
            referencedRelation: "dsos"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_email_changes: {
        Row: {
          candidate_user_id: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          new_email: string
          old_email_notified_at: string | null
          otp_code_hash: string
          revoked_at: string | null
        }
        Insert: {
          candidate_user_id: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          new_email: string
          old_email_notified_at?: string | null
          otp_code_hash: string
          revoked_at?: string | null
        }
        Update: {
          candidate_user_id?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          new_email?: string
          old_email_notified_at?: string | null
          otp_code_hash?: string
          revoked_at?: string | null
        }
        Relationships: []
      }
      practice_fit_scores: {
        Row: {
          bucket: string
          candidate_id: string
          computed_at: string
          dimensions: Json
          id: string
          input_hash: string
          job_id: string
          narrative_candidate: string | null
          narrative_employer: string | null
          narrative_generated_at: string | null
          narrative_input_hash: string | null
          score: number
          top_factors: string[]
        }
        Insert: {
          bucket: string
          candidate_id: string
          computed_at?: string
          dimensions?: Json
          id?: string
          input_hash: string
          job_id: string
          narrative_candidate?: string | null
          narrative_employer?: string | null
          narrative_generated_at?: string | null
          narrative_input_hash?: string | null
          score: number
          top_factors?: string[]
        }
        Update: {
          bucket?: string
          candidate_id?: string
          computed_at?: string
          dimensions?: Json
          id?: string
          input_hash?: string
          job_id?: string
          narrative_candidate?: string | null
          narrative_employer?: string | null
          narrative_generated_at?: string | null
          narrative_input_hash?: string | null
          score?: number
          top_factors?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "practice_fit_scores_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_fit_scores_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_requests: {
        Row: {
          application_id: string
          candidate_id: string
          completed_at: string | null
          created_at: string
          decline_reason: string | null
          id: string
          reference_email: string
          reference_name: string
          reference_role: string | null
          relationship: string | null
          requested_by_user_id: string | null
          response_data: Json | null
          sent_at: string | null
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          application_id: string
          candidate_id: string
          completed_at?: string | null
          created_at?: string
          decline_reason?: string | null
          id?: string
          reference_email: string
          reference_name: string
          reference_role?: string | null
          relationship?: string | null
          requested_by_user_id?: string | null
          response_data?: Json | null
          sent_at?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          candidate_id?: string
          completed_at?: string | null
          created_at?: string
          decline_reason?: string | null
          id?: string
          reference_email?: string
          reference_name?: string
          reference_role?: string | null
          relationship?: string | null
          requested_by_user_id?: string | null
          response_data?: Json | null
          sent_at?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_requests_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_jobs: {
        Row: {
          candidate_id: string
          id: string
          job_id: string
          saved_at: string
        }
        Insert: {
          candidate_id: string
          id?: string
          job_id: string
          saved_at?: string
        }
        Update: {
          candidate_id?: string
          id?: string
          job_id?: string
          saved_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_jobs_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
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
      application_message_unread_counts: {
        Row: {
          application_id: string | null
          sender_role: string | null
          unread_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "application_messages_application_id_fkey"
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
      dso_can_read_candidate: {
        Args: { p_candidate_id: string }
        Returns: boolean
      }
      dso_can_read_fit_score: {
        Args: { p_candidate_id: string; p_job_id: string }
        Returns: boolean
      }
      increment_job_view_count: {
        Args: { p_job_id: string }
        Returns: undefined
      }
      is_dso_admin: { Args: { target_dso_id: string }; Returns: boolean }
      is_internal_admin: { Args: never; Returns: boolean }
      is_kind_stage: {
        Args: { p_kind: string; p_stage_id: string }
        Returns: boolean
      }
      job_has_accessible_location: {
        Args: { p_job_id: string }
        Returns: boolean
      }
      job_has_private_affiliation_inherit: {
        Args: { p_job_id: string }
        Returns: boolean
      }
      job_is_publicly_dso_affiliated: {
        Args: { p_job_id: string }
        Returns: boolean
      }
      search_jobs_public: {
        Args: {
          category_filter?: Database["public"]["Enums"]["role_category"]
          employment_filter?: Database["public"]["Enums"]["employment_type"]
          near_lat?: number | null
          near_lng?: number | null
          posted_within_days?: number
          query_text?: string
          state_filter?: string
          within_miles?: number | null
        }
        Returns: {
          applications_count: number
          authority_level: string | null
          benefits: string[] | null
          bonus_enabled: boolean
          bonus_structure: string | null
          bonus_target: number | null
          compensation_max: number | null
          compensation_min: number | null
          compensation_period:
            | Database["public"]["Enums"]["compensation_period"]
            | null
          compensation_type: string
          compensation_visible: boolean
          corporate_function: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          direct_reports_band: string | null
          dso_id: string
          education_requirement: string | null
          employment_type: Database["public"]["Enums"]["employment_type"]
          equity_note: string | null
          equity_offered: boolean
          expires_at: string | null
          external_links: Json
          hide_stages_from_candidate: boolean
          id: string
          indirect_reports_band: string | null
          industry_experience: string | null
          max_years_corporate_experience: number | null
          min_years_corporate_experience: number | null
          min_years_experience: number | null
          posted_at: string | null
          remote_state_restrictions: string[]
          reports_to: string | null
          requirements: string | null
          role_category: Database["public"]["Enums"]["role_category"]
          schedule_days: string[]
          schedule_evenings: boolean
          schedule_weekends: boolean
          scope: Database["public"]["Enums"]["job_scope"]
          visibility: Database["public"]["Enums"]["job_visibility"]
          search_vector: unknown
          slug: string
          specialty: string[]
          status: Database["public"]["Enums"]["job_status"]
          title: string
          travel_expectation: string | null
          travel_territory: string | null
          updated_at: string
          variable_comp_enabled: boolean
          variable_comp_structure: string | null
          variable_comp_target: number | null
          views: number
          work_mode: string | null
          work_mode_detail: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      seed_dso_default_pipeline_stages: {
        Args: { p_dso_id: string }
        Returns: undefined
      }
      seed_outreach_templates_for_dso: {
        Args: { p_dso_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
      user_accessible_location_ids: { Args: never; Returns: string[] }
      user_can_access_application_interview: {
        Args: { p_application_id: string }
        Returns: boolean
      }
      user_can_access_job: { Args: { p_job_id: string }; Returns: boolean }
    }
    Enums: {
      admin_role: "superadmin" | "support"
      calendar_provider: "google" | "microsoft"
      candidate_availability: "immediate" | "2_weeks" | "1_month" | "passive"
      candidate_visibility: "hidden" | "recruiters_only" | "open_to_work"
      compensation_period: "hourly" | "daily" | "annual"
      dso_affiliation_reveal_policy: "never" | "after_hire" | "per_application"
      dso_status: "pending" | "active" | "suspended" | "cancelled"
      dso_user_role: "owner" | "admin" | "recruiter" | "hiring_manager"
      email_template_kind:
        | "candidate.application_received"
        | "application.message_received"
        | "candidate.stage_changed"
      employment_type: "full_time" | "part_time" | "contract" | "prn" | "locum"
      interview_kind: "phone" | "video" | "in_person" | "other"
      interview_proposal_status: "pending" | "booked" | "cancelled" | "expired"
      job_scope: "location" | "regional" | "corporate"
      job_visibility: "public" | "internal_only"
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
      subscription_tier: "starter" | "growth" | "enterprise" | "solo" | "scale"
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
      calendar_provider: ["google", "microsoft"],
      candidate_availability: ["immediate", "2_weeks", "1_month", "passive"],
      candidate_visibility: ["hidden", "recruiters_only", "open_to_work"],
      compensation_period: ["hourly", "daily", "annual"],
      dso_affiliation_reveal_policy: ["never", "after_hire", "per_application"],
      dso_status: ["pending", "active", "suspended", "cancelled"],
      dso_user_role: ["owner", "admin", "recruiter", "hiring_manager"],
      email_template_kind: [
        "candidate.application_received",
        "application.message_received",
        "candidate.stage_changed",
      ],
      employment_type: ["full_time", "part_time", "contract", "prn", "locum"],
      interview_kind: ["phone", "video", "in_person", "other"],
      interview_proposal_status: ["pending", "booked", "cancelled", "expired"],
      job_scope: ["location", "regional", "corporate"],
      job_visibility: ["public", "internal_only"],
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
      subscription_tier: ["starter", "growth", "enterprise", "solo", "scale"],
    },
  },
} as const
