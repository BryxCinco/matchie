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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      application_events: {
        Row: {
          application_id: string
          created_at: string
          email_message_id: string | null
          from_status: Database["public"]["Enums"]["application_status"] | null
          id: string
          note: string | null
          source: Database["public"]["Enums"]["event_source"]
          to_status: Database["public"]["Enums"]["application_status"]
          user_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          email_message_id?: string | null
          from_status?: Database["public"]["Enums"]["application_status"] | null
          id?: string
          note?: string | null
          source?: Database["public"]["Enums"]["event_source"]
          to_status: Database["public"]["Enums"]["application_status"]
          user_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          email_message_id?: string | null
          from_status?: Database["public"]["Enums"]["application_status"] | null
          id?: string
          note?: string | null
          source?: Database["public"]["Enums"]["event_source"]
          to_status?: Database["public"]["Enums"]["application_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_user_id_fkey"
            columns: ["application_id", "user_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "application_events_email_message_id_fkey"
            columns: ["email_message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          applied_at: string | null
          contacts: Json
          created_at: string
          follow_up_draft: string | null
          follow_up_drafted_at: string | null
          follow_up_subject: string | null
          id: string
          job_id: string
          last_activity_at: string
          notes: string | null
          resume_version_id: string | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          contacts?: Json
          created_at?: string
          follow_up_draft?: string | null
          follow_up_drafted_at?: string | null
          follow_up_subject?: string | null
          id?: string
          job_id: string
          last_activity_at?: string
          notes?: string | null
          resume_version_id?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string | null
          contacts?: Json
          created_at?: string
          follow_up_draft?: string | null
          follow_up_drafted_at?: string | null
          follow_up_subject?: string | null
          id?: string
          job_id?: string
          last_activity_at?: string
          notes?: string | null
          resume_version_id?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_resume_version_id_user_id_fkey"
            columns: ["resume_version_id", "user_id"]
            isOneToOne: false
            referencedRelation: "resume_versions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      ats_companies: {
        Row: {
          active: boolean
          board_token: string
          company_id: string | null
          created_at: string
          id: string
          last_error: string | null
          last_polled_at: string | null
          platform: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          board_token: string
          company_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_polled_at?: string | null
          platform: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          board_token?: string
          company_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_polled_at?: string | null
          platform?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ats_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          enriched_at: string | null
          id: string
          industry: string | null
          name: string
          name_normalized: string
          size: string | null
          summary: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          enriched_at?: string | null
          id?: string
          industry?: string | null
          name: string
          name_normalized: string
          size?: string | null
          summary?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          enriched_at?: string | null
          id?: string
          industry?: string | null
          name?: string
          name_normalized?: string
          size?: string | null
          summary?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      email_messages: {
        Row: {
          body: string | null
          classification_confidence: number | null
          classification_reasoning: string | null
          classified_as: string | null
          created_at: string
          from_addr: string
          id: string
          linked_application_id: string | null
          message_id: string | null
          parse_error: string | null
          parse_failed: boolean
          received_at: string
          subject: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          classification_confidence?: number | null
          classification_reasoning?: string | null
          classified_as?: string | null
          created_at?: string
          from_addr: string
          id?: string
          linked_application_id?: string | null
          message_id?: string | null
          parse_error?: string | null
          parse_failed?: boolean
          received_at?: string
          subject?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          classification_confidence?: number | null
          classification_reasoning?: string | null
          classified_as?: string | null
          created_at?: string
          from_addr?: string
          id?: string
          linked_application_id?: string | null
          message_id?: string | null
          parse_error?: string | null
          parse_failed?: boolean
          received_at?: string
          subject?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_linked_application_id_user_id_fkey"
            columns: ["linked_application_id", "user_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      interviews: {
        Row: {
          application_id: string
          created_at: string
          email_message_id: string | null
          id: string
          prep_notes: string | null
          round: number
          scheduled_at: string | null
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          email_message_id?: string | null
          id?: string
          prep_notes?: string | null
          round: number
          scheduled_at?: string | null
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          email_message_id?: string | null
          id?: string
          prep_notes?: string | null
          round?: number
          scheduled_at?: string | null
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_email_message_id_fkey"
            columns: ["email_message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_application_id_user_id_fkey"
            columns: ["application_id", "user_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      job_queries: {
        Row: {
          created_at: string
          digest_enabled: boolean
          filters: Json
          id: string
          keywords: string
          name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          digest_enabled?: boolean
          filters?: Json
          id?: string
          keywords: string
          name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          digest_enabled?: boolean
          filters?: Json
          id?: string
          keywords?: string
          name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      job_sources: {
        Row: {
          created_at: string
          id: string
          job_id: string
          platform: string
          raw_payload: Json | null
          seen_at: string
          source_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          platform: string
          raw_payload?: Json | null
          seen_at?: string
          source_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          platform?: string
          raw_payload?: Json | null
          seen_at?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_sources_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          canonical_hash: string
          company_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          experience_min_years: number | null
          geo: unknown
          id: string
          location: string | null
          posted_at: string | null
          salary_max: number | null
          salary_min: number | null
          search_vector: unknown
          source: string
          source_url: string | null
          title: string
          updated_at: string
          work_setup: Database["public"]["Enums"]["work_setup"] | null
        }
        Insert: {
          canonical_hash: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          experience_min_years?: number | null
          geo?: unknown
          id?: string
          location?: string | null
          posted_at?: string | null
          salary_max?: number | null
          salary_min?: number | null
          search_vector?: unknown
          source: string
          source_url?: string | null
          title: string
          updated_at?: string
          work_setup?: Database["public"]["Enums"]["work_setup"] | null
        }
        Update: {
          canonical_hash?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          experience_min_years?: number | null
          geo?: unknown
          id?: string
          location?: string | null
          posted_at?: string | null
          salary_max?: number | null
          salary_min?: number | null
          search_vector?: unknown
          source?: string
          source_url?: string | null
          title?: string
          updated_at?: string
          work_setup?: Database["public"]["Enums"]["work_setup"] | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          digest_sent_at: string | null
          fit_score: number
          id: string
          job_id: string
          matched_skills: string[]
          missing_skills: string[]
          model: string | null
          reasoning: string | null
          red_flags: string[]
          scored_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          digest_sent_at?: string | null
          fit_score: number
          id?: string
          job_id: string
          matched_skills?: string[]
          missing_skills?: string[]
          model?: string | null
          reasoning?: string | null
          red_flags?: string[]
          scored_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          digest_sent_at?: string | null
          fit_score?: number
          id?: string
          job_id?: string
          matched_skills?: string[]
          missing_skills?: string[]
          model?: string | null
          reasoning?: string | null
          red_flags?: string[]
          scored_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          home_lat: number | null
          home_lng: number | null
          id: string
          locale: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          home_lat?: number | null
          home_lng?: number | null
          id?: string
          locale?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          home_lat?: number | null
          home_lng?: number | null
          id?: string
          locale?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      resume_versions: {
        Row: {
          content: Json
          created_at: string
          id: string
          job_id: string | null
          label: string
          pdf_path: string | null
          resume_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: Json
          created_at?: string
          id?: string
          job_id?: string | null
          label: string
          pdf_path?: string | null
          resume_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          job_id?: string | null
          label?: string
          pdf_path?: string | null
          resume_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_versions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_versions_resume_id_user_id_fkey"
            columns: ["resume_id", "user_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      resumes: {
        Row: {
          content: Json
          created_at: string
          id: string
          is_master: boolean
          source_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: Json
          created_at?: string
          id?: string
          is_master?: boolean
          source_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          is_master?: boolean
          source_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      search_vocabulary: {
        Row: {
          alias_group: string | null
          soft: boolean
          term: string
        }
        Insert: {
          alias_group?: string | null
          soft?: boolean
          term: string
        }
        Update: {
          alias_group?: string | null
          soft?: boolean
          term?: string
        }
        Relationships: []
      }
      seeker_profiles: {
        Row: {
          avoid_industries: string[]
          created_at: string
          home_city: string | null
          id: string
          max_commute_km: number | null
          min_salary: number | null
          preferred_locations: string[]
          skills: string[]
          target_roles: string[]
          updated_at: string
          user_id: string
          work_setup: Database["public"]["Enums"]["work_setup"][]
          years_experience: number | null
        }
        Insert: {
          avoid_industries?: string[]
          created_at?: string
          home_city?: string | null
          id?: string
          max_commute_km?: number | null
          min_salary?: number | null
          preferred_locations?: string[]
          skills?: string[]
          target_roles?: string[]
          updated_at?: string
          user_id: string
          work_setup?: Database["public"]["Enums"]["work_setup"][]
          years_experience?: number | null
        }
        Update: {
          avoid_industries?: string[]
          created_at?: string
          home_city?: string | null
          id?: string
          max_commute_km?: number | null
          min_salary?: number | null
          preferred_locations?: string[]
          skills?: string[]
          target_roles?: string[]
          updated_at?: string
          user_id?: string
          work_setup?: Database["public"]["Enums"]["work_setup"][]
          years_experience?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_email_to_application: {
        Args: {
          p_application_id: string
          p_email_message_id: string
          p_note?: string
          p_to_status?: Database["public"]["Enums"]["application_status"]
        }
        Returns: undefined
      }
      delete_old_jobs: { Args: { retention_days?: number }; Returns: number }
      record_email_interview: {
        Args: {
          p_application_id: string
          p_email_message_id: string
          p_round?: number
          p_scheduled_at?: string
        }
        Returns: number
      }
      shortlist_my_jobs: {
        Args: { p_limit?: number }
        Returns: {
          job_id: string
          rank: number
        }[]
      }
      mark_ghosted_applications: {
        Args: { p_days?: number }
        Returns: {
          application_id: string
          user_id: string
        }[]
      }
      shortlist_jobs: {
        Args: { p_limit?: number; p_live_days?: number; p_user_id: string }
        Returns: {
          job_id: string
          rank: number
        }[]
      }
    }
    Enums: {
      application_status:
        | "saved"
        | "applied"
        | "screening"
        | "assessment"
        | "interview"
        | "final"
        | "offer"
        | "accepted"
        | "rejected"
        | "ghosted"
        | "withdrawn"
      event_source: "manual" | "email" | "system"
      work_setup: "onsite" | "hybrid" | "remote"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      application_status: [
        "saved",
        "applied",
        "screening",
        "assessment",
        "interview",
        "final",
        "offer",
        "accepted",
        "rejected",
        "ghosted",
        "withdrawn",
      ],
      event_source: ["manual", "email", "system"],
      work_setup: ["onsite", "hybrid", "remote"],
    },
  },
} as const
