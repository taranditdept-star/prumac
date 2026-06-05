import { z } from "zod";
import { uuid } from "./uuid";

export const PART_CATEGORIES = [
  "tyre",
  "filter",
  "oil",
  "fluid",
  "brake",
  "battery",
  "belt",
  "electrical",
  "body",
  "service_kit",
  "other",
] as const;

export const partSchema = z.object({
  sku: z.string().max(60).nullable().optional(),
  name: z.string().min(2).max(160),
  category: z.enum(PART_CATEGORIES).default("other"),
  unit: z.string().min(1).max(20).default("each"),
  unit_cost: z.coerce.number().min(0).nullable().optional(),
  currency: z.string().min(1).max(8).default("USD"),
  reorder_level: z.coerce.number().min(0).default(0),
  opening_stock: z.coerce.number().min(0).default(0),
  supplier: z.string().max(120).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  notes: z.string().max(400).nullable().optional(),
});

export const partMovementSchema = z.object({
  part_id: uuid(),
  movement_type: z.enum(["in", "out", "adjustment"]),
  quantity: z.coerce.number(),
  unit_cost: z.coerce.number().min(0).nullable().optional(),
  vehicle_id: uuid().nullable().optional(),
  reference: z.string().max(120).nullable().optional(),
  notes: z.string().max(400).nullable().optional(),
});

export type PartInput = z.infer<typeof partSchema>;
export type PartMovementInput = z.infer<typeof partMovementSchema>;
