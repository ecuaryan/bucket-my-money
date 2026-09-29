export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_name: string | null
          account_type: string | null
          created_at: string
          current_balance: number
          family_id: string
          id: string
          institution_name: string | null
          last_synced_at: string | null
          owner_member_id: string | null
          plaid_account_id: string | null
          plaid_item_id: string | null
          simplefin_account_id: string | null
          simplefin_connection_id: string | null
          source: string
          teller_account_id: string | null
          teller_enrollment_id: string | null
        }
        Insert: {
          account_name?: string | null
          account_type?: string | null
          created_at?: string
          current_balance?: number
          family_id: string
          id?: string
          institution_name?: string | null
          last_synced_at?: string | null
          owner_member_id?: string | null
          plaid_account_id?: string | null
          plaid_item_id?: string | null
          simplefin_account_id?: string | null
          simplefin_connection_id?: string | null
          source?: string
          teller_account_id?: string | null
          teller_enrollment_id?: string | null
        }
        Update: {
          account_name?: string | null
          account_type?: string | null
          created_at?: string
          current_balance?: number
          family_id?: string
          id?: string
          institution_name?: string | null
          last_synced_at?: string | null
          owner_member_id?: string | null
          plaid_account_id?: string | null
          plaid_item_id?: string | null
          simplefin_account_id?: string | null
          simplefin_connection_id?: string | null
          source?: string
          teller_account_id?: string | null
          teller_enrollment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_plaid_item_id_fkey"
            columns: ["plaid_item_id"]
            isOneToOne: false
            referencedRelation: "plaid_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_simplefin_connection_id_fkey"
            columns: ["simplefin_connection_id"]
            isOneToOne: false
            referencedRelation: "simplefin_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_teller_enrollment_id_fkey"
            columns: ["teller_enrollment_id"]
            isOneToOne: false
            referencedRelation: "teller_enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_organize_lines: {
        Row: {
          amount: number
          auto_organize_id: string
          bucket_id: string
          id: string
          sort_order: number
        }
        Insert: {
          amount: number
          auto_organize_id: string
          bucket_id: string
          id?: string
          sort_order: number
        }
        Update: {
          amount?: number
          auto_organize_id?: string
          bucket_id?: string
          id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "auto_organize_lines_auto_organize_id_fkey"
            columns: ["auto_organize_id"]
            isOneToOne: false
            referencedRelation: "auto_organizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_organize_lines_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_organize_runs: {
        Row: {
          auto_organize_id: string
          created_at: string
          error_message: string | null
          family_id: string
          id: string
          run_on: string
          status: string
          trigger: string
          triggered_by_member_id: string | null
        }
        Insert: {
          auto_organize_id: string
          created_at?: string
          error_message?: string | null
          family_id: string
          id?: string
          run_on: string
          status: string
          trigger: string
          triggered_by_member_id?: string | null
        }
        Update: {
          auto_organize_id?: string
          created_at?: string
          error_message?: string | null
          family_id?: string
          id?: string
          run_on?: string
          status?: string
          trigger?: string
          triggered_by_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_organize_runs_auto_organize_id_fkey"
            columns: ["auto_organize_id"]
            isOneToOne: false
            referencedRelation: "auto_organizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_organize_runs_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_organize_runs_triggered_by_member_id_fkey"
            columns: ["triggered_by_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_organizes: {
        Row: {
          auto_organize_kind: string
          auto_organize_type: string
          created_at: string
          created_by_member_id: string | null
          days_of_month: number[] | null
          destination_bucket_id: string | null
          family_id: string
          id: string
          interval_count: number | null
          interval_unit: string | null
          name: string | null
          owner_member_id: string | null
          paused: boolean
          start_date: string | null
          updated_at: string
        }
        Insert: {
          auto_organize_kind?: string
          auto_organize_type: string
          created_at?: string
          created_by_member_id?: string | null
          days_of_month?: number[] | null
          destination_bucket_id?: string | null
          family_id: string
          id?: string
          interval_count?: number | null
          interval_unit?: string | null
          name?: string | null
          owner_member_id?: string | null
          paused?: boolean
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          auto_organize_kind?: string
          auto_organize_type?: string
          created_at?: string
          created_by_member_id?: string | null
          days_of_month?: number[] | null
          destination_bucket_id?: string | null
          family_id?: string
          id?: string
          interval_count?: number | null
          interval_unit?: string | null
          name?: string | null
          owner_member_id?: string | null
          paused?: boolean
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_organizes_created_by_member_id_fkey"
            columns: ["created_by_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_organizes_destination_bucket_id_fkey"
            columns: ["destination_bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_organizes_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_organizes_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      bitcoin_entries: {
        Row: {
          btc_amount: number
          child_member_id: string
          created_at: string
          family_id: string
          id: string
          purchased_on: string
          updated_at: string
          usd_amount: number
        }
        Insert: {
          btc_amount: number
          child_member_id: string
          created_at?: string
          family_id: string
          id?: string
          purchased_on: string
          updated_at?: string
          usd_amount: number
        }
        Update: {
          btc_amount?: number
          child_member_id?: string
          created_at?: string
          family_id?: string
          id?: string
          purchased_on?: string
          updated_at?: string
          usd_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "bitcoin_entries_child_member_id_fkey"
            columns: ["child_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bitcoin_entries_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      buckets: {
        Row: {
          allocated_amount: number
          created_at: string
          display_order: number
          family_id: string
          id: string
          name: string
          owner_member_id: string | null
        }
        Insert: {
          allocated_amount?: number
          created_at?: string
          display_order?: number
          family_id: string
          id?: string
          name: string
          owner_member_id?: string | null
        }
        Update: {
          allocated_amount?: number
          created_at?: string
          display_order?: number
          family_id?: string
          id?: string
          name?: string
          owner_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buckets_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buckets_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          auto_organize_run_hour: number
          created_at: string
          id: string
          join_code: string
          name: string
          plan: string
          timezone: string
        }
        Insert: {
          auto_organize_run_hour?: number
          created_at?: string
          id?: string
          join_code: string
          name: string
          plan?: string
          timezone?: string
        }
        Update: {
          auto_organize_run_hour?: number
          created_at?: string
          id?: string
          join_code?: string
          name?: string
          plan?: string
          timezone?: string
        }
        Relationships: []
      }
      family_members: {
        Row: {
          avatar_url: string | null
          created_at: string
          family_id: string
          id: string
          is_account_owner: boolean
          name: string
          pin_failed_attempts: number
          pin_hash: string | null
          pin_locked: boolean
          pin_set_at: string | null
          role: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          family_id: string
          id?: string
          is_account_owner?: boolean
          name: string
          pin_failed_attempts?: number
          pin_hash?: string | null
          pin_locked?: boolean
          pin_set_at?: string | null
          role: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          family_id?: string
          id?: string
          is_account_owner?: boolean
          name?: string
          pin_failed_attempts?: number
          pin_hash?: string | null
          pin_locked?: boolean
          pin_set_at?: string | null
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          enabled: boolean
          family_id: string
          id: string
          key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          family_id: string
          id?: string
          key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          family_id?: string
          id?: string
          key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      member_bucket_order: {
        Row: {
          bucket_id: string
          display_order: number
          member_id: string
        }
        Insert: {
          bucket_id: string
          display_order: number
          member_id: string
        }
        Update: {
          bucket_id?: string
          display_order?: number
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_bucket_order_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_bucket_order_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_passkeys: {
        Row: {
          counter: number
          created_at: string
          credential_id: string
          device_label: string | null
          family_id: string
          id: string
          last_used_at: string | null
          member_id: string
          public_key: string
          transports: string[] | null
        }
        Insert: {
          counter?: number
          created_at?: string
          credential_id: string
          device_label?: string | null
          family_id: string
          id?: string
          last_used_at?: string | null
          member_id: string
          public_key: string
          transports?: string[] | null
        }
        Update: {
          counter?: number
          created_at?: string
          credential_id?: string
          device_label?: string | null
          family_id?: string
          id?: string
          last_used_at?: string | null
          member_id?: string
          public_key?: string
          transports?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "member_passkeys_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_passkeys_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      plaid_events: {
        Row: {
          created_at: string
          family_id: string | null
          id: string
          payload: Json
          plaid_item_id: string | null
          webhook_code: string
          webhook_type: string
        }
        Insert: {
          created_at?: string
          family_id?: string | null
          id?: string
          payload: Json
          plaid_item_id?: string | null
          webhook_code: string
          webhook_type: string
        }
        Update: {
          created_at?: string
          family_id?: string | null
          id?: string
          payload?: Json
          plaid_item_id?: string | null
          webhook_code?: string
          webhook_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "plaid_events_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plaid_events_plaid_item_id_fkey"
            columns: ["plaid_item_id"]
            isOneToOne: false
            referencedRelation: "plaid_items"
            referencedColumns: ["id"]
          },
        ]
      }
      plaid_items: {
        Row: {
          access_token: string
          created_at: string
          family_id: string
          id: string
          institution_id: string | null
          institution_name: string | null
          item_id: string
          last_synced_at: string | null
          refresh_claimed_at: string | null
          status: string
          webhook_configured_at: string | null
        }
        Insert: {
          access_token: string
          created_at?: string
          family_id: string
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          item_id: string
          last_synced_at?: string | null
          refresh_claimed_at?: string | null
          status?: string
          webhook_configured_at?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string
          family_id?: string
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          item_id?: string
          last_synced_at?: string | null
          refresh_claimed_at?: string | null
          status?: string
          webhook_configured_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plaid_items_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      simplefin_connections: {
        Row: {
          access_url: string
          created_at: string
          family_id: string
          id: string
          last_synced_at: string | null
          refresh_claimed_at: string | null
          status: string
        }
        Insert: {
          access_url: string
          created_at?: string
          family_id: string
          id?: string
          last_synced_at?: string | null
          refresh_claimed_at?: string | null
          status?: string
        }
        Update: {
          access_url?: string
          created_at?: string
          family_id?: string
          id?: string
          last_synced_at?: string | null
          refresh_claimed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "simplefin_connections_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      teller_enrollments: {
        Row: {
          access_token: string
          created_at: string
          enrollment_id: string
          family_id: string
          id: string
          institution_id: string | null
          institution_name: string | null
          last_synced_at: string | null
          refresh_claimed_at: string | null
          status: string
        }
        Insert: {
          access_token: string
          created_at?: string
          enrollment_id: string
          family_id: string
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          last_synced_at?: string | null
          refresh_claimed_at?: string | null
          status?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          enrollment_id?: string
          family_id?: string
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          last_synced_at?: string | null
          refresh_claimed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "teller_enrollments_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      teller_events: {
        Row: {
          account_id: string | null
          created_at: string
          event_type: string
          family_id: string
          id: string
          payload: Json
          processed_at: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          event_type: string
          family_id: string
          id?: string
          payload: Json
          processed_at?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string
          event_type?: string
          family_id?: string
          id?: string
          payload?: Json
          processed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teller_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teller_events_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          auto_organize_run_id: string | null
          created_at: string
          family_id: string
          float_balance_after: number | null
          float_balance_before: number | null
          from_bucket_balance_after: number | null
          from_bucket_balance_before: number | null
          from_bucket_id: string | null
          from_bucket_name: string | null
          from_member_balance_after: number | null
          from_member_balance_before: number | null
          from_member_id: string | null
          from_member_name: string | null
          id: string
          initiated_by_member_id: string | null
          initiated_by_member_name: string | null
          note: string | null
          to_bucket_balance_after: number | null
          to_bucket_balance_before: number | null
          to_bucket_id: string | null
          to_bucket_name: string | null
          to_member_balance_after: number | null
          to_member_balance_before: number | null
          to_member_id: string | null
          to_member_name: string | null
          type: string
        }
        Insert: {
          amount: number
          auto_organize_run_id?: string | null
          created_at?: string
          family_id: string
          float_balance_after?: number | null
          float_balance_before?: number | null
          from_bucket_balance_after?: number | null
          from_bucket_balance_before?: number | null
          from_bucket_id?: string | null
          from_bucket_name?: string | null
          from_member_balance_after?: number | null
          from_member_balance_before?: number | null
          from_member_id?: string | null
          from_member_name?: string | null
          id?: string
          initiated_by_member_id?: string | null
          initiated_by_member_name?: string | null
          note?: string | null
          to_bucket_balance_after?: number | null
          to_bucket_balance_before?: number | null
          to_bucket_id?: string | null
          to_bucket_name?: string | null
          to_member_balance_after?: number | null
          to_member_balance_before?: number | null
          to_member_id?: string | null
          to_member_name?: string | null
          type: string
        }
        Update: {
          amount?: number
          auto_organize_run_id?: string | null
          created_at?: string
          family_id?: string
          float_balance_after?: number | null
          float_balance_before?: number | null
          from_bucket_balance_after?: number | null
          from_bucket_balance_before?: number | null
          from_bucket_id?: string | null
          from_bucket_name?: string | null
          from_member_balance_after?: number | null
          from_member_balance_before?: number | null
          from_member_id?: string | null
          from_member_name?: string | null
          id?: string
          initiated_by_member_id?: string | null
          initiated_by_member_name?: string | null
          note?: string | null
          to_bucket_balance_after?: number | null
          to_bucket_balance_before?: number | null
          to_bucket_id?: string | null
          to_bucket_name?: string | null
          to_member_balance_after?: number | null
          to_member_balance_before?: number | null
          to_member_id?: string | null
          to_member_name?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_auto_organize_run_id_fkey"
            columns: ["auto_organize_run_id"]
            isOneToOne: false
            referencedRelation: "auto_organize_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_from_bucket_id_fkey"
            columns: ["from_bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_from_member_id_fkey"
            columns: ["from_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_initiated_by_member_id_fkey"
            columns: ["initiated_by_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_bucket_id_fkey"
            columns: ["to_bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_member_id_fkey"
            columns: ["to_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      webauthn_challenges: {
        Row: {
          challenge: string
          created_at: string
          expires_at: string
          family_id: string | null
          id: string
          kind: string
          member_id: string | null
        }
        Insert: {
          challenge: string
          created_at?: string
          expires_at: string
          family_id?: string | null
          id?: string
          kind: string
          member_id?: string | null
        }
        Update: {
          challenge?: string
          created_at?: string
          expires_at?: string
          family_id?: string | null
          id?: string
          kind?: string
          member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webauthn_challenges_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      transactions_client: {
        Row: {
          amount: number | null
          auto_organize_kind: string | null
          auto_organize_run_id: string | null
          auto_organize_run_trigger: string | null
          created_at: string | null
          family_id: string | null
          float_balance_after: number | null
          float_balance_before: number | null
          from_bucket_balance_after: number | null
          from_bucket_balance_before: number | null
          from_bucket_id: string | null
          from_bucket_name: string | null
          from_member_balance_after: number | null
          from_member_balance_before: number | null
          from_member_id: string | null
          from_member_name: string | null
          id: string | null
          initiated_by_member_id: string | null
          initiated_by_member_name: string | null
          note: string | null
          to_bucket_balance_after: number | null
          to_bucket_balance_before: number | null
          to_bucket_id: string | null
          to_bucket_name: string | null
          to_member_balance_after: number | null
          to_member_balance_before: number | null
          to_member_id: string | null
          to_member_name: string | null
          type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_auto_organize_run_id_fkey"
            columns: ["auto_organize_run_id"]
            isOneToOne: false
            referencedRelation: "auto_organize_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_from_bucket_id_fkey"
            columns: ["from_bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_from_member_id_fkey"
            columns: ["from_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_initiated_by_member_id_fkey"
            columns: ["initiated_by_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_bucket_id_fkey"
            columns: ["to_bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_member_id_fkey"
            columns: ["to_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _auto_organize_apply_line: {
        Args: {
          p_amount: number
          p_auto_organize_run_id: string
          p_family_id: string
          p_float_member_id: string
          p_from_member_id: string
          p_note: string
          p_owner_member_id: string
          p_to_bucket_id: string
        }
        Returns: string
      }
      _auto_organize_sweep_line: {
        Args: {
          p_amount: number
          p_auto_organize_run_id: string
          p_family_id: string
          p_float_member_id: string
          p_from_bucket_id: string
          p_from_member_id: string
          p_note: string
          p_owner_member_id: string
          p_to_bucket_id: string
        }
        Returns: string
      }
      add_manual_account: {
        Args: { p_amount: number; p_kind?: string; p_label: string }
        Returns: string
      }
      auth_family_id: { Args: never; Returns: string }
      auth_member_id: { Args: never; Returns: string }
      auth_role: { Args: never; Returns: string }
      auto_organize_cadence_summary: {
        Args: {
          p_auto_organize_type: string
          p_days_of_month: number[]
          p_interval_count: number
          p_interval_unit: string
          p_start_date: string
        }
        Returns: string
      }
      auto_organize_days_key: { Args: { p_days: number[] }; Returns: string }
      auto_organize_display_name: {
        Args: {
          p_auto_organize_type: string
          p_days_of_month: number[]
          p_interval_count: number
          p_interval_unit: string
          p_name: string
          p_start_date: string
        }
        Returns: string
      }
      auto_organize_history_note: {
        Args: {
          p_auto_organize_type: string
          p_days_of_month: number[]
          p_interval_count: number
          p_interval_unit: string
          p_kind: string
          p_name: string
          p_start_date: string
        }
        Returns: string
      }
      auto_organize_is_due_on: {
        Args: {
          p_auto_organize_type: string
          p_days_of_month: number[]
          p_interval_count: number
          p_interval_unit: string
          p_local_date: string
          p_start_date: string
        }
        Returns: boolean
      }
      bucket_move_is_child_internal: {
        Args: {
          p_from_bucket_id: string
          p_from_member_id: string
          p_to_bucket_id: string
        }
        Returns: boolean
      }
      bucket_visible_to_adults: {
        Args: { p_bucket_id: string }
        Returns: boolean
      }
      claim_stale_enrollments: {
        Args: { p_claim_ttl: string; p_limit: number; p_stale_before: string }
        Returns: {
          access_token: string
          id: string
        }[]
      }
      claim_stale_plaid_items: {
        Args: { p_claim_ttl: string; p_limit: number; p_stale_before: string }
        Returns: {
          access_token: string
          family_id: string
          id: string
        }[]
      }
      claim_stale_simplefin_connections: {
        Args: { p_claim_ttl: string; p_limit: number; p_stale_before: string }
        Returns: {
          access_url: string
          family_id: string
          id: string
        }[]
      }
      client_float_balance_after: {
        Args: { p_transaction_id: string }
        Returns: number
      }
      client_float_balance_before: {
        Args: { p_transaction_id: string }
        Returns: number
      }
      delete_bucket: { Args: { p_bucket_id: string }; Returns: undefined }
      delete_manual_account: {
        Args: { p_account_id: string }
        Returns: undefined
      }
      ensure_member_bucket_orders: { Args: never; Returns: undefined }
      family_linked_child_member_ids: { Args: never; Returns: string[] }
      format_auto_organize_day_of_month: {
        Args: { p_day: number }
        Returns: string
      }
      generate_join_code: { Args: never; Returns: string }
      get_float_balance: { Args: never; Returns: number }
      get_home_balance_breakdown: { Args: never; Returns: Json }
      get_home_page_data: { Args: never; Returns: Json }
      give_money: {
        Args: { p_amount: number; p_note?: string; p_to_member_id: string }
        Returns: string
      }
      is_cash_account_type: { Args: { p_type: string }; Returns: boolean }
      is_credit_card_account_type: {
        Args: { p_type: string }
        Returns: boolean
      }
      login_roster: { Args: { p_code: string }; Returns: Json }
      login_webauthn_options: {
        Args: { p_family_id: string; p_member_id: string }
        Returns: Json
      }
      member_child_give_net: {
        Args: { p_child_member_id: string }
        Returns: number
      }
      member_child_virtual_balance: {
        Args: { p_child_member_id: string }
        Returns: number
      }
      member_float: { Args: { p_member_id: string }; Returns: number }
      member_has_linked_account: {
        Args: { p_member_id: string }
        Returns: boolean
      }
      member_login_methods: {
        Args: { p_family_id: string; p_member_id: string }
        Returns: Json
      }
      member_session_lookup: {
        Args: { p_family_id: string; p_member_id: string }
        Returns: Json
      }
      move_money: {
        Args: {
          p_amount: number
          p_from_bucket_id: string
          p_note?: string
          p_to_bucket_id: string
        }
        Returns: string
      }
      record_pin_failure: {
        Args: { p_member_id: string; p_max_attempts: number }
        Returns: {
          attempts: number
          locked: boolean
        }[]
      }
      reorder_bucket: {
        Args: { p_bucket_id: string; p_direction: string }
        Returns: undefined
      }
      reorder_buckets: {
        Args: { p_ordered_bucket_ids: string[] }
        Returns: undefined
      }
      return_from_child: {
        Args: { p_amount: number; p_from_child_id: string; p_note?: string }
        Returns: string
      }
      revoke_member_sessions: {
        Args: { p_family_id: string; p_user_id: string }
        Returns: undefined
      }
      rotate_family_join_code: { Args: never; Returns: string }
      run_auto_organize: {
        Args: {
          p_auto_organize_id: string
          p_run_on?: string
          p_trigger: string
          p_triggered_by_member_id?: string
        }
        Returns: string
      }
      run_due_auto_organizes: { Args: { p_as_of?: string }; Returns: number }
      transaction_visible_to_caller: {
        Args: { p_transaction_id: string }
        Returns: boolean
      }
      trigger_scheduled_balance_refresh: { Args: never; Returns: undefined }
      update_manual_account: {
        Args: { p_account_id: string; p_amount: number; p_label: string }
        Returns: undefined
      }
      update_transaction_note: {
        Args: { p_note: string; p_transaction_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

