import { z } from "zod";

/**
 * What a DRIVER may change about themselves. Deliberately narrower than
 * driverCreateSchema: employee_number, role and active status are the office's
 * to set, so they aren't in this schema at all and the RPC ignores them.
 */
const LICENCE_CLASSES = [
  "1", "2", "3", "4", "5",
  "A", "A1", "B", "C1", "C", "EB", "EC1", "EC", "PRDP",
] as const;

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker")
  .nullable()
  .optional()
  .or(z.literal(""));

export const myProfileSchema = z.object({
  full_name: z.string().min(2, "Please give your full name").max(120),
  phone: z
    .string()
    .min(9, "Phone number is required")
    .regex(/^[\d\s+()-]{9,15}$/, "Enter a valid phone number"),
  licence_number: z.string().min(3, "Licence number is required").max(40),
  licence_country: z.enum(["ZW", "ZA"]),
  licence_classes: z.array(z.enum(LICENCE_CLASSES)).default([]),
  licence_issued_at: optionalDate,
  licence_expires_at: optionalDate,
  defensive_driving_cert_at: optionalDate,
  medical_cert_expires_at: optionalDate,
  home_address: z.string().max(500).nullable().optional().or(z.literal("")),
  next_of_kin_name: z.string().max(120).nullable().optional().or(z.literal("")),
  next_of_kin_phone: z
    .string()
    .max(20)
    .nullable()
    .optional()
    .or(z.literal("")),
});

export type MyProfileInput = z.infer<typeof myProfileSchema>;
