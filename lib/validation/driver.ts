import { z } from "zod";
import { uuid } from "./uuid";

// Common ZW + SA licence classes
const LICENCE_CLASSES = [
  "A",   "A1",  "B",   "C1",  "C",   "EB",  "EC1", "EC", "PRDP",
] as const;

export const driverCreateSchema = z.object({
  full_name: z.string().min(2, "Full name is required").max(120),
  phone: z
    .string()
    .min(9, "Phone is required")
    .regex(/^[\d\s+()-]{9,15}$/, "Enter a valid phone number"),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  employee_number: z.string().max(40).nullable().optional(),
  licence_number: z.string().min(3, "Licence number is required").max(40),
  licence_country: z.enum(["ZW", "ZA"]),
  licence_classes: z.array(z.enum(LICENCE_CLASSES)).min(1, "Pick at least one licence class"),
  licence_issued_at: z.string().nullable().optional(),
  licence_expires_at: z.string().min(1, "Licence expiry is required"),
  defensive_driving_cert_at: z.string().nullable().optional(),
  medical_cert_expires_at: z.string().nullable().optional(),
  home_address: z.string().max(500).nullable().optional(),
  next_of_kin_name: z.string().max(120).nullable().optional(),
  next_of_kin_phone: z.string().max(20).nullable().optional(),
  subsidiary_id: uuid().nullable().optional(),
});

export const driverUpdateSchema = driverCreateSchema
  .partial()
  .extend({ id: uuid() })
  .omit({ phone: true, email: true });

export const driverAssignmentSchema = z.object({
  driver_id: uuid(),
  vehicle_id: uuid(),
  notes: z.string().max(500).nullable().optional(),
});

export type DriverCreateInput = z.infer<typeof driverCreateSchema>;
export type DriverUpdateInput = z.infer<typeof driverUpdateSchema>;
export type DriverAssignmentInput = z.infer<typeof driverAssignmentSchema>;

export { LICENCE_CLASSES };
