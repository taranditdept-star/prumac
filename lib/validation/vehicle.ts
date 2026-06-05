import { z } from "zod";
import { uuid } from "./uuid";

const VEHICLE_CLASSES = [
  "tanker",
  "truck",
  "minibus",
  "bakkie",
  "suv",
  "sedan",
  "farm_vehicle",
  "specialist",
] as const;

const VEHICLE_STATUSES = [
  "available",
  "on_trip",
  "maintenance",
  "workshop",
  "decommissioned",
] as const;

const FUEL_TYPES = ["diesel", "petrol", "hybrid", "electric"] as const;

export const vehicleSchema = z.object({
  plate_number: z
    .string()
    .min(1, "Plate number is required")
    .max(20)
    .transform((v) => v.toUpperCase().trim()),
  plate_country: z.enum(["ZW", "ZA"]),
  make: z.string().min(1, "Make is required").max(60),
  model: z.string().min(1, "Model is required").max(60),
  variant: z.string().max(60).nullable().optional(),
  year_of_manufacture: z
    .number()
    .int()
    .min(1980)
    .max(2100)
    .nullable()
    .optional(),
  colour: z.string().max(40).nullable().optional(),
  class: z.enum(VEHICLE_CLASSES),
  fuel_type: z.enum(FUEL_TYPES),
  fuel_tank_litres: z.number().positive().nullable().optional(),
  status: z.enum(VEHICLE_STATUSES).default("available"),
  home_branch: z.string().max(60).nullable().optional(),
  default_subsidiary_id: uuid().nullable().optional(),
  current_odometer_km: z.number().int().min(0).default(0),
  vin: z.string().max(20).nullable().optional(),
  engine_number: z.string().max(30).nullable().optional(),
  service_interval_km: z.number().int().positive().default(5000),
  condition_notes: z.string().max(1000).nullable().optional(),
  acquired_at: z.string().nullable().optional(),
  // Lifecycle / depreciation
  purchase_cost: z.number().min(0).nullable().optional(),
  purchase_currency: z.string().min(1).max(8).default("USD"),
  salvage_value: z.number().min(0).nullable().optional(),
  useful_life_years: z.number().positive().max(60).nullable().optional(),
  depreciation_method: z.enum(["straight_line", "none"]).default("straight_line"),
});

export const vehicleUpdateSchema = vehicleSchema.partial().extend({
  id: uuid(),
});

export type VehicleInput = z.infer<typeof vehicleSchema>;
export type VehicleUpdateInput = z.infer<typeof vehicleUpdateSchema>;
