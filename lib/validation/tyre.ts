import { z } from "zod";
import { uuid } from "./uuid";

export const TYRE_STATUSES = ["in_service", "spare", "in_store", "scrapped"] as const;

export const tyreSchema = z.object({
  serial_number: z.string().max(80).nullable().optional(),
  brand: z.string().max(80).nullable().optional(),
  pattern: z.string().max(80).nullable().optional(),
  size: z.string().max(40).nullable().optional(),
  vehicle_id: uuid().nullable().optional(),
  position: z.string().max(16).nullable().optional(),
  status: z.enum(TYRE_STATUSES).default("in_store"),
  fitted_at: z.string().nullable().optional(),
  fitted_odometer_km: z.coerce.number().int().min(0).nullable().optional(),
  tread_depth_mm: z.coerce.number().min(0).max(40).nullable().optional(),
  cost: z.coerce.number().min(0).nullable().optional(),
  currency: z.string().min(1).max(8).default("USD"),
  notes: z.string().max(400).nullable().optional(),
});

export const tyreEventSchema = z.object({
  tyre_id: uuid(),
  vehicle_id: uuid().nullable().optional(),
  event_type: z.enum(["fitted", "removed", "rotated", "inspected", "scrapped"]),
  position: z.string().max(16).nullable().optional(),
  odometer_km: z.coerce.number().int().min(0).nullable().optional(),
  tread_depth_mm: z.coerce.number().min(0).max(40).nullable().optional(),
  occurred_at: z.string().min(1),
  notes: z.string().max(400).nullable().optional(),
});

export type TyreInput = z.infer<typeof tyreSchema>;
export type TyreEventInput = z.infer<typeof tyreEventSchema>;
