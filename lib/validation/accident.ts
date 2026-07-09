import { z } from "zod";
import { uuid } from "./uuid";

const SEVERITIES = ["minor", "moderate", "severe", "fatal"] as const;
const STATUSES = ["reported", "investigating", "closed"] as const;

export const accidentCreateSchema = z.object({
  vehicle_id: uuid(),
  trip_id: uuid().nullable().optional(),
  severity: z.enum(SEVERITIES),
  occurred_at: z
    .string()
    .min(1, "When did it happen?")
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Enter a valid date and time"),
  location_description: z.string().min(3, "Where did it happen?").max(500),
  odometer_km: z.coerce.number().int().min(0).max(9_999_999).nullable().optional(),
  lat: z.coerce.number().min(-90).max(90).nullable().optional(),
  lng: z.coerce.number().min(-180).max(180).nullable().optional(),
  weather: z.string().max(60).nullable().optional(),
  road_conditions: z.string().max(60).nullable().optional(),
  description: z.string().trim().min(2, "Add a short description of what happened").max(4000),
  other_parties_involved: z.coerce.boolean().default(false),
  third_party_details: z.string().max(2000).nullable().optional(),
  injuries: z.coerce.boolean().default(false),
  injuries_details: z.string().max(2000).nullable().optional(),
  police_report_number: z.string().max(60).nullable().optional(),
  police_station: z.string().max(120).nullable().optional(),
});

export const accidentStatusSchema = z.object({
  accident_id: uuid(),
  status: z.enum(STATUSES),
  closed_notes: z.string().max(2000).nullable().optional(),
});

export type AccidentCreateInput = z.infer<typeof accidentCreateSchema>;
export type AccidentStatusInput = z.infer<typeof accidentStatusSchema>;
