import { z } from "zod";
import { uuid } from "./uuid";

const PURPOSES = [
  "delivery", "sales", "collection", "maintenance_run", "admin", "personal", "other",
] as const;

export const tripStartSchema = z.object({
  vehicle_id: uuid(),
  driver_id: uuid(),
  subsidiary_id: uuid(),
  purpose: z.enum(PURPOSES).default("delivery"),
  route_description: z.string().max(500).nullable().optional(),
  origin_label: z.string().max(120).nullable().optional(),
  destination_label: z.string().max(120).nullable().optional(),
  start_odometer_km: z.coerce.number().int().min(0).max(9_999_999),
});

export const tripEndSchema = z.object({
  trip_id: uuid(),
  end_odometer_km: z.coerce.number().int().min(0).max(9_999_999),
  fuel_litres: z.coerce.number().min(0).max(2000).optional().nullable(),
  fuel_amount: z.coerce.number().min(0).max(100000).optional().nullable(),
});

export const tripCancelSchema = z.object({
  trip_id: uuid(),
  reason: z.string().min(3, "Reason is required").max(500),
});

export type TripStartInput = z.infer<typeof tripStartSchema>;
export type TripEndInput = z.infer<typeof tripEndSchema>;
export type TripCancelInput = z.infer<typeof tripCancelSchema>;
