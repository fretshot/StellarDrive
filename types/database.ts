export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      action_executions: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          preview_id: string
          result: Json | null
          started_at: string
          status: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          preview_id: string
          result?: Json | null
          started_at?: string
          status?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          preview_id?: string
          result?: Json | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_executions_preview_id_fkey"
            columns: ["preview_id"]
            isOneToOne: true
            referencedRelation: "action_previews"
            referencedColumns: ["id"]
          },
        ]
      }
      action_previews: {
        Row: {
          action_type: string
          batch_index: number
          confirmed_at: string | null
          created_at: string
          id: string
          message_id: string | null
          org_id: string
          payload: Json
          preview: Json
          session_id: string
          status: string
          user_id: string
          validation: Json
        }
        Insert: {
          action_type: string
          batch_index?: number
          confirmed_at?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          org_id: string
          payload: Json
          preview: Json
          session_id: string
          status?: string
          user_id: string
          validation?: Json
        }
        Update: {
          action_type?: string
          batch_index?: number
          confirmed_at?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          org_id?: string
          payload?: Json
          preview?: Json
          session_id?: string
          status?: string
          user_id?: string
          validation?: Json
        }
        Relationships: [
          {
            foreignKeyName: "action_previews_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_previews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "connected_salesforce_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_previews_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_previews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action_type: string
          created_at: string
          entity_ref: string | null
          entity_type: string | null
          id: string
          metadata: Json
          org_id: string | null
          outcome: string
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          entity_ref?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          org_id?: string | null
          outcome: string
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          entity_ref?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          org_id?: string | null
          outcome?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "connected_salesforce_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: Json
          created_at: string
          id: string
          role: string
          session_id: string
          tool_calls: Json | null
        }
        Insert: {
          content: Json
          created_at?: string
          id?: string
          role: string
          session_id: string
          tool_calls?: Json | null
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          active_org_id: string | null
          created_at: string
          id: string
          title: string
          user_id: string
        }
        Insert: {
          active_org_id?: string | null
          created_at?: string
          id?: string
          title?: string
          user_id: string
        }
        Update: {
          active_org_id?: string | null
          created_at?: string
          id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_active_org_id_fkey"
            columns: ["active_org_id"]
            isOneToOne: false
            referencedRelation: "connected_salesforce_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_salesforce_orgs: {
        Row: {
          access_token_ct: string
          access_token_iv: string
          alias: string | null
          created_at: string
          display_name: string | null
          expires_at: string | null
          id: string
          instance_url: string
          issued_at: string
          last_error: string | null
          last_sync_at: string | null
          login_host: string
          org_type: string
          refresh_token_ct: string
          refresh_token_iv: string
          scopes: string[]
          sf_created_at: string | null
          sf_org_id: string
          status: string
          user_id: string
        }
        Insert: {
          access_token_ct: string
          access_token_iv: string
          alias?: string | null
          created_at?: string
          display_name?: string | null
          expires_at?: string | null
          id?: string
          instance_url: string
          issued_at?: string
          last_error?: string | null
          last_sync_at?: string | null
          login_host: string
          org_type: string
          refresh_token_ct: string
          refresh_token_iv: string
          scopes?: string[]
          sf_created_at?: string | null
          sf_org_id: string
          status?: string
          user_id: string
        }
        Update: {
          access_token_ct?: string
          access_token_iv?: string
          alias?: string | null
          created_at?: string
          display_name?: string | null
          expires_at?: string | null
          id?: string
          instance_url?: string
          issued_at?: string
          last_error?: string | null
          last_sync_at?: string | null
          login_host?: string
          org_type?: string
          refresh_token_ct?: string
          refresh_token_iv?: string
          scopes?: string[]
          sf_created_at?: string | null
          sf_org_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_salesforce_orgs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      metadata_sync_jobs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          kind: string
          org_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          org_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          org_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "metadata_sync_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "connected_salesforce_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      salesforce_metadata_classes: {
        Row: {
          api_name: string
          api_version: string | null
          body_hash: string | null
          id: string
          last_synced_at: string | null
          org_id: string
          status: string | null
          summary: Json
        }
        Insert: {
          api_name: string
          api_version?: string | null
          body_hash?: string | null
          id?: string
          last_synced_at?: string | null
          org_id: string
          status?: string | null
          summary?: Json
        }
        Update: {
          api_name?: string
          api_version?: string | null
          body_hash?: string | null
          id?: string
          last_synced_at?: string | null
          org_id?: string
          status?: string | null
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "salesforce_metadata_classes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "connected_salesforce_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      salesforce_metadata_fields: {
        Row: {
          api_name: string
          data_type: string | null
          id: string
          is_custom: boolean
          is_required: boolean
          label: string | null
          object_id: string
          org_id: string
          reference_to: string[]
          summary: Json
        }
        Insert: {
          api_name: string
          data_type?: string | null
          id?: string
          is_custom?: boolean
          is_required?: boolean
          label?: string | null
          object_id: string
          org_id: string
          reference_to?: string[]
          summary?: Json
        }
        Update: {
          api_name?: string
          data_type?: string | null
          id?: string
          is_custom?: boolean
          is_required?: boolean
          label?: string | null
          object_id?: string
          org_id?: string
          reference_to?: string[]
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "salesforce_metadata_fields_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "salesforce_metadata_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salesforce_metadata_fields_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "connected_salesforce_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      salesforce_metadata_flows: {
        Row: {
          api_name: string
          id: string
          label: string | null
          last_synced_at: string | null
          org_id: string
          process_type: string | null
          status: string | null
        }
        Insert: {
          api_name: string
          id?: string
          label?: string | null
          last_synced_at?: string | null
          org_id: string
          process_type?: string | null
          status?: string | null
        }
        Update: {
          api_name?: string
          id?: string
          label?: string | null
          last_synced_at?: string | null
          org_id?: string
          process_type?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salesforce_metadata_flows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "connected_salesforce_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      salesforce_metadata_objects: {
        Row: {
          api_name: string
          createable: boolean
          id: string
          is_custom: boolean
          key_prefix: string | null
          label: string | null
          last_synced_at: string | null
          org_id: string
          summary: Json
        }
        Insert: {
          api_name: string
          createable?: boolean
          id?: string
          is_custom?: boolean
          key_prefix?: string | null
          label?: string | null
          last_synced_at?: string | null
          org_id: string
          summary?: Json
        }
        Update: {
          api_name?: string
          createable?: boolean
          id?: string
          is_custom?: boolean
          key_prefix?: string | null
          label?: string | null
          last_synced_at?: string | null
          org_id?: string
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "salesforce_metadata_objects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "connected_salesforce_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      salesforce_metadata_triggers: {
        Row: {
          api_name: string
          events: string[]
          id: string
          last_synced_at: string | null
          object_name: string | null
          org_id: string
          status: string | null
        }
        Insert: {
          api_name: string
          events?: string[]
          id?: string
          last_synced_at?: string | null
          object_name?: string | null
          org_id: string
          status?: string | null
        }
        Update: {
          api_name?: string
          events?: string[]
          id?: string
          last_synced_at?: string | null
          object_name?: string | null
          org_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salesforce_metadata_triggers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "connected_salesforce_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      salesforce_metadata_workflows: {
        Row: {
          active: boolean
          api_name: string
          id: string
          last_synced_at: string | null
          object_name: string | null
          org_id: string
        }
        Insert: {
          active?: boolean
          api_name: string
          id?: string
          last_synced_at?: string | null
          object_name?: string | null
          org_id: string
        }
        Update: {
          active?: boolean
          api_name?: string
          id?: string
          last_synced_at?: string | null
          object_name?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salesforce_metadata_workflows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "connected_salesforce_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
