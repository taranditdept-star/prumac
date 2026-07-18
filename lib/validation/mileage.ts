import { z } from "zod";
import { uuid } from "./uuid";

const PURPOSES = ["delivery", "sales", "collection", "maintenance_run", "admin", "personal", "other"] as const;

export const mileageSchema = z
  .object({
    vehicle_id: uuid(),
    occurred_on: z
      .string()
      .min(1, "Pick the date")
      .refine((v) => !Number.isNaN(new Date(v).getTime()), "Enter a valid date"),
    origin_label: z.string().trim().max(120).optional().nullable(),
    destination_label: z.string().trim().max(120).optional().nullable(),
    route_description: z.string().trim().max(500).optional().nullable(),
    purpose: z.enum(PURPOSES).default("delivery"),
    start_odometer_km: z.coerce.number().int().min(0).max(9_999_999),
    end_odometer_km: z.coerce.number().int().min(0).max(9_999_999),
  })
  .refine((d) => d.end_odometer_km >= d.start_odometer_km, {
    message: "End mileage must be at least the start mileage",
    path: ["end_odometer_km"],
  })
  .refine((d) => d.end_odometer_km - d.start_odometer_km <= 5000, {
    message: "That's over 5000 km for one trip — please check the readings",
    path: ["end_odometer_km"],
  });

export type MileageInput = z.infer<typeof mileageSchema>;
