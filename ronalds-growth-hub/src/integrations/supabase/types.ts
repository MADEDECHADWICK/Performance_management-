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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ad_hoc_evaluations: {
        Row: {
          cancel_if_not_processed: boolean | null
          created_at: string | null
          created_by: string | null
          cycle_id: string | null
          department_id: string | null
          due_date: string | null
          enable_downward_evaluation: boolean | null
          enable_peer_evaluation: boolean | null
          enable_self_evaluation: boolean | null
          enable_upward_evaluation: boolean | null
          evaluation_target: string | null
          exclude_from_score: boolean | null
          hide_from_dashboard: boolean | null
          id: string
          name: string
          process_anonymously: boolean | null
          published_at: string | null
          require_all_kpis: boolean | null
          require_evaluatee_signature: boolean | null
          require_evaluator_signature: boolean | null
          send_reminders: boolean | null
          send_signature_to_downward_evaluators: boolean | null
          send_signature_to_evaluatee: boolean | null
          send_signature_to_managers: boolean | null
          status: string | null
          team_id: string | null
          updated_at: string | null
        }
        Insert: {
          cancel_if_not_processed?: boolean | null
          created_at?: string | null
          created_by?: string | null
          cycle_id?: string | null
          department_id?: string | null
          due_date?: string | null
          enable_downward_evaluation?: boolean | null
          enable_peer_evaluation?: boolean | null
          enable_self_evaluation?: boolean | null
          enable_upward_evaluation?: boolean | null
          evaluation_target?: string | null
          exclude_from_score?: boolean | null
          hide_from_dashboard?: boolean | null
          id?: string
          name: string
          process_anonymously?: boolean | null
          published_at?: string | null
          require_all_kpis?: boolean | null
          require_evaluatee_signature?: boolean | null
          require_evaluator_signature?: boolean | null
          send_reminders?: boolean | null
          send_signature_to_downward_evaluators?: boolean | null
          send_signature_to_evaluatee?: boolean | null
          send_signature_to_managers?: boolean | null
          status?: string | null
          team_id?: string | null
          updated_at?: string | null
        }
        Update: {
          cancel_if_not_processed?: boolean | null
          created_at?: string | null
          created_by?: string | null
          cycle_id?: string | null
          department_id?: string | null
          due_date?: string | null
          enable_downward_evaluation?: boolean | null
          enable_peer_evaluation?: boolean | null
          enable_self_evaluation?: boolean | null
          enable_upward_evaluation?: boolean | null
          evaluation_target?: string | null
          exclude_from_score?: boolean | null
          hide_from_dashboard?: boolean | null
          id?: string
          name?: string
          process_anonymously?: boolean | null
          published_at?: string | null
          require_all_kpis?: boolean | null
          require_evaluatee_signature?: boolean | null
          require_evaluator_signature?: boolean | null
          send_reminders?: boolean | null
          send_signature_to_downward_evaluators?: boolean | null
          send_signature_to_evaluatee?: boolean | null
          send_signature_to_managers?: boolean | null
          status?: string | null
          team_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_hoc_evaluations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_hoc_evaluations_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "evaluation_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_hoc_evaluations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_hoc_evaluations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "evaluation_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changes: Json | null
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      client_evaluations: {
        Row: {
          access_token: string
          client_id: string | null
          comments: string | null
          communication: number | null
          created_at: string | null
          cycle_id: string | null
          employee_id: string
          expertise: number | null
          id: string
          overall_rating: number | null
          professionalism: number | null
          project_id: string | null
          quality_of_work: number | null
          submitted_at: string | null
          timeliness: number | null
          updated_at: string | null
          would_recommend: boolean | null
        }
        Insert: {
          access_token: string
          client_id?: string | null
          comments?: string | null
          communication?: number | null
          created_at?: string | null
          cycle_id?: string | null
          employee_id: string
          expertise?: number | null
          id?: string
          overall_rating?: number | null
          professionalism?: number | null
          project_id?: string | null
          quality_of_work?: number | null
          submitted_at?: string | null
          timeliness?: number | null
          updated_at?: string | null
          would_recommend?: boolean | null
        }
        Update: {
          access_token?: string
          client_id?: string | null
          comments?: string | null
          communication?: number | null
          created_at?: string | null
          cycle_id?: string | null
          employee_id?: string
          expertise?: number | null
          id?: string
          overall_rating?: number | null
          professionalism?: number | null
          project_id?: string | null
          quality_of_work?: number | null
          submitted_at?: string | null
          timeliness?: number | null
          updated_at?: string | null
          would_recommend?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "client_evaluations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_evaluations_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "evaluation_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_evaluations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          account_manager_id: string | null
          client_name: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string | null
          id: string
          status: Database["public"]["Enums"]["employment_status"] | null
          updated_at: string | null
        }
        Insert: {
          account_manager_id?: string | null
          client_name: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["employment_status"] | null
          updated_at?: string | null
        }
        Update: {
          account_manager_id?: string | null
          client_name?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["employment_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_account_manager_id_fkey"
            columns: ["account_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      continuous_feedback: {
        Row: {
          category: string | null
          created_at: string | null
          feedback_type: string
          giver_id: string | null
          id: string
          is_anonymous: boolean | null
          is_public: boolean | null
          message: string
          recipient_id: string
          related_kpi_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          feedback_type: string
          giver_id?: string | null
          id?: string
          is_anonymous?: boolean | null
          is_public?: boolean | null
          message: string
          recipient_id: string
          related_kpi_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          feedback_type?: string
          giver_id?: string | null
          id?: string
          is_anonymous?: boolean | null
          is_public?: boolean | null
          message?: string
          recipient_id?: string
          related_kpi_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "continuous_feedback_related_kpi_id_fkey"
            columns: ["related_kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string | null
          department_code: string | null
          department_head_id: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          department_code?: string | null
          department_head_id?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          department_code?: string | null
          department_head_id?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_department_head_id_fkey"
            columns: ["department_head_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      development_recommendations: {
        Row: {
          competency_area: string
          created_at: string | null
          description: string | null
          employee_id: string
          id: string
          kpi_id: string | null
          priority: string | null
          recommendation_type: string
          resource_url: string | null
          status: string | null
          suggested_by: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          competency_area: string
          created_at?: string | null
          description?: string | null
          employee_id: string
          id?: string
          kpi_id?: string | null
          priority?: string | null
          recommendation_type: string
          resource_url?: string | null
          status?: string | null
          suggested_by?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          competency_area?: string
          created_at?: string | null
          description?: string | null
          employee_id?: string
          id?: string
          kpi_id?: string | null
          priority?: string | null
          recommendation_type?: string
          resource_url?: string | null
          status?: string | null
          suggested_by?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "development_recommendations_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_evaluations: {
        Row: {
          bsc_customer_satisfaction_score: number | null
          bsc_internal_processes_score: number | null
          bsc_learning_growth_score: number | null
          created_at: string | null
          cycle_id: string
          employee_id: string
          id: string
          manager_collaboration: number | null
          manager_comments: string | null
          manager_communication: number | null
          manager_id: string | null
          manager_improvements: string | null
          manager_innovation: number | null
          manager_overall_rating: number | null
          manager_problem_solving: number | null
          manager_promotion_comments: string | null
          manager_recommend_promotion: boolean | null
          manager_strengths: string | null
          manager_submitted_at: string | null
          manager_technical_expertise: number | null
          manager_time_management: number | null
          self_achievements: string | null
          self_challenges: string | null
          self_collaboration: number | null
          self_communication: number | null
          self_goals: string | null
          self_innovation: number | null
          self_problem_solving: number | null
          self_submitted_at: string | null
          self_technical_expertise: number | null
          self_time_management: number | null
          status: string | null
          updated_at: string | null
          visibility: string | null
        }
        Insert: {
          bsc_customer_satisfaction_score?: number | null
          bsc_internal_processes_score?: number | null
          bsc_learning_growth_score?: number | null
          created_at?: string | null
          cycle_id: string
          employee_id: string
          id?: string
          manager_collaboration?: number | null
          manager_comments?: string | null
          manager_communication?: number | null
          manager_id?: string | null
          manager_improvements?: string | null
          manager_innovation?: number | null
          manager_overall_rating?: number | null
          manager_problem_solving?: number | null
          manager_promotion_comments?: string | null
          manager_recommend_promotion?: boolean | null
          manager_strengths?: string | null
          manager_submitted_at?: string | null
          manager_technical_expertise?: number | null
          manager_time_management?: number | null
          self_achievements?: string | null
          self_challenges?: string | null
          self_collaboration?: number | null
          self_communication?: number | null
          self_goals?: string | null
          self_innovation?: number | null
          self_problem_solving?: number | null
          self_submitted_at?: string | null
          self_technical_expertise?: number | null
          self_time_management?: number | null
          status?: string | null
          updated_at?: string | null
          visibility?: string | null
        }
        Update: {
          bsc_customer_satisfaction_score?: number | null
          bsc_internal_processes_score?: number | null
          bsc_learning_growth_score?: number | null
          created_at?: string | null
          cycle_id?: string
          employee_id?: string
          id?: string
          manager_collaboration?: number | null
          manager_comments?: string | null
          manager_communication?: number | null
          manager_id?: string | null
          manager_improvements?: string | null
          manager_innovation?: number | null
          manager_overall_rating?: number | null
          manager_problem_solving?: number | null
          manager_promotion_comments?: string | null
          manager_recommend_promotion?: boolean | null
          manager_strengths?: string | null
          manager_submitted_at?: string | null
          manager_technical_expertise?: number | null
          manager_time_management?: number | null
          self_achievements?: string | null
          self_challenges?: string | null
          self_collaboration?: number | null
          self_communication?: number | null
          self_goals?: string | null
          self_innovation?: number | null
          self_problem_solving?: number | null
          self_submitted_at?: string | null
          self_technical_expertise?: number | null
          self_time_management?: number | null
          status?: string | null
          updated_at?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_evaluations_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "evaluation_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_evaluations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_evaluations_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_goals: {
        Row: {
          achieved_value: number | null
          created_at: string | null
          cycle_id: string
          employee_id: string
          goal_description: string | null
          goal_title: string
          id: string
          kpi_id: string | null
          manager_comments: string | null
          status: string | null
          target_value: number | null
          updated_at: string | null
        }
        Insert: {
          achieved_value?: number | null
          created_at?: string | null
          cycle_id: string
          employee_id: string
          goal_description?: string | null
          goal_title: string
          id?: string
          kpi_id?: string | null
          manager_comments?: string | null
          status?: string | null
          target_value?: number | null
          updated_at?: string | null
        }
        Update: {
          achieved_value?: number | null
          created_at?: string | null
          cycle_id?: string
          employee_id?: string
          goal_description?: string | null
          goal_title?: string
          id?: string
          kpi_id?: string | null
          manager_comments?: string | null
          status?: string | null
          target_value?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_goals_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "evaluation_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_goals_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_goals_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_kpi_assignments: {
        Row: {
          achieved: boolean | null
          achieved_value: number | null
          created_at: string | null
          current_value: number | null
          custom_weight: number | null
          cycle_id: string
          employee_id: string
          evaluation_period: string | null
          id: string
          kpi_id: string
          remarks: string | null
          target_value: number | null
          updated_at: string | null
        }
        Insert: {
          achieved?: boolean | null
          achieved_value?: number | null
          created_at?: string | null
          current_value?: number | null
          custom_weight?: number | null
          cycle_id: string
          employee_id: string
          evaluation_period?: string | null
          id?: string
          kpi_id: string
          remarks?: string | null
          target_value?: number | null
          updated_at?: string | null
        }
        Update: {
          achieved?: boolean | null
          achieved_value?: number | null
          created_at?: string | null
          current_value?: number | null
          custom_weight?: number | null
          cycle_id?: string
          employee_id?: string
          evaluation_period?: string | null
          id?: string
          kpi_id?: string
          remarks?: string | null
          target_value?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_kpi_assignments_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "evaluation_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_kpi_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_kpi_assignments_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_project_allocations: {
        Row: {
          actual_money_received: number | null
          allocation_amount: number
          billable_hours: number
          created_at: string | null
          employee_id: string | null
          hourly_rate: number
          id: string
          project_financial_id: string | null
          role_on_project: string
          surplus_deficit_share: number | null
          total_cost: number
          total_money_to_receive: number | null
          updated_at: string | null
          weight_on_collection: number | null
        }
        Insert: {
          actual_money_received?: number | null
          allocation_amount: number
          billable_hours: number
          created_at?: string | null
          employee_id?: string | null
          hourly_rate: number
          id?: string
          project_financial_id?: string | null
          role_on_project: string
          surplus_deficit_share?: number | null
          total_cost: number
          total_money_to_receive?: number | null
          updated_at?: string | null
          weight_on_collection?: number | null
        }
        Update: {
          actual_money_received?: number | null
          allocation_amount?: number
          billable_hours?: number
          created_at?: string | null
          employee_id?: string | null
          hourly_rate?: number
          id?: string
          project_financial_id?: string | null
          role_on_project?: string
          surplus_deficit_share?: number | null
          total_cost?: number
          total_money_to_receive?: number | null
          updated_at?: string | null
          weight_on_collection?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_project_allocations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_project_allocations_project_financial_id_fkey"
            columns: ["project_financial_id"]
            isOneToOne: false
            referencedRelation: "project_financials"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_action_items: {
        Row: {
          action_item: string
          assigned_by: string | null
          category: string | null
          created_at: string | null
          due_date: string | null
          employee_id: string
          evaluation_id: string | null
          evaluation_type: string | null
          id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          action_item: string
          assigned_by?: string | null
          category?: string | null
          created_at?: string | null
          due_date?: string | null
          employee_id: string
          evaluation_id?: string | null
          evaluation_type?: string | null
          id?: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          action_item?: string
          assigned_by?: string | null
          category?: string | null
          created_at?: string | null
          due_date?: string | null
          employee_id?: string
          evaluation_id?: string | null
          evaluation_type?: string | null
          id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evaluation_assignments: {
        Row: {
          ad_hoc_evaluation_id: string | null
          created_at: string | null
          due_date: string | null
          evaluatee_id: string | null
          evaluation_type: string
          evaluator_comments: string | null
          evaluator_id: string | null
          evidence_urls: Json | null
          id: string
          responses: Json | null
          status: string | null
          submitted_at: string | null
        }
        Insert: {
          ad_hoc_evaluation_id?: string | null
          created_at?: string | null
          due_date?: string | null
          evaluatee_id?: string | null
          evaluation_type: string
          evaluator_comments?: string | null
          evaluator_id?: string | null
          evidence_urls?: Json | null
          id?: string
          responses?: Json | null
          status?: string | null
          submitted_at?: string | null
        }
        Update: {
          ad_hoc_evaluation_id?: string | null
          created_at?: string | null
          due_date?: string | null
          evaluatee_id?: string | null
          evaluation_type?: string
          evaluator_comments?: string | null
          evaluator_id?: string | null
          evidence_urls?: Json | null
          id?: string
          responses?: Json | null
          status?: string | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_assignments_ad_hoc_evaluation_id_fkey"
            columns: ["ad_hoc_evaluation_id"]
            isOneToOne: false
            referencedRelation: "ad_hoc_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_assignments_evaluatee_id_fkey"
            columns: ["evaluatee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_assignments_evaluator_id_fkey"
            columns: ["evaluator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_cycles: {
        Row: {
          auto_create_evaluations: boolean | null
          created_at: string | null
          cycle_type: string
          end_date: string
          financial_weight: number | null
          id: string
          name: string
          non_financial_weight: number | null
          peer_anonymity: string | null
          peer_assignment_mode: string | null
          peers_per_person: number | null
          review_period_end: string | null
          review_period_start: string | null
          start_date: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          auto_create_evaluations?: boolean | null
          created_at?: string | null
          cycle_type: string
          end_date: string
          financial_weight?: number | null
          id?: string
          name: string
          non_financial_weight?: number | null
          peer_anonymity?: string | null
          peer_assignment_mode?: string | null
          peers_per_person?: number | null
          review_period_end?: string | null
          review_period_start?: string | null
          start_date: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_create_evaluations?: boolean | null
          created_at?: string | null
          cycle_type?: string
          end_date?: string
          financial_weight?: number | null
          id?: string
          name?: string
          non_financial_weight?: number | null
          peer_anonymity?: string | null
          peer_assignment_mode?: string | null
          peers_per_person?: number | null
          review_period_end?: string | null
          review_period_start?: string | null
          start_date?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      evaluation_result_areas: {
        Row: {
          ad_hoc_evaluation_id: string | null
          created_at: string | null
          description: string | null
          evaluator_type: string | null
          id: string
          kpi_id: string | null
          weight: number | null
        }
        Insert: {
          ad_hoc_evaluation_id?: string | null
          created_at?: string | null
          description?: string | null
          evaluator_type?: string | null
          id?: string
          kpi_id?: string | null
          weight?: number | null
        }
        Update: {
          ad_hoc_evaluation_id?: string | null
          created_at?: string | null
          description?: string | null
          evaluator_type?: string | null
          id?: string
          kpi_id?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_result_areas_ad_hoc_evaluation_id_fkey"
            columns: ["ad_hoc_evaluation_id"]
            isOneToOne: false
            referencedRelation: "ad_hoc_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_result_areas_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_team_members: {
        Row: {
          created_at: string | null
          employee_id: string
          id: string
          team_id: string
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          id?: string
          team_id: string
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_team_members_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "evaluation_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_teams: {
        Row: {
          created_at: string | null
          created_by: string | null
          department_id: string
          description: string | null
          id: string
          team_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          department_id: string
          description?: string | null
          id?: string
          team_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          department_id?: string
          description?: string | null
          id?: string
          team_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_teams_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_templates: {
        Row: {
          bsc_category: string | null
          competencies: Json
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          template_type: string
          updated_at: string | null
        }
        Insert: {
          bsc_category?: string | null
          competencies?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          template_type: string
          updated_at?: string | null
        }
        Update: {
          bsc_category?: string | null
          competencies?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          template_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      feedback: {
        Row: {
          comments: string | null
          created_at: string | null
          feedback_type: string
          id: string
          is_anonymous: boolean | null
          rating: number | null
          review_id: string | null
          reviewer_id: string | null
          subject_id: string
          updated_at: string | null
        }
        Insert: {
          comments?: string | null
          created_at?: string | null
          feedback_type: string
          id?: string
          is_anonymous?: boolean | null
          rating?: number | null
          review_id?: string | null
          reviewer_id?: string | null
          subject_id: string
          updated_at?: string | null
        }
        Update: {
          comments?: string | null
          created_at?: string | null
          feedback_type?: string
          id?: string
          is_anonymous?: boolean | null
          rating?: number | null
          review_id?: string | null
          reviewer_id?: string | null
          subject_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "performance_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_records: {
        Row: {
          amount: number
          created_at: string | null
          cycle_id: string | null
          date_completed: string
          employee_id: string
          id: string
          job_id: string | null
          notes: string | null
          record_type: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          cycle_id?: string | null
          date_completed: string
          employee_id: string
          id?: string
          job_id?: string | null
          notes?: string | null
          record_type: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          cycle_id?: string | null
          date_completed?: string
          employee_id?: string
          id?: string
          job_id?: string | null
          notes?: string | null
          record_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_records_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "evaluation_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_records_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_profitability"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "financial_records_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_kpi_links: {
        Row: {
          alignment_notes: string | null
          created_at: string | null
          goal_id: string
          id: string
          kpi_id: string
        }
        Insert: {
          alignment_notes?: string | null
          created_at?: string | null
          goal_id: string
          id?: string
          kpi_id: string
        }
        Update: {
          alignment_notes?: string | null
          created_at?: string | null
          goal_id?: string
          id?: string
          kpi_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_kpi_links_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "employee_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_kpi_links_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      job_staff_assignments: {
        Row: {
          created_at: string | null
          employee_id: string
          id: string
          job_id: string
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          id?: string
          job_id: string
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          id?: string
          job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_staff_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_staff_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_profitability"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_staff_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          amount_collected: number | null
          approved_at: string | null
          approved_by: string | null
          assigned_by: string | null
          assigned_to: string
          billable_hours: number | null
          client_id: string | null
          collection_period: string | null
          completed_at: string | null
          completion_percentage: number | null
          created_at: string | null
          department_id: string | null
          description: string | null
          due_date: string | null
          fees: number | null
          financial_weight: number | null
          hourly_rate: number | null
          id: string
          job_number: string | null
          start_date: string
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          amount_collected?: number | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_by?: string | null
          assigned_to: string
          billable_hours?: number | null
          client_id?: string | null
          collection_period?: string | null
          completed_at?: string | null
          completion_percentage?: number | null
          created_at?: string | null
          department_id?: string | null
          description?: string | null
          due_date?: string | null
          fees?: number | null
          financial_weight?: number | null
          hourly_rate?: number | null
          id?: string
          job_number?: string | null
          start_date: string
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          amount_collected?: number | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_by?: string | null
          assigned_to?: string
          billable_hours?: number | null
          client_id?: string | null
          collection_period?: string | null
          completed_at?: string | null
          completion_percentage?: number | null
          created_at?: string | null
          department_id?: string | null
          description?: string | null
          due_date?: string | null
          fees?: number | null
          financial_weight?: number | null
          hourly_rate?: number | null
          id?: string
          job_number?: string | null
          start_date?: string
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      kpis: {
        Row: {
          bsc_category: string | null
          category: string
          created_at: string | null
          created_by: string | null
          department_id: string | null
          description: string | null
          employee_id: string | null
          frequency: string | null
          id: string
          is_active: boolean | null
          job_title: string | null
          measurement_unit: string | null
          name: string
          parent_kpi_id: string | null
          role_specific: Database["public"]["Enums"]["app_role"][] | null
          status: string | null
          target_value: number | null
          type: string | null
          updated_at: string | null
          weight: number | null
        }
        Insert: {
          bsc_category?: string | null
          category: string
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          employee_id?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          job_title?: string | null
          measurement_unit?: string | null
          name: string
          parent_kpi_id?: string | null
          role_specific?: Database["public"]["Enums"]["app_role"][] | null
          status?: string | null
          target_value?: number | null
          type?: string | null
          updated_at?: string | null
          weight?: number | null
        }
        Update: {
          bsc_category?: string | null
          category?: string
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          employee_id?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          job_title?: string | null
          measurement_unit?: string | null
          name?: string
          parent_kpi_id?: string | null
          role_specific?: Database["public"]["Enums"]["app_role"][] | null
          status?: string | null
          target_value?: number | null
          type?: string | null
          updated_at?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kpis_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpis_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpis_parent_kpi_id_fkey"
            columns: ["parent_kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          related_entity_id: string | null
          related_entity_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      peer_evaluations: {
        Row: {
          additional_comments: string | null
          communication: number | null
          created_at: string | null
          cycle_id: string
          evaluatee_id: string
          evaluator_id: string
          id: string
          improvements: string | null
          is_anonymous: boolean | null
          problem_solving: number | null
          professional_development: number | null
          reliability: number | null
          specific_example: string | null
          status: string | null
          strengths: string | null
          submitted_at: string | null
          teamwork: number | null
          technical_expertise: number | null
          updated_at: string | null
          visibility: string | null
          work_quality: number | null
          would_work_again: string | null
        }
        Insert: {
          additional_comments?: string | null
          communication?: number | null
          created_at?: string | null
          cycle_id: string
          evaluatee_id: string
          evaluator_id: string
          id?: string
          improvements?: string | null
          is_anonymous?: boolean | null
          problem_solving?: number | null
          professional_development?: number | null
          reliability?: number | null
          specific_example?: string | null
          status?: string | null
          strengths?: string | null
          submitted_at?: string | null
          teamwork?: number | null
          technical_expertise?: number | null
          updated_at?: string | null
          visibility?: string | null
          work_quality?: number | null
          would_work_again?: string | null
        }
        Update: {
          additional_comments?: string | null
          communication?: number | null
          created_at?: string | null
          cycle_id?: string
          evaluatee_id?: string
          evaluator_id?: string
          id?: string
          improvements?: string | null
          is_anonymous?: boolean | null
          problem_solving?: number | null
          professional_development?: number | null
          reliability?: number | null
          specific_example?: string | null
          status?: string | null
          strengths?: string | null
          submitted_at?: string | null
          teamwork?: number | null
          technical_expertise?: number | null
          updated_at?: string | null
          visibility?: string | null
          work_quality?: number | null
          would_work_again?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "peer_evaluations_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "evaluation_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peer_evaluations_evaluatee_id_fkey"
            columns: ["evaluatee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peer_evaluations_evaluator_id_fkey"
            columns: ["evaluator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_reviews: {
        Row: {
          comments: string | null
          created_at: string | null
          cycle_id: string | null
          employee_id: string
          financial_score: number | null
          id: string
          non_financial_score: number | null
          overall_score: number | null
          review_period_end: string
          review_period_start: string
          reviewer_id: string | null
          status: Database["public"]["Enums"]["review_status"] | null
          updated_at: string | null
        }
        Insert: {
          comments?: string | null
          created_at?: string | null
          cycle_id?: string | null
          employee_id: string
          financial_score?: number | null
          id?: string
          non_financial_score?: number | null
          overall_score?: number | null
          review_period_end: string
          review_period_start: string
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["review_status"] | null
          updated_at?: string | null
        }
        Update: {
          comments?: string | null
          created_at?: string | null
          cycle_id?: string | null
          employee_id?: string
          financial_score?: number | null
          id?: string
          non_financial_score?: number | null
          overall_score?: number | null
          review_period_end?: string
          review_period_start?: string
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["review_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_reviews_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "evaluation_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reviews_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          certifications: string[] | null
          created_at: string | null
          department_id: string | null
          education: string | null
          email: string
          first_name: string
          hire_date: string | null
          hourly_rate: number | null
          id: string
          last_name: string
          manager_id: string | null
          phone: string | null
          position: string | null
          position_level: Database["public"]["Enums"]["position_level"] | null
          profile_photo_url: string | null
          status: Database["public"]["Enums"]["employment_status"] | null
          updated_at: string | null
        }
        Insert: {
          certifications?: string[] | null
          created_at?: string | null
          department_id?: string | null
          education?: string | null
          email: string
          first_name: string
          hire_date?: string | null
          hourly_rate?: number | null
          id: string
          last_name: string
          manager_id?: string | null
          phone?: string | null
          position?: string | null
          position_level?: Database["public"]["Enums"]["position_level"] | null
          profile_photo_url?: string | null
          status?: Database["public"]["Enums"]["employment_status"] | null
          updated_at?: string | null
        }
        Update: {
          certifications?: string[] | null
          created_at?: string | null
          department_id?: string | null
          education?: string | null
          email?: string
          first_name?: string
          hire_date?: string | null
          hourly_rate?: number | null
          id?: string
          last_name?: string
          manager_id?: string | null
          phone?: string | null
          position?: string | null
          position_level?: Database["public"]["Enums"]["position_level"] | null
          profile_photo_url?: string | null
          status?: Database["public"]["Enums"]["employment_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_financials: {
        Row: {
          amount_collected: number | null
          collection_period: string | null
          completion_percentage: number | null
          created_at: string | null
          fees: number
          id: string
          job_number: string | null
          project_id: string | null
          surplus_deficit: number | null
          updated_at: string | null
        }
        Insert: {
          amount_collected?: number | null
          collection_period?: string | null
          completion_percentage?: number | null
          created_at?: string | null
          fees: number
          id?: string
          job_number?: string | null
          project_id?: string | null
          surplus_deficit?: number | null
          updated_at?: string | null
        }
        Update: {
          amount_collected?: number | null
          collection_period?: string | null
          completion_percentage?: number | null
          created_at?: string | null
          fees?: number
          id?: string
          job_number?: string | null
          project_id?: string | null
          surplus_deficit?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_financials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          budget: number | null
          client_id: string | null
          created_at: string | null
          end_date: string | null
          estimated_hours: number | null
          id: string
          manager_id: string | null
          project_code: string
          project_name: string
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"] | null
          updated_at: string | null
        }
        Insert: {
          budget?: number | null
          client_id?: string | null
          created_at?: string | null
          end_date?: string | null
          estimated_hours?: number | null
          id?: string
          manager_id?: string | null
          project_code: string
          project_name: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"] | null
          updated_at?: string | null
        }
        Update: {
          budget?: number | null
          client_id?: string | null
          created_at?: string | null
          end_date?: string | null
          estimated_hours?: number | null
          id?: string
          manager_id?: string | null
          project_code?: string
          project_name?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          config_key: string
          config_value: Json
          created_at: string | null
          description: string | null
          id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          config_key: string
          config_value: Json
          created_at?: string | null
          description?: string | null
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          config_key?: string
          config_value?: Json
          created_at?: string | null
          description?: string | null
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      todos: {
        Row: {
          created_at: string | null
          employee_id: string
          id: string
          job_id: string
          notes: string | null
          progress_percentage: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          id?: string
          job_id: string
          notes?: string | null
          progress_percentage?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          id?: string
          job_id?: string
          notes?: string | null
          progress_percentage?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "todos_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_profitability"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "todos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      upward_evaluations: {
        Row: {
          additional_comments: string | null
          communication: number | null
          conflict_resolution: number | null
          created_at: string | null
          cycle_id: string
          decision_making: number | null
          delegation: number | null
          evaluator_id: string
          id: string
          improvements: string | null
          is_anonymous: boolean | null
          leadership_vision: number | null
          manager_id: string
          recognition: number | null
          status: string | null
          strengths: string | null
          submitted_at: string | null
          team_development: number | null
          updated_at: string | null
          visibility: string | null
        }
        Insert: {
          additional_comments?: string | null
          communication?: number | null
          conflict_resolution?: number | null
          created_at?: string | null
          cycle_id: string
          decision_making?: number | null
          delegation?: number | null
          evaluator_id: string
          id?: string
          improvements?: string | null
          is_anonymous?: boolean | null
          leadership_vision?: number | null
          manager_id: string
          recognition?: number | null
          status?: string | null
          strengths?: string | null
          submitted_at?: string | null
          team_development?: number | null
          updated_at?: string | null
          visibility?: string | null
        }
        Update: {
          additional_comments?: string | null
          communication?: number | null
          conflict_resolution?: number | null
          created_at?: string | null
          cycle_id?: string
          decision_making?: number | null
          delegation?: number | null
          evaluator_id?: string
          id?: string
          improvements?: string | null
          is_anonymous?: boolean | null
          leadership_vision?: number | null
          manager_id?: string
          recognition?: number | null
          status?: string | null
          strengths?: string | null
          submitted_at?: string | null
          team_development?: number | null
          updated_at?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "upward_evaluations_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "evaluation_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upward_evaluations_evaluator_id_fkey"
            columns: ["evaluator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upward_evaluations_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      work_logs: {
        Row: {
          activity_type: string
          approved_at: string | null
          approved_by: string | null
          billable: boolean | null
          created_at: string | null
          date_worked: string
          employee_id: string
          end_time: string | null
          hours_worked: number
          id: string
          job_id: string | null
          project_id: string | null
          start_time: string | null
          status: string | null
          task_description: string | null
          updated_at: string | null
        }
        Insert: {
          activity_type?: string
          approved_at?: string | null
          approved_by?: string | null
          billable?: boolean | null
          created_at?: string | null
          date_worked: string
          employee_id: string
          end_time?: string | null
          hours_worked: number
          id?: string
          job_id?: string | null
          project_id?: string | null
          start_time?: string | null
          status?: string | null
          task_description?: string | null
          updated_at?: string | null
        }
        Update: {
          activity_type?: string
          approved_at?: string | null
          approved_by?: string | null
          billable?: boolean | null
          created_at?: string | null
          date_worked?: string
          employee_id?: string
          end_time?: string | null
          hours_worked?: number
          id?: string
          job_id?: string | null
          project_id?: string | null
          start_time?: string | null
          status?: string | null
          task_description?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_logs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_profitability"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "work_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      employee_job_contribution: {
        Row: {
          amount_collected: number | null
          billable_hours_contributed: number | null
          client_id: string | null
          contribution_percentage: number | null
          department_id: string | null
          employee_id: string | null
          hours_contributed: number | null
          job_id: string | null
          job_title: string | null
          revenue_contribution: number | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_profitability"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "work_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_actual_hours: {
        Row: {
          billable_actual_hours: number | null
          employee_count: number | null
          job_id: string | null
          total_actual_hours: number | null
        }
        Relationships: [
          {
            foreignKeyName: "work_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_profitability"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "work_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_profitability: {
        Row: {
          actual_billable_revenue: number | null
          amount_collected: number | null
          billable_actual_hours: number | null
          client_id: string | null
          collection_rate: number | null
          completion_percentage: number | null
          department_id: string | null
          efficiency_ratio: number | null
          estimated_hours: number | null
          estimated_revenue: number | null
          fees: number | null
          hourly_rate: number | null
          job_id: string | null
          job_number: string | null
          net_revenue: number | null
          status: string | null
          title: string | null
          total_actual_hours: number | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      team_hierarchy: {
        Row: {
          chain: string[] | null
          department_id: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
          level: number | null
          manager_id: string | null
          position: string | null
          position_level: Database["public"]["Enums"]["position_level"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_employee_financial_score: {
        Args: {
          _employee_id: string
          _period_end: string
          _period_start: string
        }
        Returns: number
      }
      calculate_job_financials: {
        Args: { p_job_id: string }
        Returns: {
          actual_revenue: number
          billable_hours: number
          efficiency_ratio: number
          estimated_revenue: number
          profitability: number
          total_hours: number
        }[]
      }
      get_subordinates: {
        Args: { user_id: string }
        Returns: {
          department_id: string
          employee_id: string
          employee_name: string
          position_level: Database["public"]["Enums"]["position_level"]
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "hr_manager" | "manager" | "employee" | "client"
      employment_status: "active" | "inactive" | "on_leave"
      position_level:
        | "group_managing_partner"
        | "partner"
        | "manager"
        | "senior"
        | "semi_senior"
        | "associate"
        | "intern"
      project_status: "active" | "completed" | "on_hold" | "cancelled"
      review_status: "draft" | "pending" | "completed" | "calibrated"
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
      app_role: ["super_admin", "hr_manager", "manager", "employee", "client"],
      employment_status: ["active", "inactive", "on_leave"],
      position_level: [
        "group_managing_partner",
        "partner",
        "manager",
        "senior",
        "semi_senior",
        "associate",
        "intern",
      ],
      project_status: ["active", "completed", "on_hold", "cancelled"],
      review_status: ["draft", "pending", "completed", "calibrated"],
    },
  },
} as const
