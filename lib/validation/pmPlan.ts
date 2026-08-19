import { z } from "zod";
import { odometerKmOptional } from "./odometer";
import { uuid } from "./uuid";

export const pmPlanSchema = z
  .object({
    vehicle_id: uuid(),
    task_name: z.string().min(2).max(120),
    interval_km: z.coerce.number().int().positive().nullable().optional(),
    interval_days: z.coerce.number().int().positive().nullable().optional(),
    last_done_km: odometerKmOptional(),
    last_done_at: z.string().nullable().optional(),
    notes: z.string().max(400).nullable().optional(),
  })
  .refine((v) => v.interval_km != null || v.interval_days != null, {
    message: "Set a distance interval, a time interval, or both.",
    path: ["interval_km"],
  });

export type PmPlanInput = z.infer<typeof pmPlanSchema>;
