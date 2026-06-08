import { z } from "zod";
import { uuid } from "./uuid";

const DOCUMENT_TYPES = [
  "license_disc",
  "insurance",
  "fitness",
  "registration",
  "cross_border",
] as const;

const INSURANCE_TYPES = [
  "third_party",
  "full_cover",
  "champions",
  "old_mutual_full_cover",
  "miway_full_cover",
  "other",
] as const;

// Base object (no refinement) so it can be reused with .partial()/.extend().
// Zod v4 forbids .partial() on a schema that already carries a .refine().
const documentBase = z.object({
  vehicle_id: uuid(),
  document_type: z.enum(DOCUMENT_TYPES),
  insurance_type: z.enum(INSURANCE_TYPES).nullable().optional(),
  document_number: z.string().max(60).nullable().optional(),
  issuer: z.string().max(100).nullable().optional(),
  issued_at: z.string().nullable().optional(),
  expires_at: z.string().min(1, "Expiry date is required"),
  policy_amount: z.number().positive().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const requireInsuranceType = (d: { document_type?: string; insurance_type?: unknown }) =>
  d.document_type !== "insurance" || d.insurance_type != null;
const insuranceTypeError = {
  message: "Insurance type is required for insurance documents",
  path: ["insurance_type"],
};

export const documentSchema = documentBase.refine(requireInsuranceType, insuranceTypeError);

export const documentUpdateSchema = documentBase
  .partial()
  .extend({ id: uuid(), vehicle_id: uuid() })
  .refine(requireInsuranceType, insuranceTypeError);

export type DocumentInput = z.infer<typeof documentSchema>;
export type DocumentUpdateInput = z.infer<typeof documentUpdateSchema>;
