import { z } from "zod";
import { uuid } from "./uuid";

const SEVERITIES = ["low", "medium", "high", "critical"] as const;
const STATUSES = ["reported", "acknowledged", "in_repair", "resolved", "wont_fix"] as const;

export const FAULT_CATEGORIES = [
  ["engine", "Engine"],
  ["brakes", "Brakes"],
  ["suspension", "Suspension"],
  ["electrical", "Electrical"],
  ["body", "Body / Panels"],
  ["tyres", "Tyres / Wheels"],
  ["transmission", "Transmission"],
  ["cooling", "Cooling"],
  ["other", "Other"],
] as const;

export const faultCreateSchema = z.object({
  vehicle_id: uuid(),
  trip_id: uuid().nullable().optional(),
  severity: z.enum(SEVERITIES),
  category: z.string().min(1).max(40),
  title: z.string().min(3, "Title is required").max(120),
  description: z.string().min(5, "Describe the fault").max(2000),
  odometer_km: z.coerce.number().int().min(0).max(9_999_999).nullable().optional(),
  lat: z.coerce.number().min(-90).max(90).nullable().optional(),
  lng: z.coerce.number().min(-180).max(180).nullable().optional(),
});

export const faultStatusSchema = z.object({
  fault_id: uuid(),
  status: z.enum(STATUSES),
  notes: z.string().max(2000).nullable().optional(),
});

export type FaultCreateInput = z.infer<typeof faultCreateSchema>;
export type FaultStatusInput = z.infer<typeof faultStatusSchema>;
