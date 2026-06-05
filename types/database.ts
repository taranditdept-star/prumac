/**
 * Supabase generated types — stub until `npm run db:types` is run against a live instance.
 * Regenerate: npx supabase gen types typescript --local > types/database.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ── Enum mirrors ─────────────────────────────────────────────────────────────

export type VehicleClass =
  | "tanker"
  | "truck"
  | "minibus"
  | "bakkie"
  | "suv"
  | "sedan"
  | "farm_vehicle"
  | "specialist";

export type VehicleStatus = "available" | "on_trip" | "maintenance" | "workshop" | "decommissioned";

export type FuelType = "diesel" | "petrol" | "hybrid" | "electric";

export type CountryCode = "ZW" | "ZA";

export type DocumentType =
  | "license_disc"
  | "insurance"
  | "fitness"
  | "registration"
  | "cross_border";

export type InsuranceType =
  | "third_party"
  | "full_cover"
  | "champions"
  | "old_mutual_full_cover"
  | "miway_full_cover"
  | "other";

export type AppRole = "driver" | "fleet_manager" | "subsidiary_billing" | "admin";

export interface Database {
  app: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: AppRole;
          full_name: string | null;
          phone: string | null;
          subsidiary_id: string | null;
          driver_id: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role: AppRole;
          full_name?: string | null;
          phone?: string | null;
          subsidiary_id?: string | null;
          driver_id?: string | null;
          avatar_url?: string | null;
        };
        Update: Partial<Database["app"]["Tables"]["profiles"]["Insert"]>;
      };
      subsidiaries: {
        Row: {
          id: string;
          name: string;
          code: string;
          country: CountryCode;
          created_at: string;
        };
        Insert: Omit<Database["app"]["Tables"]["subsidiaries"]["Row"], "id" | "created_at">;
        Update: Partial<Database["app"]["Tables"]["subsidiaries"]["Insert"]>;
      };
      drivers: {
        Row: {
          id: string;
          profile_id: string;
          employee_number: string | null;
          licence_number: string;
          licence_country: CountryCode;
          licence_classes: string[];
          licence_issued_at: string | null;
          licence_expires_at: string | null;
          defensive_driving_cert_at: string | null;
          medical_cert_expires_at: string | null;
          home_address: string | null;
          next_of_kin_name: string | null;
          next_of_kin_phone: string | null;
          is_active: boolean;
          deactivated_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["app"]["Tables"]["drivers"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["app"]["Tables"]["drivers"]["Insert"]>;
      };
      vehicles: {
        Row: {
          id: string;
          plate_number: string;
          plate_country: CountryCode;
          vin: string | null;
          engine_number: string | null;
          make: string;
          model: string;
          variant: string | null;
          year_of_manufacture: number | null;
          colour: string | null;
          class: VehicleClass;
          fuel_type: FuelType;
          fuel_tank_litres: number | null;
          status: VehicleStatus;
          home_branch: string | null;
          default_subsidiary_id: string | null;
          current_odometer_km: number;
          last_service_odometer_km: number | null;
          service_interval_km: number;
          condition_notes: string | null;
          acquired_at: string | null;
          decommissioned_at: string | null;
          decommission_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["app"]["Tables"]["vehicles"]["Row"],
          "id" | "created_at" | "updated_at"
        >;
        Update: Partial<Database["app"]["Tables"]["vehicles"]["Insert"]>;
      };
      vehicle_documents: {
        Row: {
          id: string;
          vehicle_id: string;
          document_type: DocumentType;
          insurance_type: InsuranceType | null;
          document_number: string | null;
          issuer: string | null;
          issued_at: string | null;
          expires_at: string;
          policy_amount: number | null;
          file_path: string | null;
          notes: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["app"]["Tables"]["vehicle_documents"]["Row"],
          "id" | "created_at" | "updated_at"
        >;
        Update: Partial<Database["app"]["Tables"]["vehicle_documents"]["Insert"]>;
      };
      vehicle_assignments: {
        Row: {
          id: string;
          vehicle_id: string;
          driver_id: string;
          started_at: string;
          ended_at: string | null;
          assigned_by: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: Omit<Database["app"]["Tables"]["vehicle_assignments"]["Row"], "id" | "created_at">;
        Update: Partial<Database["app"]["Tables"]["vehicle_assignments"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      app_role: AppRole;
      vehicle_class: VehicleClass;
      vehicle_status: VehicleStatus;
      fuel_type: FuelType;
      document_type: DocumentType;
      insurance_type: InsuranceType;
    };
  };
  fleet: { Tables: Record<string, never>; Views: Record<string, never>; Functions: Record<string, never>; Enums: Record<string, never> };
}
