import { z } from "zod";

// subsidiary_id is kept loose (not z.string().uuid()) because the seeded
// subsidiary ids are not RFC-strict UUIDs — see lib/validation/uuid.ts.
export const staffCreateSchema = z.object({
  full_name: z.string().trim().min(2, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(160),
  role: z.enum(["fleet_manager", "subsidiary_billing", "admin"]),
  subsidiary_id: z.string().trim().min(1).optional().nullable(),
});

export const driverLoginCreateSchema = z.object({
  full_name: z.string().trim().min(2, "Name is required").max(120),
  subsidiary_id: z.string().trim().min(1).optional().nullable(),
});

export type StaffCreateInput = z.infer<typeof staffCreateSchema>;
export type DriverLoginCreateInput = z.infer<typeof driverLoginCreateSchema>;
