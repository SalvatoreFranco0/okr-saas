
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "actions": {
                  Row: {
                    "assignee_id": string | null,"created_at": string,"created_by": string | null,"description": string | null,"due_date": string | null,"id": string,"is_completed": boolean,"key_result_id": string,"organization_id": string,"title": string,"updated_at": string,"updated_by": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "assignee_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_date"?: string | null,"id"?: string,"is_completed"?: boolean,"key_result_id": string,"organization_id": string,"title": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Update: {
                    "assignee_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_date"?: string | null,"id"?: string,"is_completed"?: boolean,"key_result_id"?: string,"organization_id"?: string,"title"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "actions_assignee_fkey"
      columns: ["organization_id","assignee_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["organization_id","user_id"]
    },{
      foreignKeyName: "actions_assignee_fkey"
      columns: ["organization_id","assignee_id"]
isOneToOne: false
      referencedRelation: "v_org_members"
      referencedColumns: ["organization_id","user_id"]
    },{
      foreignKeyName: "actions_key_result_fkey"
      columns: ["key_result_id","organization_id"]
isOneToOne: false
      referencedRelation: "key_results"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "actions_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"created_at": string,"details": NonNullable<Json>,"entity": string,"entity_id": string | null,"id": string,"okr_id": string | null,"organization_id": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"created_at"?: string,"details"?: NonNullable<Json>,"entity": string,"entity_id"?: string | null,"id"?: string,"okr_id"?: string | null,"organization_id": string,"user_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"created_at"?: string,"details"?: NonNullable<Json>,"entity"?: string,"entity_id"?: string | null,"id"?: string,"okr_id"?: string | null,"organization_id"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"comments": {
                  Row: {
                    "content": string,"created_at": string,"id": string,"okr_id": string,"organization_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": string,"created_at"?: string,"id"?: string,"okr_id": string,"organization_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "content"?: string,"created_at"?: string,"id"?: string,"okr_id"?: string,"organization_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_okr_fkey"
      columns: ["okr_id","organization_id"]
isOneToOne: false
      referencedRelation: "okrs"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "comments_okr_fkey"
      columns: ["okr_id","organization_id"]
isOneToOne: false
      referencedRelation: "v_okr_at_risk"
      referencedColumns: ["okr_id","organization_id"]
    },{
      foreignKeyName: "comments_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"key_result_updates": {
                  Row: {
                    "created_at": string,"id": string,"key_result_id": string,"new_value": number | null,"note": string | null,"old_value": number | null,"organization_id": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"key_result_id": string,"new_value"?: number | null,"note"?: string | null,"old_value"?: number | null,"organization_id": string,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"key_result_id"?: string,"new_value"?: number | null,"note"?: string | null,"old_value"?: number | null,"organization_id"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "key_result_updates_kr_fkey"
      columns: ["key_result_id","organization_id"]
isOneToOne: false
      referencedRelation: "key_results"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "key_result_updates_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"key_results": {
                  Row: {
                    "created_at": string,"created_by": string | null,"current_metric": number,"description": string | null,"id": string,"initial_metric": number,"last_updated_at": string | null,"okr_id": string,"organization_id": string,"status": Database["public"]['Enums']["kr_status"],"target_metric": number,"title": string,"unit": string,"updated_at": string,"updated_by": string | null,"version": number,"weight": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"current_metric"?: number,"description"?: string | null,"id"?: string,"initial_metric"?: number,"last_updated_at"?: string | null,"okr_id": string,"organization_id": string,"status"?: Database["public"]['Enums']["kr_status"],"target_metric": number,"title": string,"unit"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"weight"?: number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"current_metric"?: number,"description"?: string | null,"id"?: string,"initial_metric"?: number,"last_updated_at"?: string | null,"okr_id"?: string,"organization_id"?: string,"status"?: Database["public"]['Enums']["kr_status"],"target_metric"?: number,"title"?: string,"unit"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"weight"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "key_results_okr_fkey"
      columns: ["okr_id","organization_id"]
isOneToOne: false
      referencedRelation: "okrs"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "key_results_okr_fkey"
      columns: ["okr_id","organization_id"]
isOneToOne: false
      referencedRelation: "v_okr_at_risk"
      referencedColumns: ["okr_id","organization_id"]
    },{
      foreignKeyName: "key_results_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"locations": {
                  Row: {
                    "address": string | null,"created_at": string,"id": string,"is_active": boolean,"name": string,"organization_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"organization_id": string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"organization_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "locations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"membership_locations": {
                  Row: {
                    "created_at": string,"location_id": string,"organization_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"location_id": string,"organization_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"location_id"?: string,"organization_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "membership_locations_location_fkey"
      columns: ["location_id","organization_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "membership_locations_member_fkey"
      columns: ["organization_id","user_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["organization_id","user_id"]
    },{
      foreignKeyName: "membership_locations_member_fkey"
      columns: ["organization_id","user_id"]
isOneToOne: false
      referencedRelation: "v_org_members"
      referencedColumns: ["organization_id","user_id"]
    },{
      foreignKeyName: "membership_locations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"organization_id": string,"role": Database["public"]['Enums']["org_role"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"organization_id": string,"role"?: Database["public"]['Enums']["org_role"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"organization_id"?: string,"role"?: Database["public"]['Enums']["org_role"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"okr_alignments": {
                  Row: {
                    "child_okr_id": string,"created_at": string,"created_by": string | null,"id": string,"organization_id": string,"parent_okr_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "child_okr_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"organization_id": string,"parent_okr_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "child_okr_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"organization_id"?: string,"parent_okr_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "okr_alignments_child_fkey"
      columns: ["child_okr_id","organization_id"]
isOneToOne: false
      referencedRelation: "okrs"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "okr_alignments_child_fkey"
      columns: ["child_okr_id","organization_id"]
isOneToOne: false
      referencedRelation: "v_okr_at_risk"
      referencedColumns: ["okr_id","organization_id"]
    },{
      foreignKeyName: "okr_alignments_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "okr_alignments_parent_fkey"
      columns: ["parent_okr_id","organization_id"]
isOneToOne: false
      referencedRelation: "okrs"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "okr_alignments_parent_fkey"
      columns: ["parent_okr_id","organization_id"]
isOneToOne: false
      referencedRelation: "v_okr_at_risk"
      referencedColumns: ["okr_id","organization_id"]
    }
                  ]
                },"okr_progress_history": {
                  Row: {
                    "id": string,"okr_id": string,"organization_id": string,"progress_percentage": number,"recorded_at": string,"recorded_on": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"okr_id": string,"organization_id": string,"progress_percentage": number,"recorded_at"?: string,"recorded_on": string
                  }
                  Update: {
                    "id"?: string,"okr_id"?: string,"organization_id"?: string,"progress_percentage"?: number,"recorded_at"?: string,"recorded_on"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "okr_progress_history_okr_fkey"
      columns: ["okr_id","organization_id"]
isOneToOne: false
      referencedRelation: "okrs"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "okr_progress_history_okr_fkey"
      columns: ["okr_id","organization_id"]
isOneToOne: false
      referencedRelation: "v_okr_at_risk"
      referencedColumns: ["okr_id","organization_id"]
    },{
      foreignKeyName: "okr_progress_history_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"okrs": {
                  Row: {
                    "created_at": string,"created_by": string | null,"deleted_at": string | null,"description": string | null,"end_date": string | null,"id": string,"location_id": string | null,"notes": string | null,"objective": string,"organization_id": string,"owner_id": string,"period_id": string,"priority": Database["public"]['Enums']["priority"],"progress_percentage": number,"start_date": string | null,"status": Database["public"]['Enums']["okr_status"],"tags": (string)[],"team_id": string | null,"title": string,"updated_at": string,"updated_by": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"description"?: string | null,"end_date"?: string | null,"id"?: string,"location_id"?: string | null,"notes"?: string | null,"objective": string,"organization_id": string,"owner_id": string,"period_id": string,"priority"?: Database["public"]['Enums']["priority"],"progress_percentage"?: number,"start_date"?: string | null,"status"?: Database["public"]['Enums']["okr_status"],"tags"?: (string)[],"team_id"?: string | null,"title": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"description"?: string | null,"end_date"?: string | null,"id"?: string,"location_id"?: string | null,"notes"?: string | null,"objective"?: string,"organization_id"?: string,"owner_id"?: string,"period_id"?: string,"priority"?: Database["public"]['Enums']["priority"],"progress_percentage"?: number,"start_date"?: string | null,"status"?: Database["public"]['Enums']["okr_status"],"tags"?: (string)[],"team_id"?: string | null,"title"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "okrs_location_fkey"
      columns: ["location_id","organization_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "okrs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "okrs_owner_fkey"
      columns: ["organization_id","owner_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["organization_id","user_id"]
    },{
      foreignKeyName: "okrs_owner_fkey"
      columns: ["organization_id","owner_id"]
isOneToOne: false
      referencedRelation: "v_org_members"
      referencedColumns: ["organization_id","user_id"]
    },{
      foreignKeyName: "okrs_period_fkey"
      columns: ["period_id","organization_id"]
isOneToOne: false
      referencedRelation: "periods"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "okrs_team_fkey"
      columns: ["team_id","organization_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"name": string,"plan": string,"slug": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"plan"?: string,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"plan"?: string,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"periods": {
                  Row: {
                    "created_at": string,"end_date": string,"id": string,"is_closed": boolean,"name": string,"organization_id": string,"start_date": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"end_date": string,"id"?: string,"is_closed"?: boolean,"name": string,"organization_id": string,"start_date": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"end_date"?: string,"id"?: string,"is_closed"?: boolean,"name"?: string,"organization_id"?: string,"start_date"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "periods_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_admins": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string | null,"first_name": string | null,"id": string,"last_name": string | null,"locale": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"first_name"?: string | null,"id": string,"last_name"?: string | null,"locale"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"first_name"?: string | null,"id"?: string,"last_name"?: string | null,"locale"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"support_sessions": {
                  Row: {
                    "created_at": string,"ended_at": string | null,"expires_at": string,"id": string,"organization_id": string,"platform_admin_id": string,"reason": string,"started_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ended_at"?: string | null,"expires_at": string,"id"?: string,"organization_id": string,"platform_admin_id": string,"reason": string,"started_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"ended_at"?: string | null,"expires_at"?: string,"id"?: string,"organization_id"?: string,"platform_admin_id"?: string,"reason"?: string,"started_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "support_sessions_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "support_sessions_platform_admin_id_fkey"
      columns: ["platform_admin_id"]
isOneToOne: false
      referencedRelation: "platform_admins"
      referencedColumns: ["user_id"]
    }
                  ]
                },"team_members": {
                  Row: {
                    "created_at": string,"organization_id": string,"team_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"organization_id": string,"team_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"organization_id"?: string,"team_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_members_member_fkey"
      columns: ["organization_id","user_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["organization_id","user_id"]
    },{
      foreignKeyName: "team_members_member_fkey"
      columns: ["organization_id","user_id"]
isOneToOne: false
      referencedRelation: "v_org_members"
      referencedColumns: ["organization_id","user_id"]
    },{
      foreignKeyName: "team_members_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "team_members_team_fkey"
      columns: ["team_id","organization_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"teams": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"is_active": boolean,"name": string,"organization_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"organization_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"organization_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teams_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "v_okr_at_risk": {
                  Row: {
                    "due_soon_low_progress": boolean | null,"end_date": string | null,"has_at_risk_kr": boolean | null,"location_id": string | null,"okr_id": string,"organization_id": string,"owner_id": string,"period_id": string,"priority": Database["public"]['Enums']["priority"],"progress_percentage": number,"team_id": string | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                           "due_soon_low_progress"?: never,"end_date"?: string | null,"has_at_risk_kr"?: never,"location_id"?: string | null,"okr_id"?: string | null,"organization_id"?: string | null,"owner_id"?: string | null,"period_id"?: string | null,"priority"?: Database["public"]['Enums']["priority"] | null,"progress_percentage"?: number | null,"team_id"?: string | null,"title"?: string | null
                         }
                        Update: {
                           "due_soon_low_progress"?: never,"end_date"?: string | null,"has_at_risk_kr"?: never,"location_id"?: string | null,"okr_id"?: string | null,"organization_id"?: string | null,"owner_id"?: string | null,"period_id"?: string | null,"priority"?: Database["public"]['Enums']["priority"] | null,"progress_percentage"?: number | null,"team_id"?: string | null,"title"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "okrs_location_fkey"
      columns: ["location_id","organization_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "okrs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "okrs_owner_fkey"
      columns: ["organization_id","owner_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["organization_id","user_id"]
    },{
      foreignKeyName: "okrs_owner_fkey"
      columns: ["organization_id","owner_id"]
isOneToOne: false
      referencedRelation: "v_org_members"
      referencedColumns: ["organization_id","user_id"]
    },{
      foreignKeyName: "okrs_period_fkey"
      columns: ["period_id","organization_id"]
isOneToOne: false
      referencedRelation: "periods"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "okrs_team_fkey"
      columns: ["team_id","organization_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"v_okr_summary": {
                  Row: {
                    "avg_progress": number | null,"location_id": string | null,"okr_count": number | null,"organization_id": string,"period_id": string,"priority": Database["public"]['Enums']["priority"],"status": Database["public"]['Enums']["okr_status"],"team_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "okrs_location_fkey"
      columns: ["location_id","organization_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "okrs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "okrs_period_fkey"
      columns: ["period_id","organization_id"]
isOneToOne: false
      referencedRelation: "periods"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "okrs_team_fkey"
      columns: ["team_id","organization_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"v_org_members": {
                  Row: {
                    "email": string | null,"first_name": string | null,"is_active": boolean,"last_name": string | null,"location_ids": (string)[] | null,"organization_id": string,"role": Database["public"]['Enums']["org_role"],"user_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "memberships_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "admin_apply_member":
{ Args: { "p_actor"?: string,"p_is_active": boolean,"p_location_ids"?: (string)[],"p_org": string,"p_role": Database["public"]['Enums']["org_role"],"p_user": string }; Returns: undefined
                            },
"dashboard_stats":
{ Args: { "p_location"?: string,"p_org": string,"p_period"?: string,"p_team"?: string }; Returns: Json
                           },
"kr_check_in":
{ Args: { "p_kr": string,"p_note"?: string,"p_value": number }; Returns: {
              "created_at": string,
"created_by": string | null,
"current_metric": number,
"description": string | null,
"id": string,
"initial_metric": number,
"last_updated_at": string | null,
"okr_id": string,
"organization_id": string,
"status": Database["public"]['Enums']["kr_status"],
"target_metric": number,
"title": string,
"unit": string,
"updated_at": string,
"updated_by": string | null,
"version": number,
"weight": number
            }
                          SetofOptions: {
        from: "*"
        to: "key_results"
        isOneToOne: true
        isSetofReturn: false
      } },
"okr_create_with_krs":
{ Args: { "p_krs": Json,"p_okr": Json }; Returns: string
                           },
"org_member_directory":
{ Args: { "p_org": string }; Returns: {
              "first_name": string,"last_name": string,"role": Database["public"]['Enums']["org_role"],"user_id": string
            }[]
                           }
          }
          Enums: {
            "kr_status": "non_iniziato"|"in_progresso"|"on_track"|"at_risk"|"completato","okr_status": "in_pianificazione"|"attivo"|"in_pausa"|"completato"|"non_raggiunto","org_role": "admin"|"manager_okr"|"team_lead"|"viewer","priority": "bassa"|"media"|"alta"|"critica"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "kr_status": ["non_iniziato", "in_progresso", "on_track", "at_risk", "completato"],"okr_status": ["in_pianificazione", "attivo", "in_pausa", "completato", "non_raggiunto"],"org_role": ["admin", "manager_okr", "team_lead", "viewer"],"priority": ["bassa", "media", "alta", "critica"]
          }
        }
} as const
