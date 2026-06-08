import { z } from "zod";
import { uuid } from "./uuid";

const itemSchema = z.object({
  checklist_item_id: uuid(),
  result: z.enum(["pass", "attention", "fail"]),
  notes: z.string().max(1000).optional(),
});

export const initiateHandoverSchema = z.object({
  vehicle_id: uuid(),
  to_driver_id: uuid(),
  template_id: uuid(),
  odometer_km: z.coerce.number().int().min(0).max(9_999_999),
  inspection_notes: z.string().max(2000).optional(),
  handover_notes: z.string().max(2000).optional(),
  items: z.array(itemSchema).min(1),
});

export const confirmTakeoverSchema = z.object({
  handover_id: uuid(),
  template_id: uuid(),
  odometer_km: z.coerce.number().int().min(0).max(9_999_999),
  notes: z.string().max(2000).optional(),
  items: z.array(itemSchema).min(1),
});

export type InitiateHandoverInput = z.infer<typeof initiateHandoverSchema>;
export type ConfirmTakeoverInput = z.infer<typeof confirmTakeoverSchema>;
