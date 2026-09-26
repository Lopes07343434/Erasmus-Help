/**
 * Supabase database types — GENERATED from the local stack with every migration in
 * supabase/migrations applied (`supabase gen types typescript --local --schema public`, then
 * formatted). Regenerate after changing a migration:
 *   npx supabase gen types typescript --local --schema public > src/services/supabase/database.types.ts
 *   (or --project-id nankvmfyyncoopoxqibm once the project is linked)
 *
 * Notes the generator cannot express (keep in mind when querying):
 *  - profiles: `authenticated` can only SELECT id, public_id, display_name, role, monitor_status,
 *    my_language, avatar_path, created_at → always select explicit columns (select('*') fails
 *    with 42501). Own full row: rpc('get_my_profile'). Writes: rpc('upsert_my_profile'),
 *    rpc('set_my_avatar') or UPDATE of display_name, my_language, app_language, country_code, city.
 *    public_id is assigned by the database (gap-free counter) and can never be written.
 *  - monitor_students / conversations / conversation_members: read-only for clients (RPCs write).
 *  - messages: INSERT only id, conversation_id, sender_id, kind, body, audio_path,
 *    audio_duration_ms, audio_mime (created_at is server time). No UPDATE/DELETE.
 *  - RPC result columns are typed non-null by the generator; nullable ones (avatar_path,
 *    other_user, last_message, …) are validated in src/services/chat/mappers.ts.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '13.0.5'
  }
  public: {
    Tables: {
      conversation_members: {
        Row: {
          added_by: string | null
          conversation_id: string
          joined_at: string
          last_read_at: string
          member_role: Database['public']['Enums']['member_role']
          user_id: string
        }
        Insert: {
          added_by?: string | null
          conversation_id: string
          joined_at?: string
          last_read_at?: string
          member_role?: Database['public']['Enums']['member_role']
          user_id: string
        }
        Update: {
          added_by?: string | null
          conversation_id?: string
          joined_at?: string
          last_read_at?: string
          member_role?: Database['public']['Enums']['member_role']
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'conversation_members_added_by_fkey'
            columns: ['added_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conversation_members_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conversation_members_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      conversations: {
        Row: {
          allow_leave: boolean
          archived_at: string | null
          avatar_path: string | null
          created_at: string
          created_by: string | null
          dm_user_a: string | null
          dm_user_b: string | null
          id: string
          kind: Database['public']['Enums']['conversation_kind']
          last_message_at: string | null
          name: string | null
        }
        Insert: {
          allow_leave?: boolean
          archived_at?: string | null
          avatar_path?: string | null
          created_at?: string
          created_by?: string | null
          dm_user_a?: string | null
          dm_user_b?: string | null
          id?: string
          kind: Database['public']['Enums']['conversation_kind']
          last_message_at?: string | null
          name?: string | null
        }
        Update: {
          allow_leave?: boolean
          archived_at?: string | null
          avatar_path?: string | null
          created_at?: string
          created_by?: string | null
          dm_user_a?: string | null
          dm_user_b?: string | null
          id?: string
          kind?: Database['public']['Enums']['conversation_kind']
          last_message_at?: string | null
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'conversations_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conversations_dm_user_a_fkey'
            columns: ['dm_user_a']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conversations_dm_user_b_fkey'
            columns: ['dm_user_b']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      messages: {
        Row: {
          audio_duration_ms: number | null
          audio_mime: string | null
          audio_path: string | null
          body: string | null
          conversation_id: string
          created_at: string
          id: string
          kind: Database['public']['Enums']['message_kind']
          sender_id: string
        }
        Insert: {
          audio_duration_ms?: number | null
          audio_mime?: string | null
          audio_path?: string | null
          body?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          kind: Database['public']['Enums']['message_kind']
          sender_id: string
        }
        Update: {
          audio_duration_ms?: number | null
          audio_mime?: string | null
          audio_path?: string | null
          body?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          kind?: Database['public']['Enums']['message_kind']
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'messages_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'messages_sender_id_fkey'
            columns: ['sender_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      monitor_students: {
        Row: {
          created_at: string
          created_by: string | null
          monitor_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          monitor_id: string
          student_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          monitor_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'monitor_students_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'monitor_students_monitor_id_fkey'
            columns: ['monitor_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'monitor_students_student_id_fkey'
            columns: ['student_id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          app_language: string | null
          avatar_path: string | null
          can_manage_groups: boolean
          city: string | null
          country_code: string | null
          created_at: string
          display_name: string
          id: string
          monitor_status: Database['public']['Enums']['monitor_status'] | null
          my_language: string | null
          public_id: number
          role: Database['public']['Enums']['user_role']
          updated_at: string
        }
        Insert: {
          app_language?: string | null
          avatar_path?: string | null
          can_manage_groups?: boolean
          city?: string | null
          country_code?: string | null
          created_at?: string
          display_name: string
          id: string
          monitor_status?: Database['public']['Enums']['monitor_status'] | null
          my_language?: string | null
          public_id: number
          role: Database['public']['Enums']['user_role']
          updated_at?: string
        }
        Update: {
          app_language?: string | null
          avatar_path?: string | null
          can_manage_groups?: boolean
          city?: string | null
          country_code?: string | null
          created_at?: string
          display_name?: string
          id?: string
          monitor_status?: Database['public']['Enums']['monitor_status'] | null
          my_language?: string | null
          public_id?: number
          role?: Database['public']['Enums']['user_role']
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_group_member: { Args: { p_as_manager?: boolean; p_conversation: string; p_public_id: number }; Returns: string }
      admin_list_users: {
        Args: { p_limit?: number; p_search?: string }
        Returns: {
          can_manage_groups: boolean
          created_at: string
          display_name: string
          id: string
          monitor_display_name: string
          monitor_id: string
          monitor_public_id: number
          monitor_status: Database['public']['Enums']['monitor_status']
          public_id: number
          role: Database['public']['Enums']['user_role']
          students_count: number
        }[]
      }
      admin_set_can_manage_groups: { Args: { p_user_id: string; p_value: boolean }; Returns: undefined }
      admin_set_role: { Args: { p_role: Database['public']['Enums']['user_role']; p_user_id: string }; Returns: undefined }
      admin_set_student_monitor: { Args: { p_monitor_public_id?: number; p_student_public_id: number }; Returns: string }
      admin_verify_monitor: { Args: { p_user_id: string; p_verified: boolean }; Returns: undefined }
      associate_student: { Args: { p_student_public_id: number }; Returns: string }
      create_group: { Args: { p_allow_leave?: boolean; p_member_public_ids?: number[]; p_name: string }; Returns: string }
      delete_group: { Args: { p_conversation: string }; Returns: undefined }
      get_my_profile: {
        Args: Record<PropertyKey, never>
        Returns: {
          app_language: string | null
          avatar_path: string | null
          can_manage_groups: boolean
          city: string | null
          country_code: string | null
          created_at: string
          display_name: string
          id: string
          monitor_status: Database['public']['Enums']['monitor_status'] | null
          my_language: string | null
          public_id: number
          role: Database['public']['Enums']['user_role']
          updated_at: string
        }[]
        SetofOptions: {
          from: '*'
          to: 'profiles'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      leave_group: { Args: { p_conversation: string }; Returns: undefined }
      list_conversation_members: {
        Args: { p_conversation: string }
        Returns: {
          avatar_path: string
          display_name: string
          joined_at: string
          last_read_at: string
          member_role: Database['public']['Enums']['member_role']
          public_id: number
          role: Database['public']['Enums']['user_role']
          user_id: string
        }[]
      }
      list_my_conversations: {
        Args: { p_include_archived?: boolean }
        Returns: {
          allow_leave: boolean
          archived_at: string
          avatar_path: string
          created_at: string
          id: string
          kind: Database['public']['Enums']['conversation_kind']
          last_message: Json
          last_message_at: string
          members_count: number
          my_role: Database['public']['Enums']['member_role']
          name: string
          other_user: Json
          unread_count: number
        }[]
      }
      lookup_profile_by_public_id: {
        Args: { p_public_id: number }
        Returns: {
          avatar_path: string
          display_name: string
          id: string
          public_id: number
          role: Database['public']['Enums']['user_role']
        }[]
      }
      mark_conversation_read: { Args: { p_conversation: string }; Returns: string }
      remove_group_member: { Args: { p_conversation: string; p_user_id: string }; Returns: undefined }
      remove_student_association: { Args: { p_student_id: string }; Returns: undefined }
      rename_group: { Args: { p_conversation: string; p_name: string }; Returns: undefined }
      search_profiles: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          avatar_path: string
          display_name: string
          exact_id_match: boolean
          id: string
          public_id: number
          role: Database['public']['Enums']['user_role']
        }[]
      }
      set_group_archived: { Args: { p_archived: boolean; p_conversation: string }; Returns: undefined }
      set_group_avatar: { Args: { p_conversation: string; p_path?: string }; Returns: string }
      set_group_member_role: {
        Args: { p_conversation: string; p_role: Database['public']['Enums']['member_role']; p_user_id: string }
        Returns: undefined
      }
      set_my_avatar: { Args: { p_path?: string }; Returns: string }
      start_direct_conversation: { Args: { p_public_id: number }; Returns: string }
      upsert_my_profile: {
        Args: {
          p_app_language?: string
          p_city?: string
          p_country_code?: string
          p_display_name: string
          p_my_language?: string
          p_role?: Database['public']['Enums']['user_role']
        }
        Returns: {
          app_language: string | null
          avatar_path: string | null
          can_manage_groups: boolean
          city: string | null
          country_code: string | null
          created_at: string
          display_name: string
          id: string
          monitor_status: Database['public']['Enums']['monitor_status'] | null
          my_language: string | null
          public_id: number
          role: Database['public']['Enums']['user_role']
          updated_at: string
        }
        SetofOptions: {
          from: '*'
          to: 'profiles'
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      conversation_kind: 'direct' | 'group'
      member_role: 'member' | 'manager'
      message_kind: 'text' | 'audio'
      monitor_status: 'pending' | 'verified'
      user_role: 'student' | 'monitor' | 'admin'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      conversation_kind: ['direct', 'group'],
      member_role: ['member', 'manager'],
      message_kind: ['text', 'audio'],
      monitor_status: ['pending', 'verified'],
      user_role: ['student', 'monitor', 'admin'],
    },
  },
} as const
