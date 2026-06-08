import { z } from "zod";
import { uuid } from "./uuid";

export const BILLING_MODES = [
  "per_km",
  "per_litre_100km",
  "per_load",
  "fixed_monthly",
] as const;

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

// Create a brand-new rate (any mode).
export const rateCreateSchema = z
  .object({
    vehicle_id: uuid(),
    subsidiary_id: uuid().nullable().optional(),
    mode: z.enum(BILLING_MODES),
    rate_amount: z.coerce.number().min(0, "Rate must be ≥ 0").max(1_000_000),
    currency: z.string().min(1).max(8).default("USD"),
    radius_km: z.coerce.number().min(0.01).max(9999).nullable().optional(),
    effective_from: dateString,
    notes: z.string().max(500).nullable().optional(),
  })
  .refine((d) => (d.mode === "per_load" ? d.radius_km != null : true), {
    message: "Radius (km) is required for per-load rates",
    path: ["radius_km"],
  });

// Supersede an existing rate: mode/vehicle/subsidiary stay fixed, a new
// effective-dated row is created and the old one is closed.
export const rateUpdateSchema = z.object({
  rate_id: uuid(),
  rate_amount: z.coerce.number().min(0, "Rate must be ≥ 0").max(1_000_000),
  currency: z.string().min(1).max(8).default("USD"),
  radius_km: z.coerce.number().min(0.01).max(9999).nullable().optional(),
  effective_from: dateString,
  notes: z.string().max(500).nullable().optional(),
});

export type RateCreateInput = z.infer<typeof rateCreateSchema>;
export type RateUpdateInput = z.infer<typeof rateUpdateSchema>;
