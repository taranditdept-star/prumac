import { z } from "zod";
import { uuid } from "./uuid";

export const fuelLogSchema = z.object({
  vehicle_id: uuid(),
  driver_id: uuid().nullable().optional(),
  trip_id: uuid().nullable().optional(),
  fuel_card_id: uuid().nullable().optional(),
  filled_at: z.string().min(1),
  odometer_km: z.coerce.number().int().min(0).nullable().optional(),
  litres: z.coerce.number().positive(),
  price_per_litre: z.coerce.number().min(0).nullable().optional(),
  total_cost: z.coerce.number().min(0),
  currency: z.string().min(1).max(8).default("USD"),
  is_full_tank: z.coerce.boolean().default(true),
  station: z.string().max(120).nullable().optional(),
  payment_method: z.string().max(40).nullable().optional(),
  receipt_path: z.string().max(400).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const fuelCardSchema = z.object({
  card_number: z.string().min(1).max(60),
  provider: z.string().max(60).nullable().optional(),
  assigned_vehicle_id: uuid().nullable().optional(),
  is_active: z.coerce.boolean().default(true),
  notes: z.string().max(300).nullable().optional(),
});

export type FuelLogInput = z.infer<typeof fuelLogSchema>;
export type FuelCardInput = z.infer<typeof fuelCardSchema>;
