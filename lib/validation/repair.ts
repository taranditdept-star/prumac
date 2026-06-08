import { z } from "zod";
import { uuid } from "./uuid";

export const repairClaimCreateSchema = z.object({
  vehicle_id: uuid(),
  subsidiary_id: uuid().nullable().optional(),
  description: z.string().min(5, "Describe the repair").max(1000),
  amount: z.coerce.number().min(0.01, "Enter the amount spent").max(1_000_000),
  currency: z.string().min(1).max(8).default("USD"),
  odometer_km: z.coerce.number().int().min(0).max(9_999_999).nullable().optional(),
});

export const repairClaimApproveSchema = z.object({
  claim_id: uuid(),
  reimburse_subsidiary_id: uuid(),
  notes: z.string().max(1000).nullable().optional(),
});

export const repairClaimRejectSchema = z.object({
  claim_id: uuid(),
  notes: z.string().min(3, "Give a reason for rejecting").max(1000),
});

export type RepairClaimCreateInput = z.infer<typeof repairClaimCreateSchema>;
