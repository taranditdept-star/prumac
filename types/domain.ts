import type {
  VehicleClass,
  VehicleStatus,
  FuelType,
  CountryCode,
  DocumentType,
  InsuranceType,
} from "./database";

// Re-export DB enums as domain types for convenience
export type { VehicleClass, VehicleStatus, FuelType, CountryCode, DocumentType, InsuranceType };

export type AppRole = "driver" | "fleet_manager" | "subsidiary_billing" | "admin";

export type TripStatus =
  | "planned"
  | "in_progress"
  | "paused"
  | "ended"
  | "completed"
  | "cancelled";

export type ReconciliationStatus = "accepted" | "warning" | "flagged" | "critical";

export type BillingMode = "per_km" | "per_litre_100km" | "per_load" | "fixed_monthly";

export type InvoiceStatus = "draft" | "issued" | "paid" | "overdue" | "voided";

/** Urgency level for document expiry colouring. */
export type ExpiryUrgency = "expired" | "critical" | "warning" | "ok";

/** Matches the app.profiles table row. */
export interface ProfileRow {
  id: string;
  role: AppRole;
  full_name: string | null;
  phone: string | null;
  subsidiary_id: string | null;
  driver_id: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

/** Matches app.vehicles row. */
export interface VehicleRow {
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
  service_interval_days: number | null;
  last_service_date: string | null;
  condition_notes: string | null;
  acquired_at: string | null;
  decommissioned_at: string | null;
  decommission_reason: string | null;
  purchase_cost: number | null;
  purchase_currency: string;
  salvage_value: number | null;
  useful_life_years: number | null;
  depreciation_method: "straight_line" | "none";
  disposal_proceeds: number | null;
  created_at: string;
  updated_at: string;
}

/** Matches app.vehicle_documents row. */
export interface DocumentRow {
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
}

/** Matches app.drivers row. */
export interface DriverRow {
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
}

/** Driver joined with profile and (optionally) current assignment. */
export interface DriverWithProfile extends DriverRow {
  profile: {
    id: string;
    full_name: string | null;
    phone: string | null;
    avatar_url: string | null;
    subsidiary_id: string | null;
  };
  current_vehicle: {
    id: string;
    plate_number: string;
    plate_country: CountryCode;
    make: string;
    model: string;
  } | null;
}

/** Vehicle assignment row joined with vehicle and driver names. */
export interface AssignmentRow {
  id: string;
  vehicle_id: string;
  driver_id: string;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  vehicle?: { plate_number: string; plate_country: CountryCode; make: string; model: string };
  driver?: { full_name: string | null };
}

/** Vehicle with its active documents for the detail view. */
export interface VehicleWithDocuments extends VehicleRow {
  documents: DocumentRow[];
  current_driver: { id: string; full_name: string } | null;
  subsidiary: { id: string; name: string } | null;
}

/** Minimal vehicle shape for lists and selects. */
export interface VehicleSummary {
  id: string;
  plate_number: string;
  plate_country: CountryCode;
  make: string;
  model: string;
  variant: string | null;
  status: VehicleStatus;
  class: VehicleClass;
  current_odometer_km: number;
  home_branch: string | null;
}

// ---------------------------------------------------------------------------
// Phase 11 — Maintenance cluster
// ---------------------------------------------------------------------------

export type PartCategory =
  | "tyre" | "filter" | "oil" | "fluid" | "brake" | "battery"
  | "belt" | "electrical" | "body" | "service_kit" | "other";

export type TyreStatus = "in_service" | "spare" | "in_store" | "scrapped";

export type PartMovementType = "in" | "out" | "adjustment";

/** Matches app.fuel_logs row. */
export interface FuelLogRow {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  trip_id: string | null;
  fuel_card_id: string | null;
  filled_at: string;
  odometer_km: number | null;
  litres: number;
  price_per_litre: number | null;
  total_cost: number;
  currency: string;
  is_full_tank: boolean;
  station: string | null;
  payment_method: string | null;
  receipt_path: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Return shape of app.fn_vehicle_fuel_efficiency. */
export interface FuelEfficiency {
  total_litres: number;
  total_cost: number;
  distance_km: number;
  litres_per_100km: number | null;
  cost_per_km: number | null;
  fill_count: number;
}

/** Matches app.pm_plans row. */
export interface PmPlanRow {
  id: string;
  vehicle_id: string;
  task_name: string;
  interval_km: number | null;
  interval_days: number | null;
  last_done_km: number | null;
  last_done_at: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Return shape of app.fn_upcoming_maintenance. */
export interface UpcomingMaintenanceRow {
  vehicle_id: string;
  plate_number: string;
  plate_country: CountryCode;
  make: string;
  model: string;
  source: "base" | "plan";
  plan_id: string | null;
  task_name: string;
  due_odometer_km: number | null;
  km_remaining: number | null;
  due_date: string | null;
  days_remaining: number | null;
  is_overdue: boolean;
}

/** Matches app.parts row. */
export interface PartRow {
  id: string;
  sku: string | null;
  name: string;
  category: PartCategory;
  unit: string;
  unit_cost: number | null;
  currency: string;
  current_stock: number;
  reorder_level: number;
  supplier: string | null;
  location: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Matches app.tyres row. */
export interface TyreRow {
  id: string;
  serial_number: string | null;
  brand: string | null;
  pattern: string | null;
  size: string | null;
  vehicle_id: string | null;
  position: string | null;
  status: TyreStatus;
  fitted_at: string | null;
  fitted_odometer_km: number | null;
  removed_at: string | null;
  tread_depth_mm: number | null;
  cost: number | null;
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Phase 12 — Driver cluster
// ---------------------------------------------------------------------------

export type LeaveType = "annual" | "sick" | "unpaid" | "compassionate" | "study" | "other";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export type DriverRating = "excellent" | "good" | "fair" | "poor";

/** Matches app.driver_leave row. */
export interface DriverLeaveRow {
  id: string;
  driver_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  status: LeaveStatus;
  reason: string | null;
  requested_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Return shape of app.fn_driver_scorecard. */
export interface DriverScorecard {
  trips_completed: number;
  trips_cancelled: number;
  completion_rate: number;
  total_km: number;
  punctual_starts: number;
  measurable_starts: number;
  punctuality_pct: number;
  inspection_total: number;
  inspection_fail_count: number;
  fault_count: number;
  accident_count: number;
  recon_flag_count: number;
  recon_critical_count: number;
  safety_score: number;
  overall_score: number;
  rating: DriverRating;
}

/** Return shape of app.fn_driver_scorecards (leaderboard). */
export interface DriverScorecardRow {
  driver_id: string;
  full_name: string | null;
  trips_completed: number;
  total_km: number;
  completion_rate: number;
  punctuality_pct: number;
  accident_count: number;
  recon_flag_count: number;
  recon_critical_count: number;
  inspection_fail_count: number;
  safety_score: number;
  overall_score: number;
  rating: DriverRating;
}

/** Return shape of app.fn_driver_availability. */
export interface DriverAvailabilityRow {
  driver_id: string;
  full_name: string | null;
  is_available: boolean;
  reason: "available" | "on_leave" | "on_trip";
  leave_type: LeaveType | null;
  current_trip_id: string | null;
}

// ---------------------------------------------------------------------------
// Phase 13 — Lifecycle / depreciation + audit
// ---------------------------------------------------------------------------

/** Return shape of app.fn_vehicle_depreciation. */
export interface VehicleDepreciation {
  purchase_cost: number | null;
  salvage_value: number;
  useful_life_years: number | null;
  method: "straight_line" | "none";
  age_years: number | null;
  annual_depreciation: number | null;
  accumulated_depreciation: number | null;
  book_value: number | null;
  depreciation_pct: number | null;
  lifetime_km: number;
  cost_per_km: number | null;
  is_disposed: boolean;
}

/** Return shape of app.fn_fleet_depreciation. */
export interface FleetDepreciationRow {
  vehicle_id: string;
  plate_number: string;
  plate_country: CountryCode;
  make: string;
  model: string;
  status: VehicleStatus;
  purchase_cost: number | null;
  book_value: number | null;
  accumulated_depreciation: number | null;
  depreciation_pct: number | null;
  age_years: number | null;
  cost_per_km: number | null;
}

/** Return shape of app.fn_audit_recent / fn_audit_for_row. */
export interface AuditEntry {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  operation: "INSERT" | "UPDATE" | "DELETE";
  schema_name?: string;
  table_name?: string;
  row_pk?: string;
  changed_columns: string[] | null;
  before_row: Record<string, unknown> | null;
  after_row: Record<string, unknown> | null;
}

/** Trip with related driver + vehicle detail for manager views. */
export interface TripWithDetails {
  id: string;
  status: TripStatus;
  vehicle: VehicleSummary;
  driver_name: string;
  start_odometer_km: number;
  end_odometer_km: number | null;
  started_at: string;
  ended_at: string | null;
  reconciliation_status: ReconciliationStatus | null;
}
